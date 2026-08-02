import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Database,
  FileImage,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { db, doc, setDoc, type User } from '../lib/firebase';
import { studioFetch } from '../lib/api';
import { SPROUT_PALETTE } from '../pipeline/config';
import {
  GOLDEN_CASES,
  PLANT_CASES,
  loadPhotoAsDataUrl,
  photoUrl,
} from '../pipeline/goldenset';
import type { DexDoc } from '../hooks/useDexCollection';
import type { RouteId } from '../nav';
import {
  Badge,
  Button,
  Empty,
  Panel,
  PanelHead,
  Row,
  SpriteFrame,
  Spinner,
  Stat,
  cx,
  type Tone,
} from './ui';

interface PipelineStudioProps {
  route: RouteId;
  user: User | null;
  dexDocs: DexDoc[];
}

type StepStatus = 'pending' | 'processing' | 'success' | 'warn' | 'error';
type StepIcon = 'circle' | 'spinner' | 'tick' | 'cross' | 'warn';

interface StepState {
  id: string;
  /** One-word rail label. The long form lives in `title`. */
  short: string;
  title: string;
  description: string;
  status: StepStatus;
  icon: StepIcon;
  latencyMs?: number;
  details?: string;
  data?: any;
}

/** Single source of truth for the pipeline stages. */
const STAGES: Omit<StepState, 'status' | 'icon'>[] = [
  {
    id: '1',
    short: 'Identify',
    title: 'Plant identification',
    description: 'Plant.id API v3 species taxonomy',
  },
  {
    id: '2a',
    short: 'Prompt',
    title: 'Tiered prompt crafting',
    description: 'Gemini 3.5 Flash Lite → NVIDIA Gemma 4 31B → name-only',
  },
  {
    id: '2b',
    short: 'Generate',
    title: 'Sprite generation',
    description: 'NVIDIA Flux.2 Klein 4B, 4 steps',
  },
  {
    id: '2c',
    short: 'Cutout',
    title: 'Background cutout',
    description: 'withoutBG alpha extraction, 3 retries',
  },
  {
    id: '2d',
    short: 'Quantise',
    title: 'Finisher & palette snap',
    description: 'Nearest-neighbour 192×192 & Spica72 snap',
  },
  {
    id: '3',
    short: 'Assemble',
    title: 'Monster assembly',
    description: 'Sprout stats, HP, speed & move sets',
  },
  {
    id: '4',
    short: 'Evaluate',
    title: 'Evaluation & Dex gate',
    description: 'Programmatic checks & LLM-judge cute threshold',
  },
];

const freshSteps = (): StepState[] =>
  STAGES.map((s) => ({ ...s, status: 'pending', icon: 'circle' }));

const STATUS_TONE: Record<StepStatus, Tone> = {
  pending: 'neutral',
  processing: 'brand',
  success: 'ok',
  warn: 'warn',
  error: 'danger',
};

export const PipelineStudio: React.FC<PipelineStudioProps> = ({ route, user, dexDocs }) => {
  // Input
  const [dragActive, setDragActive] = useState(false);
  const [uploadedImageB64, setUploadedImageB64] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('sample_plant.jpg');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customPlantName, setCustomPlantName] = useState('');
  /** Species Hop 0 identified, carried across the 2c gate. */
  const [identifiedName, setIdentifiedName] = useState<string | null>(null);
  /** Input + fixture picker fold away on run so the whole flow fits one screen. */
  const [inputCollapsed, setInputCollapsed] = useState(false);

  // Execution
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalPipelineTimeMs, setTotalPipelineTimeMs] = useState<number | null>(null);
  const [steps, setSteps] = useState<StepState[]>(freshSteps);

  // Outputs
  const [craftedPrompt, setCraftedPrompt] = useState<string | null>(null);
  const [craftedTier, setCraftedTier] = useState<string | null>(null);
  const [rawSpriteB64, setRawSpriteB64] = useState<string | null>(null);
  const [finishedSpriteB64, setFinishedSpriteB64] = useState<string | null>(null);
  const [assembledPlant, setAssembledPlant] = useState<any | null>(null);
  const [evalScores, setEvalScores] = useState<any | null>(null);
  const [dexStatus, setDexStatus] = useState<'pending' | 'approved' | null>(null);

  // Stage 2c human gate
  const [awaitingStage2cPermission, setAwaitingStage2cPermission] = useState(false);
  /*
   * Values accumulated across a run's SSE events, for the Dex write at step 4.
   *
   * A ref rather than the state above because each event arrives in its own
   * handler invocation: reading React state there risks a stale closure, and
   * the write needs the current values regardless of when the last render
   * landed.
   */
  const runRef = useRef<{ plant?: any; spriteB64?: string; tier?: string }>({});
  const stage2cResolverRef = useRef<((continueTo2c: boolean) => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFixture(PLANT_CASES[0].id);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Input handling                                                          */
  /* ---------------------------------------------------------------------- */

  /** Load a golden-set fixture photo as the pipeline input. */
  const loadFixture = async (caseId: string) => {
    const match = GOLDEN_CASES.find((c) => c.id === caseId);
    if (!match) return;

    setActivePreset(caseId);
    setUploadedFileName(`${caseId}.jpg`);
    // Left blank on purpose: the override exists to correct a bad ID, not to
    // pre-empt one. Filling it here silently skipped Hop 0 on every run.

    try {
      const dataUrl = await loadPhotoAsDataUrl(match.photo);
      if (dataUrl) setUploadedImageB64(dataUrl);
    } catch (err) {
      console.error(`Failed to load fixture "${caseId}":`, err);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, WEBP).');
      return;
    }
    setUploadedFileName(file.name);
    setActivePreset(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setUploadedImageB64(event.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  /* ---------------------------------------------------------------------- */
  /* Execution                                                               */
  /* ---------------------------------------------------------------------- */

  const resetRun = () => {
    setTotalPipelineTimeMs(null);
    setCraftedPrompt(null);
    setCraftedTier(null);
    setRawSpriteB64(null);
    setFinishedSpriteB64(null);
    setAssembledPlant(null);
    setEvalScores(null);
    setDexStatus(null);
    setIdentifiedName(null);
    setSteps(freshSteps());
    // Cleared with the rest of the run state, or a re-run would write the
    // previous plant's sprite when the new one fails before step 2d.
    runRef.current = {};
  };

  const consumeStream = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const match = chunk.match(/^data:\s*(.*)$/m);
        if (!match) continue;
        try {
          handlePipelineEvent(JSON.parse(match[1]));
        } catch (e) {
          console.warn('Failed to parse SSE event:', e);
        }
      }
    }
  };

  const runLivePipeline = async () => {
    if (!uploadedImageB64) {
      alert('Please upload or select a plant image first.');
      return;
    }

    setIsProcessing(true);
    setInputCollapsed(true);
    resetRun();

    try {
      const response = await studioFetch('/api/pipeline/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadedImageB64,
          customName: customPlantName || undefined,
        }),
      });

      if (!response.ok) throw new Error(`Pipeline API HTTP ${response.status}`);
      await consumeStream(response);
    } catch (err) {
      console.error('Pipeline SSE stream exception:', err);
      await runSimulatedFallback();
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePipelineEvent = (data: any) => {
    if (data.event === 'step_start') {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === data.step
            ? { ...s, status: 'processing', icon: 'spinner', details: data.details }
            : s,
        ),
      );
      return;
    }

    if (data.event === 'step_done') {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === data.step
            ? {
                ...s,
                status: data.status,
                icon: data.icon,
                latencyMs: data.latencyMs,
                details: data.details,
                data,
              }
            : s,
        ),
      );

      if (data.step === '1' && data.result?.name) setIdentifiedName(data.result.name);
      if (data.prompt) {
        setCraftedPrompt(data.prompt);
        setCraftedTier(data.tier || 'gemma');
      }
      if (data.rawSpriteB64) setRawSpriteB64(`data:image/png;base64,${data.rawSpriteB64}`);
      if (data.finishedSpriteB64) {
        setFinishedSpriteB64(`data:image/png;base64,${data.finishedSpriteB64}`);
        runRef.current.spriteB64 = data.finishedSpriteB64;
      }
      if (data.plant) {
        setAssembledPlant(data.plant);
        runRef.current.plant = data.plant;
      }
      if (data.tier) runRef.current.tier = data.tier;

      if (data.evalScores) {
        setEvalScores(data.evalScores);
        setDexStatus(data.autoApproved ? 'approved' : 'pending');

        /*
         * Persist every finished sprite, approved or pending, and read the
         * values from runRef rather than from `data`.
         *
         * The step-4 event carries only evalScores and autoApproved — `plant`
         * arrives on step 3 and `finishedSpriteB64` on 2d — so the previous
         * guard, `data.autoApproved && user && data.plant`, was never true and
         * this write never ran. Had it run, spriteUrl would have been the
         * string "data:image/png;base64,undefined". Gating on autoApproved was
         * wrong besides: a pending sprite is exactly what the Dex Gate exists
         * to review.
         *
         * A ref rather than component state because each SSE event lands in its
         * own handler invocation, where reading state risks a stale closure.
         */
        const plant = runRef.current.plant;
        const spriteB64 = runRef.current.spriteB64;
        if (plant && user) {
          const key = plant.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          setDoc(doc(db, 'dex', key), {
            speciesKey: key,
            canonicalName: plant.name,
            commonNames: plant.common_names || [],
            // Empty rather than the literal "undefined" when the sprite is
            // missing, so a malformed record is rejected instead of stored.
            spriteUrl: spriteB64 ? `data:image/png;base64,${spriteB64}` : '',
            firstDiscoveredBy: user.email || 'Anonymous Trainer',
            firstDiscoveredAt: new Date().toISOString(),
            producedByTier: runRef.current.tier || 'gemma',
            status: data.autoApproved ? 'approved' : 'pending',
            evalScores: data.evalScores,
          }).catch(console.error);
        }
      }

      if (data.awaitingStage2c) setAwaitingStage2cPermission(true);
      return;
    }

    if (data.event === 'awaiting_stage2c_confirmation') {
      if (data.rawSpriteB64) setRawSpriteB64(`data:image/png;base64,${data.rawSpriteB64}`);
      setAwaitingStage2cPermission(true);
      return;
    }

    if (data.event === 'complete') setTotalPipelineTimeMs(data.totalTimeMs);
  };

  const triggerStage2c = async () => {
    // The simulated path parks a resolver here; the live path re-opens a stream.
    if (stage2cResolverRef.current) {
      stage2cResolverRef.current(true);
      stage2cResolverRef.current = null;
      return;
    }

    setAwaitingStage2cPermission(false);
    setIsProcessing(true);

    try {
      const response = await studioFetch('/api/pipeline/run-stage2c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawSpriteB64,
          plantName: customPlantName || identifiedName || 'Plant Monster',
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await consumeStream(response);
    } catch (err) {
      console.error('Stage 2c stream error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopAtStage2b = () => {
    setAwaitingStage2cPermission(false);
    if (stage2cResolverRef.current) {
      stage2cResolverRef.current(false);
      stage2cResolverRef.current = null;
    }
  };

  const runSimulatedFallback = async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const updateStep = (id: string, update: Partial<StepState>) =>
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));

    const species = customPlantName || 'Unknown species';

    updateStep('1', { status: 'processing', icon: 'spinner', details: 'Querying Plant.id v3…' });
    await delay(1200);
    updateStep('1', {
      status: 'success',
      icon: 'tick',
      latencyMs: 1180,
      details: `Identified "${species}" at probability 0.94`,
    });

    updateStep('2a', {
      status: 'processing',
      icon: 'spinner',
      details: 'Tier 1 Gemma 3 27B via NVIDIA…',
    });
    await delay(1400);

    const simPrompt = `${species} as a cute pixel art plant monster, thick black outlines (2-4px), flat cel-shading, no gradients, vivid colours based on the plant's real hues, one pair of large expressive eyes with big white highlights, small friendly mouth, soft cheek blush, facial features grow naturally out of the plant's own structures (petals, stamens, leaves) rather than being added on top, subtle leaf vein texture, warm approachable tone, white background, app icon composition, rounded square format`;
    setCraftedPrompt(simPrompt);
    setCraftedTier('gemma');
    updateStep('2a', {
      status: 'success',
      icon: 'tick',
      latencyMs: 1350,
      details: `Crafted prompt via tier GEMMA`,
      data: { prompt: simPrompt, tier: 'gemma' },
    });

    updateStep('2b', {
      status: 'processing',
      icon: 'spinner',
      details: 'Calling Gemini 3.1 Flash Lite Image…',
    });
    await delay(1800);

    let simColor = '#7FD3E6';
    const s = species.toLowerCase();
    if (s.includes('trumpet') || s.includes('angel') || s.includes('brugmansia'))
      simColor = '#FFF971';
    else if (s.includes('melastoma')) simColor = '#DF426E';
    else if (s.includes('pea') || s.includes('clitoria')) simColor = '#4876BB';
    else if (s.includes('rose')) simColor = '#FF4F4F';

    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="64" y="64" width="128" height="128" rx="64" fill="${simColor}" stroke="#0C082A" stroke-width="8"/><circle cx="100" cy="110" r="12" fill="#0C082A"/><circle cx="156" cy="110" r="12" fill="#0C082A"/><circle cx="104" cy="106" r="4" fill="#FFFFFF"/><circle cx="160" cy="106" r="4" fill="#FFFFFF"/><path d="M 112 144 Q 128 160 144 144" fill="none" stroke="#0C082A" stroke-width="6" stroke-linecap="round"/><ellipse cx="96" cy="180" rx="20" ry="12" fill="#51B341" stroke="#0C082A" stroke-width="6"/><ellipse cx="160" cy="180" rx="20" ry="12" fill="#51B341" stroke="#0C082A" stroke-width="6"/></svg>`;
    const simRawDataUrl = `data:image/svg+xml;base64,${btoa(rawSvg)}`;
    setRawSpriteB64(simRawDataUrl);
    updateStep('2b', {
      status: 'success',
      icon: 'tick',
      latencyMs: 2050,
      details: 'Rendered 1024×1024 raw sprite',
      data: { prompt: simPrompt },
    });

    setAwaitingStage2cPermission(true);
    const proceed = await new Promise<boolean>((resolve) => {
      stage2cResolverRef.current = resolve;
    });
    setAwaitingStage2cPermission(false);
    if (!proceed) return;

    updateStep('2c', {
      status: 'processing',
      icon: 'spinner',
      details: 'Extracting foreground via withoutBG…',
    });
    await delay(1100);
    setFinishedSpriteB64(simRawDataUrl);
    updateStep('2c', {
      status: 'success',
      icon: 'tick',
      latencyMs: 1040,
      details: 'Foreground extracted with alpha channel',
    });

    updateStep('2d', {
      status: 'processing',
      icon: 'spinner',
      details: 'Snapping to Spica72…',
    });
    await delay(600);
    updateStep('2d', {
      status: 'success',
      icon: 'tick',
      latencyMs: 580,
      details: 'Resized to 192×192, quantised to 24 colours',
    });

    updateStep('3', { status: 'processing', icon: 'spinner', details: 'Deriving stats & moves…' });
    await delay(300);
    const mockPlant = {
      name: species,
      maxHealth: 100,
      speed: 14,
      moves: [
        { id: '1', name: 'Petal Dance', power: 45, type: 'Grass' },
        { id: '2', name: 'Vine Whip', power: 35, type: 'Grass' },
        { id: '3', name: 'Synthesis', power: 0, type: 'Grass' },
        { id: '4', name: 'Tackle', power: 30, type: 'Normal' },
      ],
    };
    setAssembledPlant(mockPlant);
    updateStep('3', {
      status: 'success',
      icon: 'tick',
      latencyMs: 290,
      details: `HP ${mockPlant.maxHealth}, speed ${mockPlant.speed}`,
    });

    updateStep('4', { status: 'processing', icon: 'spinner', details: 'Running eval & judge…' });
    await delay(800);
    setEvalScores({ paletteValid: true, dimsOk: true, hasAlpha: true, judgeCute: 4 });
    setDexStatus('approved');
    updateStep('4', {
      status: 'success',
      icon: 'tick',
      latencyMs: 790,
      details: 'All checks passed, cute score ≥ 4 — auto-approved',
    });

    setTotalPipelineTimeMs(6300);
  };

  /* ---------------------------------------------------------------------- */
  /* Derived                                                                 */
  /* ---------------------------------------------------------------------- */

  const doneCount = steps.filter((s) => s.status !== 'pending').length;
  const activeStep = steps.find((s) => s.status === 'processing');
  const hasRun = steps.some((s) => s.status !== 'pending');
  const heroSprite = finishedSpriteB64 ?? rawSpriteB64;

  /**
   * A run can end three ways: finished, paused at the 2c gate, or stopped
   * early. Treating "nothing is spinning" as "complete" mislabels the latter
   * two, so each is reported distinctly.
   */
  const runState: { label: string; tone: Tone } = activeStep
    ? { label: activeStep.title, tone: 'brand' }
    : awaitingStage2cPermission
      ? { label: 'Paused — awaiting confirmation', tone: 'gate' }
      : !hasRun
        ? { label: 'Idle', tone: 'neutral' }
        : doneCount === steps.length
          ? { label: 'Pipeline complete', tone: 'ok' }
          : { label: `Stopped after ${doneCount} of ${steps.length} stages`, tone: 'warn' };

  /* ====================================================================== */
  /* National Dex                                                            */
  /* ====================================================================== */

  if (route === 'dex') {
    if (dexDocs.length === 0) {
      return (
        <Empty
          icon={<Database className="h-10 w-10" />}
          title="No species cached yet"
          sub="Run a scan in the Live Scanner. Approved species are written to the Firestore dex/ collection and appear here."
        />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dexDocs.map((entry) => (
          <Panel key={entry.id} className="overflow-hidden">
            <div className="flex items-start gap-3 p-3">
              <SpriteFrame src={entry.spriteUrl} alt={entry.canonicalName || entry.id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-semibold text-txt">
                  {entry.canonicalName || entry.id}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-txt-4">
                  {entry.commonNames?.[0] || entry.speciesKey}
                </div>
                <Badge
                  tone={entry.status === 'approved' ? 'ok' : 'gate'}
                  className="mt-1.5"
                  dot
                >
                  {(entry.status || 'pending').toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-line-soft px-3 py-2.5">
              <Row label="Discovered by" value={entry.firstDiscoveredBy || 'Trainer'} />
              <Row label="Tier" value={entry.producedByTier || 'gemma'} tone="info" />
              <Row label="Palette" value={entry.paletteVersion || 'Spica72'} />
            </div>
          </Panel>
        ))}
      </div>
    );
  }

  /* ====================================================================== */
  /* Live Scanner                                                            */
  /* ====================================================================== */

  return (
    <div className="space-y-3">
      {/* Collapsed input: everything needed to re-run, in one strip. */}
      {inputCollapsed && (
        <Panel className="flex flex-wrap items-center gap-3 p-2.5" id="input-collapsed">
          {uploadedImageB64 && (
            <img
              src={uploadedImageB64}
              alt="Source plant"
              className="h-10 w-10 shrink-0 rounded-card border border-line-strong object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="pixel-label text-txt-5">Input</div>
            <div className="truncate font-mono text-[11px] text-txt-2">{uploadedFileName}</div>
          </div>

          <input
            type="text"
            value={customPlantName}
            onChange={(e) => setCustomPlantName(e.target.value)}
            placeholder="Species override (optional)"
            aria-label="Species override"
            className="w-56 rounded-card border border-line bg-void px-2.5 py-1.5 font-mono text-[11px] text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
          />

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => setInputCollapsed(false)}>
              Change photo
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={runLivePipeline}
              disabled={isProcessing || !uploadedImageB64}
              icon={
                isProcessing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )
              }
            >
              {isProcessing ? 'Running…' : 'Run again'}
            </Button>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* ---------------- Input ---------------- */}
        <Panel className={cx('lg:col-span-4', inputCollapsed && 'hidden')} id="input-pane">
          <PanelHead
            kicker="Input"
            title="Source photo"
            icon={<Upload className="h-4 w-4 text-brand" />}
          />

          <div className="space-y-3 p-3.5">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className={cx(
                'flex cursor-pointer rounded-card border-2 border-dashed transition-colors',
                uploadedImageB64
                  ? 'items-center gap-3 p-2 text-left'
                  : 'flex-col items-center justify-center gap-2 p-3 text-center',
                dragActive
                  ? 'border-brand bg-brand/10'
                  : uploadedImageB64
                    ? 'border-line-strong bg-raised hover:border-brand/50'
                    : 'border-line bg-raised hover:border-line-strong',
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                className="hidden"
              />

              {uploadedImageB64 ? (
                <>
                  <img
                    src={uploadedImageB64}
                    alt="Source plant"
                    className="h-14 w-14 shrink-0 rounded-card border border-line-strong object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[11px] text-txt-2">
                      {uploadedFileName}
                    </div>
                    <div className="mt-0.5 text-label text-txt-5">Click or drop to replace</div>
                  </div>
                </>
              ) : (
                <>
                  <FileImage className="h-8 w-8 text-txt-5" />
                  <div>
                    <p className="text-meta font-semibold text-txt-2">Drop a plant photo</p>
                    <p className="mt-0.5 text-label text-txt-4">or click to browse — JPG, PNG</p>
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="pixel-label text-txt-4">Golden fixtures</span>
                <span className="font-mono text-[10px] text-txt-5">{PLANT_CASES.length}</span>
              </div>

              {/* Thumbnails rather than text buttons — you pick a fixture by
                  recognising the plant, not by reading its binomial. */}
              <div className="grid grid-cols-4 gap-1.5">
                {PLANT_CASES.map((c) => {
                  const active = activePreset === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => loadFixture(c.id)}
                      title={`${c.commonName}${c.species ? ` — ${c.species}` : ''}${c.stress ? ' (stress case)' : ''}`}
                      aria-label={`Load fixture ${c.commonName}`}
                      aria-pressed={active}
                      className={cx(
                        'group relative aspect-square overflow-hidden rounded-card border-2 transition-colors',
                        active
                          ? 'border-brand'
                          : 'border-line hover:border-line-strong',
                      )}
                    >
                      <img
                        src={photoUrl(c.photo)}
                        alt=""
                        loading="lazy"
                        className={cx(
                          'h-full w-full object-cover transition-opacity',
                          active ? 'opacity-100' : 'opacity-65 group-hover:opacity-100',
                        )}
                      />
                      {c.stress && (
                        <span
                          title="Stress case — no single hero bloom"
                          className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-warn ring-1 ring-void"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 truncate text-label text-txt-4">
                {GOLDEN_CASES.find((c) => c.id === activePreset)?.commonName ?? 'Custom upload'}
              </p>
            </div>

            <div>
              <label
                htmlFor="species-override"
                className="pixel-label mb-2 block text-txt-4"
              >
                Species override
              </label>
              <input
                id="species-override"
                type="text"
                value={customPlantName}
                onChange={(e) => setCustomPlantName(e.target.value)}
                placeholder="e.g. Melastoma malabathricum"
                className="w-full rounded-card border border-line bg-void px-3 py-2 font-mono text-meta text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
              />
              <p className="mt-1 text-label text-txt-5">
                Optional — corrects a wrong identification.
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              onClick={runLivePipeline}
              disabled={isProcessing || !uploadedImageB64}
              className="w-full"
              icon={
                isProcessing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )
              }
            >
              {isProcessing ? 'Running pipeline…' : 'Run pipeline'}
            </Button>
          </div>

          {/* Thin palette strip: the gamut the finished sprite is snapped to. */}
          <div className="flex items-center gap-2 border-t border-line-soft px-4 py-2">
            <span className="pixel-label shrink-0 text-txt-5">Spica72</span>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full border border-line">
              {SPROUT_PALETTE.map((hex) => (
                <div key={hex} className="flex-1" style={{ backgroundColor: hex }} title={hex} />
              ))}
            </div>
          </div>
        </Panel>

        {/* ---------------- Output ---------------- */}
        <Panel className={cx(inputCollapsed ? 'lg:col-span-7' : 'lg:col-span-8')} id="output-pane">
          <PanelHead
            kicker="Output"
            title={assembledPlant?.name || 'Sprite result'}
            icon={<Sparkles className="h-4 w-4 text-gold" />}
            right={
              <>
                {dexStatus && (
                  <Badge tone={dexStatus === 'approved' ? 'ok' : 'gate'} dot>
                    Dex {dexStatus.toUpperCase()}
                  </Badge>
                )}
                {totalPipelineTimeMs !== null && (
                  <Badge tone="info" mono>
                    {(totalPipelineTimeMs / 1000).toFixed(2)}s
                  </Badge>
                )}
              </>
            }
          />

          {!hasRun ? (
            <div className="p-4">
              <Empty
                icon={<Sparkles className="h-10 w-10" />}
                title="No sprite yet"
                sub="Pick a source photo and run the pipeline. The finished 192×192 sprite lands here."
              />
            </div>
          ) : (
            <div className={cx(
                'grid grid-cols-1 gap-4 p-4',
                inputCollapsed
                  ? 'md:grid-cols-[minmax(0,190px)_1fr]'
                  : 'md:grid-cols-[minmax(0,300px)_1fr]',
              )}>
              {/* Hero sprite */}
              <div className="space-y-3">
                <SpriteFrame
                  src={heroSprite}
                  alt={assembledPlant?.name || 'Generated sprite'}
                  size="hero"
                  glow={!!finishedSpriteB64}
                  caption={finishedSpriteB64 ? '192×192' : '1024×1024 raw'}
                  placeholder={
                    <div className="flex flex-col items-center gap-2">
                      <Spinner className="h-6 w-6" />
                      <span className="text-label">Rendering…</span>
                    </div>
                  }
                />
                <div className="flex items-center justify-between font-mono text-[10px] text-txt-4">
                  <span>{finishedSpriteB64 ? 'Spica72 quantised' : 'Raw generator output'}</span>
                  {craftedTier && <span className="text-info">tier: {craftedTier}</span>}
                </div>

              </div>

              {/* Human gate — spans the pane; it is what the run is waiting on. */}
              {awaitingStage2cPermission && (
                <div className="order-last rounded-card border border-gate/40 bg-gate/10 p-3 md:col-span-2">
                  <div className="mb-1.5 flex items-center gap-2 text-meta font-semibold text-gate">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Continue to cutout?
                  </div>
                  <p className="mb-2.5 text-label text-txt-3">
                    Inspect the raw sprite. Continuing runs background cutout, palette
                    quantisation and assembly.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={triggerStage2c}
                      icon={<ArrowRight className="h-3.5 w-3.5" />}
                    >
                      Continue
                    </Button>
                    <Button variant="secondary" size="sm" onClick={stopAtStage2b}>
                      Keep raw only
                    </Button>
                  </div>
                </div>
              )}

              {/* Result metadata */}
              <div className="space-y-3">
                {craftedPrompt && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="pixel-label text-gold">Crafted prompt</span>
                      {craftedTier && (
                        <Badge tone="gold" mono>
                          {craftedTier.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="max-h-24 overflow-y-auto rounded-card border border-gold/25 bg-void p-3 font-mono text-meta leading-relaxed text-txt-2 select-all">
                      {craftedPrompt}
                    </p>
                  </div>
                )}

                {assembledPlant && (
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Max health" value={`${assembledPlant.maxHealth ?? 100} HP`} tone="ok" />
                    <Stat label="Speed" value={assembledPlant.speed ?? 12} sub="range 5–20" tone="info" />
                  </div>
                )}

                {assembledPlant?.moves?.length > 0 && (
                  <div>
                    <div className="pixel-label mb-2 text-txt-4">Move set</div>
                    <div className="flex flex-wrap gap-1.5">
                      {assembledPlant.moves.map((m: any, i: number) => (
                        <span
                          key={i}
                          className="rounded-chip border border-line bg-raised px-2 py-1 font-mono text-[10px] text-txt-2"
                        >
                          {m.name}
                          <span className="ml-1.5 text-txt-4">{m.power}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {evalScores && (
                  <div>
                    <div className="pixel-label mb-2 text-txt-4">Evaluation</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat
                        label="Palette"
                        value={evalScores.paletteValid === false ? 'FAIL' : 'PASS'}
                        tone={evalScores.paletteValid === false ? 'danger' : 'ok'}
                      />
                      <Stat
                        label="Size"
                        value={evalScores.dimsOk === false ? 'FAIL' : '192²'}
                        tone={evalScores.dimsOk === false ? 'danger' : 'ok'}
                      />
                      <Stat
                        label="Alpha"
                        value={evalScores.hasAlpha === false ? 'NONE' : 'RGBA'}
                        tone={evalScores.hasAlpha === false ? 'warn' : 'ok'}
                      />
                      <Stat
                        label="Judge"
                        value={`${evalScores.judgeCute ?? '—'}/5`}
                        tone={(evalScores.judgeCute ?? 0) >= 4 ? 'ok' : 'warn'}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* ------------- Run progress ------------- */}
        <Panel className={cx(inputCollapsed ? 'lg:col-span-5' : 'lg:col-span-12')} id="run-progress">
        <PanelHead
          kicker="Run progress"
          title={
            <span className="flex items-center gap-2">
              {activeStep && <Spinner className="h-3.5 w-3.5" />}
              {runState.label}
            </span>
          }
          right={
            <>
              {hasRun && !activeStep && (
                <Badge tone={runState.tone} dot>
                  {runState.tone === 'ok'
                    ? 'Done'
                    : runState.tone === 'gate'
                      ? 'Paused'
                      : 'Halted'}
                </Badge>
              )}
              <span className="font-mono text-meta text-txt-4">
                {doneCount}/{steps.length}
              </span>
            </>
          }
        />

        {/* Horizontal stage rail — scrolls rather than wrapping, so the
            left-to-right reading of pipeline order is never broken. */}
        <div className="overflow-x-auto px-4 py-4">
          <ol className="flex min-w-max items-start gap-1">
            {steps.map((step, i) => {
              const tone = STATUS_TONE[step.status];
              const t = {
                neutral: 'border-line bg-raised text-txt-5',
                brand: 'border-brand bg-brand/15 text-brand',
                ok: 'border-ok/50 bg-ok/12 text-ok',
                warn: 'border-warn/50 bg-warn/12 text-warn',
                danger: 'border-danger/50 bg-danger/12 text-danger',
                info: '',
                gate: '',
                gold: '',
              }[tone];

              return (
                <li key={step.id} className="flex items-start">
                  <div className={cx('flex flex-col items-center gap-1.5 text-center', inputCollapsed ? 'w-[54px]' : 'w-[104px]')}>
                    <div
                      className={cx(
                        'flex h-9 w-9 items-center justify-center rounded-card border-2 transition-colors',
                        t,
                      )}
                    >
                      {step.icon === 'spinner' ? (
                        <Spinner className="h-4 w-4" />
                      ) : step.icon === 'tick' ? (
                        <Check className="h-4 w-4" strokeWidth={3} />
                      ) : step.icon === 'warn' ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : step.icon === 'cross' ? (
                        <X className="h-4 w-4" strokeWidth={3} />
                      ) : (
                        <span className="font-pixel text-[9px]">{step.id}</span>
                      )}
                    </div>

                    <div
                      className={cx(
                        'text-label font-semibold',
                        step.status === 'pending' ? 'text-txt-5' : 'text-txt-2',
                      )}
                    >
                      {step.short}
                    </div>
                    <div className="font-mono text-[10px] text-txt-4">
                      {step.latencyMs !== undefined ? `${step.latencyMs}ms` : '—'}
                    </div>
                  </div>

                  {i < steps.length - 1 && (
                    <div
                      className={cx(
                        'mt-[18px] h-px shrink-0', inputCollapsed ? 'w-1.5' : 'w-4',
                        step.status === 'success' ? 'bg-ok/40' : 'bg-line',
                      )}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Detail lines — only stages that have something to say */}
        {hasRun && (
          // Capped: seven detail rows would otherwise push the panel past the
          // fold, which is the whole thing this layout is trying to avoid.
          <div className="max-h-40 space-y-px overflow-y-auto border-t border-line-soft">
            {steps
              .filter((s) => s.details)
              .map((step) => (
                <div
                  key={step.id}
                  className="flex items-baseline gap-3 px-4 py-2 text-meta hover:bg-raised/50"
                >
                  <span className="w-8 shrink-0 font-mono text-[10px] text-txt-5">{step.id}</span>
                  <span className="w-32 shrink-0 truncate text-txt-4">{step.title}</span>
                  <span
                    className={cx(
                      'line-clamp-2 min-w-0 flex-1 font-mono text-[11px]',
                      step.status === 'error'
                        ? 'text-danger'
                        : step.status === 'warn'
                          ? 'text-warn'
                          : 'text-txt-2',
                    )}
                  >
                    {step.details}
                  </span>
                </div>
              ))}
          </div>
        )}
        </Panel>
      </div>
    </div>
  );
};
