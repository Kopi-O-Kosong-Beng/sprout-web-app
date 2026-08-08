/** AI sprite-pipeline routes, migrated from Sprout_Dev_Platform's server.ts.
 *
 *  There they were registered directly on the app, alonga Vite middleware that
 *  served the SPA from the same process. Here they are a router like every other
 *  feature, and the client is a separate deployment.
 *
 *  Two things are deliberately scoped to this router rather than applied
 *  globally:
 *
 *   - A 20 MB JSON body limit. These endpoints take a base64 photo; the rest of
 *     the API takes small forms, and raising express.json() app-wide would widen
 *     the surface for oversized-body pressure on every other route.
 *   - Firebase auth, but NOT the admin allowlist. Running the pipeline is what
 *     the player's Scan screen does, so any verified account may call it; the
 *     operational portal at /api/platform is the admin-only half.
 */
import { Router, json } from 'express';
import type { Request, Response } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { identifyPlant, isMockIdentification } from '../pipeline/stages/identify';
import { validateUploadedImage } from '../pipeline/ingest/imageIngest';
import { craftPromptTiered } from '../pipeline/stages/promptCraft';
import { generateSprite } from '../pipeline/stages/generate';
import { removeBackgroundSafe } from '../pipeline/stages/removeBg';
import { finishSprite, cropPhoto } from '../pipeline/stages/finish';
import { assemblePlant } from '../pipeline/stages/assemble';
import { programmaticEval } from '../pipeline/eval/programmatic';
import { geminiJudgeEval } from '../pipeline/eval/judge';
import { shouldAutoApprove } from '../pipeline/eval/approve';
import {
  createDeadline,
  FLUX_TIMEOUT_MS,
  TOTAL_BUDGET_MS,
} from '../pipeline/deadline';
import { serverEnv } from '../platform/env';
import { CAPTURE_SOURCES, type CaptureSource } from '../data/capture-source';
import { persistScan, type PlantDetails } from '../services/scan-persistence';
import { resolveDiscovery } from '../services/discovery';
import createFirebaseSpriteStorage from '../services/sprite-storage';
import dexRepository from '../repositories/dex';
import avatarRepository from '../repositories/avatars';

const router = Router();

router.use(json({ limit: '20mb' }));
router.use(authMiddleware);

/**
 * How the photo reached the pipeline, as declared by the caller.
 *
 * Defaults to 'web', the conservative reading: a caller that says nothing is
 * most likely the studio, where an operator is uploading a file, and an upload
 * is a trial run that expires. The Scan screen always declares, so a real
 * camera scan is never mislabelled by this default.
 */
function readCaptureSource(body: unknown): CaptureSource {
  const declared = (body as { source?: unknown })?.source;
  return CAPTURE_SOURCES.includes(declared as CaptureSource)
    ? (declared as CaptureSource)
    : 'web';
}

/** Opens a server-sent-event stream and returns its writer. */
function openEventStream(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  return (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

/** Full run: identification through evaluation, reporting each hop as it lands. */
router.post('/run-stream', async (req: Request, res: Response) => {
  const sendEvent = openEventStream(res);

  try {
    const { imageBase64, customName } = req.body;

    /*
      The first point on the server that looks at the photo's bytes at all.
      Before this, the only check was `if (!imageBase64)` and the string went
      straight to Plant.id — so a truncated upload, a mislabelled format or a
      decompression bomb was forwarded and paid for.

      Deliberately ahead of createDeadline(): rejecting is not a pipeline run,
      and starting the total budget for work that is about to be refused would
      charge malformed input against the timing of the next real scan.
    */
    const ingest = await validateUploadedImage(imageBase64);
    if (!ingest.ok) {
      sendEvent({
        event: 'error',
        step: '1',
        error: ingest.message,
        reason: ingest.reason,
      });
      res.end();
      return;
    }

    // Bounds every hop below. Each takes its own ceiling or whatever budget is
    // left, whichever is smaller, so one slow provider degrades the optional
    // polish steps instead of killing the whole run.
    const deadline = createDeadline();

    // Step 1: Identification
    sendEvent({
      event: 'step_start',
      step: '1',
      title: '1. Plant Identification',
      details: 'Analyzing plant features via Plant.id API v3...',
    });

    const startTime1 = Date.now();
    let identification: any = await identifyPlant(
      imageBase64,
      serverEnv.plantApiKey ?? '',
      deadline
    );
    const lat1 = Date.now() - startTime1;

    let idSuccess = true;
    let idMsg = '';
    /*
     * Whether `identification.name` names a real species, which decides whether
     * the scan may share the canonical (cross-user) sprite and dex record.
     *
     * Two distinct ways it can be a placeholder:
     *  - identification failed, and the name below is a literal stand-in;
     *  - identifyPlant took its keyless mock path, which reports high
     *    confidence for a hardcoded species on every photo. That case looks
     *    like success from here, so it is asked about directly rather than
     *    inferred from the returned name.
     */
    let identifiedSpecies = !isMockIdentification(serverEnv.plantApiKey);

    if ('error' in identification || identification.needsName) {
      /*
       * Ask, rather than invent.
       *
       * This substituted "Unknown Plant Species" and carried on: a render, a
       * cutout and a judge call spent on a name nobody chose, filed in the
       * archive under a label that says nothing. The Scan screen has had a
       * dialog for this since the Android port — "Couldn't identify it
       * automatically. What would you like to call it?" — and nothing ever
       * opened it, because this branch answered the question itself.
       *
       * The run stops here and the client opens that dialog. Whatever the
       * player types comes back as customName on a second run, which the
       * override below already honours, so the naming path is the one that was
       * always intended rather than a new one.
       *
       * A caller that already supplied a name skips this entirely — the
       * question is answered.
       */
      const supplied = typeof customName === 'string' ? customName.trim() : '';
      if (!supplied) {
        sendEvent({
          event: 'needs_name',
          step: '1',
          error: identification.error || 'Could not identify this plant.',
        });
        res.end();
        return;
      }

      idSuccess = false;
      identifiedSpecies = false;
      idMsg = identification.error || 'Plant identification low confidence';
      identification = {
        name: supplied,
        probability: 0.5,
        common_names: [supplied],
        taxonomy: { Kingdom: 'Plantae' },
      };
    } else {
      idMsg = `Identified as "${identification.name}" (${(identification.probability * 100).toFixed(0)}% confidence)`;
    }

    // The UI labels this field "skips Plant.id when set", so an explicit name
    // must win over identification. Previously customName was only consulted
    // when identification *failed* — and identifyPlant's mock path (taken
    // whenever PLANT_API_KEY is absent) returns a confident hardcoded species,
    // so the override was silently discarded on every run without a key.
    const overrideName = typeof customName === 'string' ? customName.trim() : '';
    if (overrideName) {
      identification = {
        ...identification,
        name: overrideName,
        common_names: [overrideName],
        probability: 1,
      };
      idSuccess = true;
      // A name the player typed is a real species claim, not a placeholder, so
      // it goes back to being canonical even in mock mode.
      identifiedSpecies = true;
      idMsg = `Species override applied: "${overrideName}"`;
    }

    sendEvent({
      event: 'step_done',
      step: '1',
      title: '1. Plant Identification',
      status: idSuccess ? 'success' : 'warn',
      icon: idSuccess ? 'tick' : 'cross',
      latencyMs: lat1,
      details: idMsg,
      result: identification,
    });

    /*
     * The confidence gate.
     *
     * MIN_CONFIDENCE_THRESHOLD has been declared in .env, .env.example and
     * render.yaml since this pipeline was written, and nothing read it — so an
     * identification the model was 12% sure of went straight on to generation
     * like any other. That costs a render, a cutout and a judge call, and then
     * files a confidently-wrong species in the player's archive and the shared
     * dex, where it becomes the canonical sprite for that name.
     *
     * Stopping here rather than after generation is the point: the cheapest
     * moment to give up is before the expensive hops, and a second photo is a
     * far better use of the next ten seconds than a creature drawn from a
     * guess.
     *
     * Two deliberate exemptions. An explicit species override is the player
     * telling us what it is, which outranks the model. And the keyless mock
     * path reports a hardcoded 0.92 for every photo, so gating on it would be
     * gating on a fiction — identifiedSpecies already tracks exactly that.
     */
    const minConfidence = serverEnv.minConfidenceThreshold;
    if (
      idSuccess &&
      !overrideName &&
      identifiedSpecies &&
      typeof identification.probability === 'number' &&
      identification.probability < minConfidence
    ) {
      sendEvent({
        event: 'low_confidence',
        step: '1',
        // The client renders its own copy; this is the fallback and the log line.
        error:
          `Only ${(identification.probability * 100).toFixed(0)}% sure this is ` +
          `${identification.name}. Try again with a clearer photo.`,
        name: identification.name,
        probability: identification.probability,
        threshold: minConfidence,
      });
      res.end();
      return;
    }

    // Step 2a: Prompt Crafting
    sendEvent({
      event: 'step_start',
      step: '2a',
      title: '2a. Tiered Prompt Crafting',
      details: `Attempting Tier 1 ${serverEnv.geminiVisionModel}...`,
    });

    const startTime2a = Date.now();
    const promptResult = await craftPromptTiered(
      imageBase64,
      identification.name,
      serverEnv.gemmaApiKey ?? '',
      serverEnv.geminiKey ?? '',
      undefined,
      deadline
    );
    const lat2a = Date.now() - startTime2a;

    const isTier1 = promptResult.tier === 'gemini';
    sendEvent({
      event: 'step_done',
      step: '2a',
      title: '2a. Tiered Prompt Crafting',
      status: isTier1 ? 'success' : 'warn',
      icon: isTier1 ? 'tick' : 'warn',
      latencyMs: lat2a,
      details: `Used Tier: ${promptResult.tier.toUpperCase()} — Prompt: "${promptResult.prompt}"`,
      prompt: promptResult.prompt,
      tier: promptResult.tier,
    });

    // Step 2b: Sprite Generation
    sendEvent({
      event: 'step_start',
      step: '2b',
      title: '2b. Sprite Generation',
      details: `Rendering via ${
        serverEnv.imageProvider === 'gemini'
          ? serverEnv.geminiImageModel
          : 'NVIDIA Flux.2 Klein 4B'
      }...`,
    });

    const startTime2b = Date.now();
    let rawSpriteBuffer: Buffer;
    /** 'model' | 'placeholder' | 'photoCrop' — drives the reported status. */
    let renderSource: 'model' | 'placeholder' | 'photoCrop' = 'model';
    let renderError = '';
    let renderModel = 'procedural-placeholder';

    try {
      const render = await generateSprite(
        promptResult.prompt,
        {
          flux: serverEnv.fluxApiKey,
          gemini: serverEnv.geminiKey,
          geminiModel: serverEnv.geminiImageModel,
          provider: serverEnv.imageProvider,
        },
        deadline
      );
      rawSpriteBuffer = render.png;
      renderModel = render.model;
      if (!render.fromModel) renderSource = 'placeholder';
    } catch (genErr: any) {
      renderSource = 'photoCrop';
      renderError = genErr?.message ?? String(genErr);
      console.warn('Sprite render failed, dropping to Tier 4 photo crop:', renderError);
      rawSpriteBuffer = await cropPhoto(imageBase64);
    }
    const lat2b = Date.now() - startTime2b;

    /*
     * Report what actually went wrong. deadline.signal() throws when the budget
     * is already spent, so an earlier slow hop used to surface here as "Flux
     * render failed" and sent you looking at the wrong provider. Blaming Flux for
     * someone else's latency is worse than no message at all.
     */
    const budgetExhausted = renderError.includes('Ran out of time');
    const abortedMidFlight =
      renderError.includes('aborted') || renderError.includes('TimeoutError');

    // A placeholder drawing must never report success — that is precisely what
    // made "every sprite looks identical" invisible: the studio showed a green
    // tick and a 1024x1024 claim for a hand-drawn stand-in.
    const renderDetail = {
      model: `Rendered raw sprite via ${renderModel}`,
      placeholder:
        'No FLUX_API_KEY / NVIDIA_API_KEY / GEMINI_KEY configured — this is a placeholder drawing, not a generated sprite.',
      photoCrop: budgetExhausted
        ? `Ran out of the ${(TOTAL_BUDGET_MS / 1000).toFixed(0)}s route budget before the render step — an earlier hop was slow, Flux never ran. Fell back to a centre photo crop.`
        : abortedMidFlight
          ? `Render exceeded its ${(FLUX_TIMEOUT_MS / 1000).toFixed(0)}s ceiling and was aborted. Fell back to a centre photo crop. (${renderError})`
          : `Every configured image model failed: ${renderError}. Fell back to a centre photo crop.`,
    }[renderSource];

    sendEvent({
      event: 'step_done',
      step: '2b',
      title: '2b. Sprite Generation',
      status: renderSource === 'model' ? 'success' : 'warn',
      icon: renderSource === 'model' ? 'tick' : 'warn',
      latencyMs: lat2b,
      details: renderDetail,
      renderSource,
      renderModel,
      rawSpriteB64: rawSpriteBuffer.toString('base64'),
      awaitingStage2c: true,
    });

    // Pause after 2b so an operator can inspect the raw sprite before the
    // cutout runs. The game's Scan screen sends pauseAt2b:false and runs through.
    if (req.body.pauseAt2b !== false) {
      sendEvent({
        event: 'awaiting_stage2c_confirmation',
        step: '2b',
        rawSpriteB64: rawSpriteBuffer.toString('base64'),
        plantName: identification.name,
        // Echoed back on /run-stage2c: only this half of the run can tell a
        // real identification from a placeholder, and the continuation is a
        // separate request that receives nothing but the name.
        identified: identifiedSpecies,
      });
      res.end();
      return;
    }

    const tail = await runStage2cOnward(
      sendEvent,
      rawSpriteBuffer,
      identification,
      deadline,
      req.user!.uid,
      identifiedSpecies,
      readCaptureSource(req.body),
      {
        description: identification.description,
        commonNames: identification.common_names,
        bestLightCondition: identification.best_light_condition,
        bestSoilType: identification.best_soil_type,
        bestWatering: identification.best_watering,
        toxicity: identification.toxicity,
        commonUses: identification.common_uses,
        confidence: identification.probability,
      }
    );

    sendEvent({
      event: 'complete',
      finalPlant: tail.plant,
      finalSpriteB64: tail.finishedB64,
      totalTimeMs: lat1 + lat2a + lat2b + tail.elapsedMs,
      avatarId: tail.persistence.avatarId,
      saved: tail.persistence.saved,
      saveError: tail.persistence.saveError,
      discovery: tail.persistence.discovery,
    });

    res.end();
  } catch (err: any) {
    console.error('Pipeline run error:', err);
    sendEvent({ event: 'pipeline_error', error: err.message });
    res.end();
  }
});

/** Continuation from the human gate: cutout, finish, assemble, evaluate. */
router.post('/run-stage2c', async (req: Request, res: Response) => {
  const sendEvent = openEventStream(res);

  try {
    const { rawSpriteB64, plantName } = req.body;

    /*
      The second untrusted entry point, and for a while the only one left
      unguarded after the scan leg was closed.

      It is tempting to treat this as internal — the only caller is the
      studio's human gate, echoing back a sprite this server produced one
      request earlier. It is not internal. This router is behind
      authMiddleware but NOT requireSuperAdmin, so any verified account can
      POST here with anything at all, and the bytes go straight to
      Buffer.from(...,'base64') and then into sharp.

      Same rules as the scan leg, different words: there is no photo at this
      point, so "try taking the photo again" would be nonsense. Content is
      sniffed rather than trusted — the studio labels this payload
      `data:image/png` even when Flux answered with JPEG, so a validator that
      believed the declared type would reject the pipeline's own output.
    */
    const sprite = await validateUploadedImage(rawSpriteB64, 'sprite');
    if (!sprite.ok) {
      sendEvent({
        event: 'error',
        step: '2c',
        error: sprite.message,
        reason: sprite.reason,
      });
      res.end();
      return;
    }

    const cleanB64 = sprite.base64;
    const rawSpriteBuffer = Buffer.from(cleanB64, 'base64');
    const speciesName = plantName || 'Plant Monster';

    /*
     * This leg receives a name and nothing else, so it cannot re-derive whether
     * that name is a real identification. The first leg can, and puts the
     * answer on `awaiting_stage2c_confirmation` for the client to echo back.
     *
     * When it is absent (an older client), fall back to what the server *can*
     * still tell on its own: with no Plant.id key configured, every name this
     * server produced came from the mock path. That fallback can only be
     * conservative — it may scope a genuinely typed name to one user, which
     * costs a shared sprite, never a wrong one.
     */
    const identifiedSpecies =
      typeof req.body.identified === 'boolean'
        ? req.body.identified
        : !isMockIdentification(serverEnv.plantApiKey);

    // Resumed at stage 2c after the human gate, so this leg gets its own
    // budget — the wall-clock spent waiting for the user isn't the pipeline's.
    const deadline = createDeadline();
    const identification = {
      name: speciesName,
      common_names: [speciesName],
      probability: 0.95,
    };

    const tail = await runStage2cOnward(
      sendEvent,
      rawSpriteBuffer,
      identification,
      deadline,
      req.user!.uid,
      identifiedSpecies,
      readCaptureSource(req.body)
    );

    sendEvent({
      event: 'complete',
      finalPlant: tail.plant,
      finalSpriteB64: tail.finishedB64,
      totalTimeMs: tail.elapsedMs,
      avatarId: tail.persistence.avatarId,
      saved: tail.persistence.saved,
      saveError: tail.persistence.saveError,
      discovery: tail.persistence.discovery,
    });

    res.end();
  } catch (err: any) {
    console.error('Stage 2c run error:', err);
    sendEvent({ event: 'pipeline_error', error: err.message });
    res.end();
  }
});

/**
 * Hops 2c–4, shared by both entry points.
 *
 * In the original these were duplicated verbatim between the full run and the
 * post-gate continuation, which is how the two drifted: only one of them
 * reported the intermediate cutout sprite. One copy, two callers.
 */
async function runStage2cOnward(
  sendEvent: (data: unknown) => void,
  rawSpriteBuffer: Buffer,
  identification: { name: string; taxonomy?: Record<string, string> },
  deadline: ReturnType<typeof createDeadline>,
  userId: string,
  /** False when identification.name is a placeholder — see persistScan. */
  identifiedSpecies: boolean,
  /** How the photo reached us, which decides the saved record's lifetime. */
  captureSource: CaptureSource,
  /*
    What Plant.id said about the species, for the archive to keep.

    An explicit argument rather than something read off `identification`,
    because the two callers hold genuinely different things. The full run has a
    real Plant.id response. The post-gate continuation builds a stand-in
    (`probability: 0.95`, `common_names: [speciesName]`) purely to satisfy the
    downstream shape — persisting that would record a fabricated confidence and
    a common name that is just the species name again. So that leg passes
    nothing, and cannot accidentally start passing something.
  */
  details?: PlantDetails
) {
  // Step 2c: Background Removal
  sendEvent({
    event: 'step_start',
    step: '2c',
    title: '2c. Background Cutout (withoutBG)',
    details: 'Extracting foreground alpha channel via withoutBG...',
  });

  const startTime2c = Date.now();
  const removeBgResult = await removeBackgroundSafe(
    rawSpriteBuffer,
    serverEnv.withoutbgKey,
    deadline
  );
  const lat2c = Date.now() - startTime2c;

  sendEvent({
    event: 'step_done',
    step: '2c',
    title: '2c. Background Cutout',
    status: removeBgResult.removeBgOk ? 'success' : 'warn',
    icon: removeBgResult.removeBgOk ? 'tick' : 'cross',
    latencyMs: lat2c,
    details: removeBgResult.removeBgOk
      ? 'Background cutout successful with transparent alpha channel.'
      : 'WITHOUTBG_KEY missing or API unavailable; background left baked in (non-fatal).',
    removeBgOk: removeBgResult.removeBgOk,
    finishedSpriteB64: removeBgResult.png.toString('base64'),
  });

  // Step 2d: Finisher & Palette Quantization
  sendEvent({
    event: 'step_start',
    step: '2d',
    title: '2d. Finisher & Palette Quantization',
    details:
      'Resizing to 192x192 (nearest-neighbor) & snapping to Spica72 palette...',
  });

  const startTime2d = Date.now();
  // keyBackdrop only on a real cutout: on a passthrough render the white
  // background staying visible is the honest degradation the golden set pins.
  const finishedPngBuffer = await finishSprite(removeBgResult.png, {
    keyBackdrop: removeBgResult.removeBgOk,
  });
  const lat2d = Date.now() - startTime2d;
  const finishedB64 = finishedPngBuffer.toString('base64');

  sendEvent({
    event: 'step_done',
    step: '2d',
    title: '2d. Finisher & Palette Quantization',
    status: 'success',
    icon: 'tick',
    latencyMs: lat2d,
    details: 'Finished 192x192px PNG sprite with Spica72 palette colors.',
    finishedSpriteB64: finishedB64,
  });

  // Step 3: Plant Assembly
  sendEvent({
    event: 'step_start',
    step: '3',
    title: '3. Plant Monster Assembly',
    details: 'Creating stats (HP=100, speed, taxonomy moves)...',
  });

  const startTime3 = Date.now();
  const plant = assemblePlant(identification, `data:image/png;base64,${finishedB64}`);
  const lat3 = Date.now() - startTime3;

  sendEvent({
    event: 'step_done',
    step: '3',
    title: '3. Plant Monster Assembly',
    status: 'success',
    icon: 'tick',
    latencyMs: lat3,
    details: `Assembled ${plant.name}: Max HP ${plant.maxHealth}, Speed ${plant.speed}, Moves: ${plant.moves
      .map((move: { name: string }) => move.name)
      .join(', ')}`,
    plant,
  });

  // Step 4: Programmatic Eval & Judge
  sendEvent({
    event: 'step_start',
    step: '4',
    title: '4. Programmatic Evaluation & Dex Gate',
    details: 'Running palette/dimension checks & Gemini VLM cute judge...',
  });

  const startTime4 = Date.now();
  const pScores = await programmaticEval(finishedPngBuffer);
  const judgeScores = await geminiJudgeEval(
    finishedPngBuffer,
    plant.name,
    serverEnv.geminiKey ?? '',
    // Without this the judge is the one hop with no ceiling, so a slow or
    // hanging Gemini call runs past the whole route budget after every other
    // hop has respected it. The parameter is optional, which is why nothing
    // failed when the bounded judge was ported and this call site was not.
    deadline
  );

  const combinedScores = { ...pScores, ...judgeScores };
  const autoApproved = shouldAutoApprove(combinedScores, removeBgResult.removeBgOk);
  const lat4 = Date.now() - startTime4;

  sendEvent({
    event: 'step_done',
    step: '4',
    title: '4. Evaluation & Dex Gate',
    status: autoApproved ? 'success' : 'warn',
    icon: autoApproved ? 'tick' : 'warn',
    latencyMs: lat4,
    details: autoApproved
      ? 'Passed all programmatic checks & cute score >= 4. Status: APPROVED.'
      : `Saved as PENDING (Cutout OK: ${removeBgResult.removeBgOk}, Cute Judge: ${combinedScores.judgeCute || 4}/5).`,
    evalScores: combinedScores,
    autoApproved,
  });

  // Spec section E: persistence lives here, in the tail both entry points share,
  // so the human-gate route cannot produce a sprite that never gets saved.
  // finishedPngBuffer (line 374) is the source of finishedB64 — reuse it rather
  // than decoding the base64 string back into bytes.
  const persistence = await persistScan(
    {
      storage: createFirebaseSpriteStorage(),
      dex: dexRepository,
      avatars: avatarRepository,
      resolveDiscovery,
    },
    userId,
    identification.name,
    identification.taxonomy?.family ?? null,
    finishedPngBuffer,
    {
      identified: identifiedSpecies,
      source: captureSource,
      /* Only for a real identification: on the placeholder path the species
         name is a stand-in, so care notes attached to it would describe a
         plant the player did not scan — worse than showing nothing. */
      details: identifiedSpecies ? details : undefined,
    }
  );

  return {
    plant,
    finishedB64,
    elapsedMs: lat2c + lat2d + lat3 + lat4,
    persistence,
  };
}

export default router;
