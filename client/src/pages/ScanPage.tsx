import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { CaptureBadge, StatGrid, type PlantAvatarData } from '../components/common/PlantVisuals';
import { streamPipeline, type PipelineEvent } from '../services/pipelineStream';
import { getAvatar } from '../services/sproutApi';
import { toPlantAvatarData } from '../utils/avatarPresentation';

/**
 * Scan screen — ported from plantemon-web's (app)/scan/page.tsx, itself a port
 * of the Android ui/ScanActivity.java + layout/activity_scan.xml.
 *
 * plantemon-web called its own /api/identify and /api/sprite routes. Here the
 * work is done by the sprite pipeline migrated from Sprout_Dev_Platform, which
 * runs all four hops behind one streaming endpoint and reports each as it
 * lands — so the stepper below shows real observed transitions rather than a
 * timer, which is what the original had to fake.
 *
 * Camera handling is the part that differs most from Android. Two input paths
 * are offered:
 *  - a live getUserMedia preview, when the browser grants it
 *  - a file input with `capture="environment"`, which opens the camera app
 *    directly and is the reliable path on iOS
 * The Android "test image" button is kept as a third path, so the pipeline can
 * be exercised without a real plant to hand.
 */

/**
 * How the photo reached the pipeline, which is what decides whether the saved
 * plant is kept or expires.
 *
 * The camera — live preview or the OS camera app — means someone stood in front
 * of a real plant, so it is an IRL scan and the record is permanent. A file off
 * disk could be any picture of anything, so it is a web upload: playable and
 * battleable, but gone in 24 hours. The server enforces this; the two values
 * here are just the two buttons.
 */
type CaptureSource = 'mobile' | 'web';

/** The client-visible stages of a scan, in order. */
type ScanStep = 'identify' | 'sprite' | 'finish';

/**
 * The `discovery` block of the pipeline's `complete` event.
 *
 * Exported so ScanPage.test.tsx types its fixture against the very shape this
 * page reads — the two used to be able to drift, and did.
 *
 * `discoveryCount` counts *scans*, not people: the dex increments it on every
 * scan, including repeats by the same user (server/repositories/dex.ts). One
 * person scanning a fern five times makes it 5, so it must never be labelled as
 * a number of explorers.
 */
export interface ScanDiscovery {
  firstDiscoveredByName: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
  isFirstDiscoverer: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; step: ScanStep; plantName?: string; detail?: string }
  | { kind: 'naming'; photo: string; source: CaptureSource }
  | {
      kind: 'done';
      sprite: string;
      name: string;
      source: CaptureSource;
      avatarId: string | null;
      saved: boolean;
      saveError?: string;
      discovery: ScanDiscovery | null;
    }
  | { kind: 'error'; message: string };

/** Maps a pipeline hop id onto the three stages the player is shown. */
const STEP_FOR_HOP: Record<string, ScanStep> = {
  '1': 'identify',
  '2a': 'sprite',
  '2b': 'sprite',
  '2c': 'finish',
  '2d': 'finish',
  '3': 'finish',
  '4': 'finish',
};

const MAX_IMAGE_EDGE = 1024;

/** UC6 alt-flow 2a: accepted upload formats and the 5 MB size ceiling. Client
 *  side only — the server remains authoritative and checks magic bytes, not
 *  just this declared MIME type. Decimal MB (1000 x 1000), matching what
 *  Finder/most file browsers report as a file's size in MB — using the
 *  binary 1024 x 1024 reading here let some 5.x MB files slip under a
 *  "5 MB" cap that looked, to the user, like it should have caught them. */
const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 5 * 1000 * 1000;

function validateUploadFile(file: File): string | null {
  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
    return 'Please upload a JPEG, PNG, or WEBP image.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'That file is too large — the maximum size is 5 MB.';
  }
  return null;
}

/** Downscales to a JPEG data URL — the shape the pipeline endpoint expects. */
async function fileToJpegDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read that image.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Grabs the current video frame at the same ceiling. */
function captureFrame(video: HTMLVideoElement): string {
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight)
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function ScanPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  // The pipeline's `complete` event only carries `maxHealth`/`speed` (from
  // assemblePlant, no attack/defense at all) — the real, complete stats live
  // on the AvatarRecord that persistScan already wrote. Fetched separately via
  // the existing GET /api/avatar/:avatarId once we have an id, rather than
  // widening the SSE payload.
  const [avatarDetails, setAvatarDetails] = useState<PlantAvatarData | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // The camera ring falls back to cameraInput (capture) when the live preview
  // is unavailable, which opens the native camera on a phone. The upload path
  // has its own file input inside UploadDialog instead of one here.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Guards against overlapping runs, like ScanActivity's AtomicBoolean.
  const processingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Start the live preview, and always release the camera on unmount —
  // otherwise the indicator light stays on after navigating away.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera is not available in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        // The <video> only mounts once cameraReady flips true, so videoRef is
        // still null here. A separate effect attaches the stream after mount.
        setCameraReady(true);
      } catch {
        // Permission denied or unsupported: the file-input path still works.
        setCameraError('Camera unavailable — use Upload instead.');
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      abortRef.current?.abort();
    };
  }, []);

  // Attach the captured stream once the <video> element actually exists. Doing
  // this inside the getUserMedia callback failed because the ref was null then.
  useEffect(() => {
    const video = videoRef.current;
    if (cameraReady && video && streamRef.current) {
      video.srcObject = streamRef.current;
      // Attaching srcObject after mount does not reliably trigger autoPlay, so
      // start it explicitly. Safe to ignore the promise — it is muted+inline.
      void video.play().catch(() => {});
    }
  }, [cameraReady]);

  // Fetches the real, persisted stats/species record once a scan finishes and
  // actually saved — the SSE stream itself never carries a complete stat set.
  // Cleared whenever we leave the 'done' state so stale details can't leak
  // into the next scan's result screen.
  useEffect(() => {
    if (status.kind !== 'done' || !status.avatarId) {
      setAvatarDetails(null);
      return;
    }
    let cancelled = false;
    void getAvatar(status.avatarId).then(
      (record) => {
        if (!cancelled) setAvatarDetails(toPlantAvatarData(record));
      },
      () => {
        // Best-effort: the result screen still works without this, just
        // without the species/stats detail (falls back to name + sprite).
        if (!cancelled) setAvatarDetails(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [status]);

  /** The shared tail of every input path. */
  const runPipeline = useCallback(
    async (jpegDataUrl: string, source: CaptureSource, customName?: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let finalSprite: string | null = null;
    let finalName = customName ?? '';
    let savedOutcome: {
      saved: boolean;
      saveError?: string;
      avatarId: string | null;
      discovery: ScanDiscovery | null;
    } = {
      saved: true,
      avatarId: null,
      discovery: null,
    };

    try {
      setStatus({ kind: 'busy', step: 'identify' });

      await streamPipeline(
        '/api/pipeline/run-stream',
        {
          imageBase64: jpegDataUrl,
          customName: customName || undefined,
          // Decides the saved record's lifetime; the server defaults an
          // undeclared caller to 'web', the expiring one.
          source,
          // The pause after the render hop is a studio affordance — it exists so
          // an operator can inspect the raw sprite before the cutout runs. A
          // player just wants the finished creature, so run straight through.
          pauseAt2b: false,
        },
        (event: PipelineEvent) => {
          if (event.event === 'step_start' || event.event === 'step_done') {
            const step = STEP_FOR_HOP[String(event.step)];
            if (step) {
              setStatus((current) =>
                current.kind === 'busy'
                  ? { ...current, step, detail: String(event.details ?? '') }
                  : current
              );
            }
          }

          if (event.event === 'step_done' && event.step === '1') {
            const identification = event.result as { name?: string } | undefined;
            if (identification?.name) {
              finalName = identification.name;
              setStatus((current) =>
                current.kind === 'busy'
                  ? { ...current, plantName: identification.name }
                  : current
              );
            }
          }

          if (event.event === 'complete') {
            const plant = event.finalPlant as { name?: string } | undefined;
            finalName = plant?.name ?? finalName;
            finalSprite = `data:image/png;base64,${String(event.finalSpriteB64)}`;
            savedOutcome = {
              saved: event.saved !== false,
              saveError: event.saveError ? String(event.saveError) : undefined,
              avatarId: event.avatarId ? String(event.avatarId) : null,
              discovery: (event.discovery ?? null) as ScanDiscovery | null,
            };
          }

          if (event.event === 'pipeline_error' || event.event === 'error') {
            throw new Error(String(event.error ?? 'The pipeline failed.'));
          }
        },
        controller.signal
      );

      if (!finalSprite) {
        throw new Error('The pipeline finished without producing a sprite.');
      }

      setStatus({
        kind: 'done',
        sprite: finalSprite,
        name: finalName || 'Unknown Plant',
        source,
        avatarId: savedOutcome.avatarId,
        saved: savedOutcome.saved,
        saveError: savedOutcome.saveError,
        discovery: savedOutcome.discovery,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Something went wrong.';
      setStatus({
        kind: 'error',
        message: rawMessage.includes('401') ? 'Please sign in to scan a plant.' : rawMessage,
      });
    } finally {
      processingRef.current = false;
      abortRef.current = null;
    }
  }, []);

  const onCapture = useCallback(() => {
    // Live preview available: grab a frame. Otherwise open the native camera.
    if (cameraReady && videoRef.current) {
      void runPipeline(captureFrame(videoRef.current), 'mobile');
    } else {
      cameraInputRef.current?.click();
    }
  }, [cameraReady, runPipeline]);

  const onFilePicked = useCallback(
    async (file: File | undefined, source: CaptureSource) => {
      if (!file) return;
      try {
        void runPipeline(await fileToJpegDataUrl(file), source);
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not read that image.',
        });
      }
    },
    [runPipeline]
  );

  const onTestImage = useCallback(async () => {
    try {
      const response = await fetch('/img/test_plant.jpg');
      if (!response.ok) throw new Error('Could not load the test image.');
      // The bundled photo is a file like any other, so it saves as a web upload.
      void runPipeline(await fileToJpegDataUrl(await response.blob()), 'web');
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load the test image.',
      });
    }
  }, [runPipeline]);

  const busy = status.kind === 'busy';

  return (
    <main className="screen flex flex-col">
      {/*
        Black backdrop at the very back. It must NOT live as `bg-black` on
        <main>: main does not form a stacking context, so a -z-10 video would
        paint *behind* main's own background and show as a black screen. A
        separate -z-20 layer sits behind the video instead.
      */}
      <div className="absolute inset-0 -z-20 bg-black" />

      {/* Live preview, or the painted background when unavailable */}
      {cameraReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(event) => void event.currentTarget.play().catch(() => {})}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
      ) : (
        <img
          src="/img/bg_scan.png"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
      )}

      <div className="safe-top flex items-center justify-between px-3">
        <BackButton />
      </div>

      {/* Viewfinder framing, borrowed from the scanner patterns */}
      <div className="pointer-events-none flex flex-1 items-center justify-center p-8">
        <div className="relative aspect-square w-full max-w-sm">
          {[
            'left-0 top-0 border-l-4 border-t-4',
            'right-0 top-0 border-r-4 border-t-4',
            'left-0 bottom-0 border-l-4 border-b-4',
            'right-0 bottom-0 border-r-4 border-b-4',
          ].map((corner) => (
            <span key={corner} className={`absolute h-10 w-10 border-white/90 ${corner}`} />
          ))}
        </div>
      </div>

      {/* Error / camera-hint line (the busy state uses the full overlay below) */}
      <div className="px-6 text-center">
        {status.kind === 'error' && (
          <p className="pixel-panel inline-block px-3 py-2 text-[9px] leading-relaxed text-red-700">
            {status.message}
          </p>
        )}
        {status.kind === 'idle' && cameraError && (
          <p className="pixel-panel inline-block px-3 py-2 text-[9px]">{cameraError}</p>
        )}
      </div>

      {/* Full-screen progress while the pipeline runs — the long, opaque wait. */}
      {busy && (
        <ScanProgress step={status.step} plantName={status.plantName} detail={status.detail} />
      )}

      {/* Action row: upload | capture | test */}
      <div className="safe-bottom mt-4 flex items-center justify-around px-8">
        <button
          type="button"
          disabled={busy}
          onClick={() => setIsUploadDialogOpen(true)}
          className="press pixel-button px-3 py-2 text-[9px] disabled:cursor-not-allowed"
        >
          Upload
        </button>

        <button
          type="button"
          aria-label="Capture photo"
          disabled={busy}
          onClick={onCapture}
          className="press flex h-20 w-20 items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
        >
          <span className="h-16 w-16 rounded-full bg-white" />
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onTestImage()}
          className="press pixel-button px-3 py-2 text-[9px] disabled:cursor-not-allowed"
        >
          Test
        </button>
      </div>

      {/*
        Camera fallback for the capture ring. capture="environment" asks the OS
        for the rear camera directly — the dependable path on a phone when the
        live getUserMedia preview is not available.
      */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void onFilePicked(event.target.files?.[0], 'mobile');
          event.target.value = '';
        }}
      />

      {isUploadDialogOpen && (
        <UploadDialog
          onCancel={() => setIsUploadDialogOpen(false)}
          onFileAccepted={(file) => {
            setIsUploadDialogOpen(false);
            void onFilePicked(file, 'web');
          }}
        />
      )}

      {status.kind === 'naming' && (
        <NameDialog
          onCancel={() => setStatus({ kind: 'idle' })}
          onSubmit={(name) => void runPipeline(status.photo, status.source, name)}
        />
      )}

      {status.kind === 'done' && (
        <ResultDialog
          sprite={status.sprite}
          name={status.name}
          source={status.source}
          avatarId={status.avatarId}
          avatarDetails={avatarDetails}
          saved={status.saved}
          saveError={status.saveError}
          discovery={status.discovery}
          onBattleNow={() => {
            if (!status.avatarId) return;
            navigate('/battle', {
              state: { avatarId: status.avatarId, avatar: avatarDetails },
            });
          }}
          onGenerateAnother={() => setStatus({ kind: 'idle' })}
        />
      )}
    </main>
  );
}

/** The scan stages, in order, for the progress stepper. */
const SCAN_STEPS: { key: ScanStep; label: string }[] = [
  { key: 'identify', label: 'Identifying plant' },
  { key: 'sprite', label: 'Creating sprite' },
  { key: 'finish', label: 'Finishing the art' },
];

/**
 * Full-screen scan progress: each stage shows a spinner while active, a check
 * once done, and dims until reached. The sub-caption is the pipeline's own
 * per-hop detail line, so it reports what is actually happening.
 */
function ScanProgress({
  step,
  plantName,
  detail,
}: {
  step: ScanStep;
  plantName?: string;
  detail?: string;
}) {
  const currentIndex = SCAN_STEPS.findIndex((s) => s.key === step);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6">
      <div className="pixel-panel w-full max-w-xs p-5">
        <h2 className="font-pixel text-center text-xs leading-relaxed">
          {plantName ? `Growing ${plantName}` : 'Scanning…'}
        </h2>

        <ol className="mt-5 space-y-4">
          {SCAN_STEPS.map((scanStep, index) => {
            const state =
              index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
            return (
              <li key={scanStep.key} className="flex items-start gap-3">
                <StepMarker state={state} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-pixel text-[10px] leading-relaxed ${
                      state === 'pending' ? 'opacity-40' : ''
                    }`}
                  >
                    {scanStep.label}
                  </p>
                  {state === 'active' && detail && (
                    <p className="pulse-soft mt-1 text-[9px] leading-relaxed opacity-80">
                      {detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-5 text-center text-[9px] leading-relaxed opacity-60">
          This can take up to a minute. Keep the app open.
        </p>
      </div>
    </div>
  );
}

/** The bullet for a step: check when done, spinner when active, dot when pending. */
function StepMarker({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span className="bg-hp-high flex h-5 w-5 shrink-0 items-center justify-center border-2 border-black text-[10px] text-white">
        ✓
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="spin mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-black border-t-transparent" />
    );
  }
  return <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-black/40" />;
}

/**
 * The pop-up opened by the Upload button: a drag-and-drop zone plus a Browse
 * File fallback, with real client-side format/size checks (UC6 alt-flow 2a) —
 * the picker's `accept` attribute is only a hint, browsers don't enforce it,
 * so this is the only place that actually rejects a bad file before it ever
 * reaches the pipeline. Styled like Archive's pop-ups (`.pixel-panel` on a
 * dark backdrop) rather than reusing this page's own `Overlay`, which is
 * hardcoded to a narrower width than a comfortable dropzone needs.
 */
function UploadDialog({
  onFileAccepted,
  onCancel,
}: {
  onFileAccepted: (file: File) => void;
  onCancel: () => void;
}) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const error = validateUploadFile(file);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    onFileAccepted(file);
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-heading"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="pixel-panel w-full max-w-md p-8 outline-none"
      >
        <h2 id="upload-dialog-heading" className="font-pixel text-center text-xs leading-relaxed">
          Upload a plant photo
        </h2>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingOver(false);
            handleFile(event.dataTransfer.files?.[0]);
          }}
          className={`mt-4 flex flex-col items-center gap-3 border-4 border-dashed px-6 py-14 text-center transition-colors ${
            isDraggingOver
              ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10'
              : 'border-black/40'
          }`}
        >
          <p className="font-pixel text-[9px] leading-relaxed">Drag a photo here</p>
          <p className="text-[9px] leading-relaxed opacity-70">or</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="press pixel-button px-3 py-2 text-[9px]"
          >
            Browse File
          </button>
        </div>

        <p className="mt-3 text-center text-[8px] leading-relaxed opacity-60">
          Accepted formats: JPEG, PNG, or WEBP · Maximum size: 5 MB
        </p>

        {validationError && (
          <p
            role="alert"
            className="pixel-panel mt-3 px-3 py-2 text-center text-[9px] leading-relaxed text-red-700"
          >
            {validationError}
          </p>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="press pixel-button mt-4 w-full px-2 py-2 text-[9px]"
        >
          Cancel
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** Port of ScanActivity.showNameDialog. */
function NameDialog({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');

  return (
    <Overlay>
      <h2 className="text-xs">Name this plant</h2>
      <p className="mt-2 text-[9px] leading-relaxed opacity-80">
        Couldn&apos;t identify it automatically. What would you like to call it?
      </p>
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Rose, Sunflower…"
        className="mt-3 w-full border-2 border-black px-2 py-2 text-[10px]"
      />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit(name)}
          className="press pixel-button flex-1 px-2 py-2 text-[9px]"
        >
          Generate
        </button>
        <button type="button" onClick={onCancel} className="press pixel-button px-2 py-2 text-[9px]">
          Cancel
        </button>
      </div>
    </Overlay>
  );
}

function ResultDialog({
  sprite,
  name,
  source,
  avatarId,
  avatarDetails,
  saved,
  saveError,
  discovery,
  onBattleNow,
  onGenerateAnother,
}: {
  sprite: string;
  name: string;
  /** Decides whether the Web Upload badge + 24h expiry line show at all — an
   *  IRL (camera) scan is permanent, so neither applies (RetentionNote in
   *  ArchivePage.tsx follows the same rule: silent for a mobile-sourced
   *  avatar, only web uploads carry an expiry). */
  source: CaptureSource;
  avatarId: string | null;
  /** The real persisted record (species/family/full stats), fetched
   *  separately — see the effect that populates this in ScanPage. Null while
   *  loading, or if the fetch failed; the dialog just omits that section
   *  rather than showing anything fake. */
  avatarDetails: PlantAvatarData | null;
  saved: boolean;
  saveError?: string;
  discovery: ScanDiscovery | null;
  onBattleNow: () => void;
  onGenerateAnother: () => void;
}) {
  return (
    <Overlay>
      <button
        type="button"
        onClick={onGenerateAnother}
        aria-label="Close"
        className="press pixel-button pixel-button-icon absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center text-sm leading-none"
      >
        ×
      </button>

      <h2 className="text-center text-xs">New Discovery!</h2>
      <div className="scan-result-glow relative mx-auto mt-3 h-40 w-40">
        <img src={sprite} alt="" className="pixelated relative z-10 h-40 w-40 object-contain" />
      </div>
      <p className="mt-2 text-center text-[10px] leading-relaxed">{name}</p>
      {avatarDetails?.family && (
        <p className="text-center text-[9px] leading-relaxed opacity-70">
          {avatarDetails.species} from {avatarDetails.family}
        </p>
      )}

      <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <CaptureBadge source={source} />
        {source === 'web' && (
          <span className="text-[9px] leading-relaxed opacity-70">
            Expires 24 hours after upload
          </span>
        )}
      </p>

      {avatarDetails && (
        <div className="mt-3">
          <StatGrid avatar={avatarDetails} compact />
        </div>
      )}

      <p
        className={
          saved
            ? 'mt-3 text-center text-[9px] leading-relaxed opacity-80'
            : 'pixel-panel mt-3 px-3 py-2 text-center text-[9px] leading-relaxed text-red-700'
        }
      >
        {saved
          ? 'Saved to your archive.'
          : `Your plant was generated, but it could not be saved.${saveError ? ` ${saveError}` : ''}`}
      </p>

      {discovery &&
        (discovery.isFirstDiscoverer ? (
          <p className="mt-3 text-center text-[9px] leading-relaxed">
            You discovered this first!
          </p>
        ) : (
          <div className="mt-3 text-center text-[9px] leading-relaxed">
            <p>First discovered by {discovery.firstDiscoveredByName}</p>
            {/* Scans, not scanners — see ScanDiscovery. */}
            <p>Scanned {discovery.discoveryCount} times</p>
          </div>
        ))}

      {/* Battling needs a real, saved avatarId — nothing to load in a battle
          if the save itself failed. */}
      {saved && avatarId && (
        <button
          type="button"
          onClick={onBattleNow}
          style={{ background: 'var(--color-hp-high)', color: '#fff' }}
          className="press pixel-button mt-4 w-full px-2 py-2 text-[9px]"
        >
          Battle Now
        </button>
      )}

      <button
        type="button"
        onClick={onGenerateAnother}
        className="press pixel-button mt-2 w-full px-2 py-2 text-[9px]"
      >
        Generate Another
      </button>

      <a
        href={sprite}
        download={`${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
        className="press pixel-button mt-2 block w-full px-2 py-2 text-center text-[9px]"
      >
        Download Sprite
      </a>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
      <div className="pixel-panel relative w-full max-w-xs p-4">{children}</div>
    </div>
  );
}
