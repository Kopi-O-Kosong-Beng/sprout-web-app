import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { CaptureBadge } from '../components/common/PlantVisuals';
import { extractApiError } from '../services/apiClient';
import { streamPipeline, type PipelineEvent } from '../services/pipelineStream';
import { createAvatar } from '../services/sproutApi';

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

/** The client-visible stages of a scan, in order. */
type ScanStep = 'identify' | 'sprite' | 'finish';

/**
 * How the photo reached the pipeline, which is what decides whether the saved
 * plant is kept or expires.
 *
 * The camera — live preview or the OS camera app — means someone stood in front
 * of a real plant, so it is an IRL scan and the record is permanent. A file off
 * disk could be any picture of anything, so it is a web upload: playable and
 * battleable, but gone in 24 hours. The server enforces this; the two constants
 * here are just the two buttons.
 */
type CaptureSource = 'mobile' | 'web';

/** What a finished run knows about the plant, in the shape the archive takes. */
interface ScannedPlant {
  name: string;
  family: string | null;
  taxonomy?: Record<string, string>;
  commonNames?: string[];
  description?: string;
  confidence?: number;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; step: ScanStep; plantName?: string; detail?: string }
  | { kind: 'naming'; photo: CapturedPhoto; source: CaptureSource }
  | {
      kind: 'done';
      sprite: string;
      plant: ScannedPlant;
      source: CaptureSource;
      /** A downscaled copy of the photo, banked with the record. */
      photo?: string;
    }
  | { kind: 'error'; message: string };

/** Where the result dialog's "Save to archive" button has got to. */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/** The pipeline's assembled plant, as it arrives on the `complete` event. */
interface PipelinePlant {
  name?: string;
  taxonomy?: Record<string, string>;
  common_names?: string[];
  description?: string;
  probability?: number;
}

/** Plant.id capitalises its taxonomy ranks; a hand-named run may not. */
function familyOf(taxonomy: Record<string, string> | undefined): string | null {
  const family = taxonomy?.Family ?? taxonomy?.family;
  return family?.trim() ? family.trim() : null;
}

function toScannedPlant(plant: PipelinePlant, fallbackName: string): ScannedPlant {
  return {
    name: plant.name?.trim() || fallbackName,
    family: familyOf(plant.taxonomy),
    taxonomy: plant.taxonomy,
    commonNames: plant.common_names,
    description: plant.description,
    confidence: plant.probability,
  };
}

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
/**
 * The archive copy is much smaller than the one the pipeline identifies from.
 * It is only ever drawn as a thumbnail on the specimen card, and it is stored
 * inside the Firestore document next to the sprite, so a full 1024px JPEG would
 * spend a fifth of the 1 MB ceiling on pixels nothing displays.
 */
const MAX_ARCHIVE_PHOTO_EDGE = 384;

/** Draws a bitmap or video frame to a JPEG data URL, bounded by `maxEdge`. */
function toJpegDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number
): string {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read that image.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Both sizes of one photo: what the pipeline reads, and what the archive keeps. */
export interface CapturedPhoto {
  full: string;
  thumbnail: string;
}

/** Downscales a picked file to the shape the pipeline endpoint expects. */
async function fileToPhoto(file: Blob): Promise<CapturedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      full: toJpegDataUrl(bitmap, bitmap.width, bitmap.height, MAX_IMAGE_EDGE),
      thumbnail: toJpegDataUrl(
        bitmap,
        bitmap.width,
        bitmap.height,
        MAX_ARCHIVE_PHOTO_EDGE
      ),
    };
  } finally {
    bitmap.close();
  }
}

/** Grabs the current video frame at the same two sizes. */
function captureFrame(video: HTMLVideoElement): CapturedPhoto {
  const { videoWidth, videoHeight } = video;
  return {
    full: toJpegDataUrl(video, videoWidth, videoHeight, MAX_IMAGE_EDGE),
    thumbnail: toJpegDataUrl(
      video,
      videoWidth,
      videoHeight,
      MAX_ARCHIVE_PHOTO_EDGE
    ),
  };
}

export default function ScanPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Two inputs: uploadInput picks from the gallery/files (no capture); the
  // camera ring falls back to cameraInput (capture) when the live preview is
  // unavailable, which opens the native camera on a phone.
  const uploadInputRef = useRef<HTMLInputElement>(null);
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

  /** The shared tail of every input path. */
  const runPipeline = useCallback(
    async (photo: CapturedPhoto, source: CaptureSource, customName?: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let finalSprite: string | null = null;
    let finalName = customName ?? '';
    // Everything hop 3 assembled about the plant, kept so the result dialog can
    // bank it: the archive record wants the family and details, not just a name.
    let finalPlant: PipelinePlant = {};

    try {
      setStatus({ kind: 'busy', step: 'identify' });

      await streamPipeline(
        '/api/pipeline/run-stream',
        {
          imageBase64: photo.full,
          customName: customName || undefined,
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
            const plant = event.finalPlant as PipelinePlant | undefined;
            finalPlant = plant ?? {};
            finalName = plant?.name ?? finalName;
            finalSprite = `data:image/png;base64,${String(event.finalSpriteB64)}`;
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
        plant: toScannedPlant(finalPlant, finalName || 'Unknown Plant'),
        source,
        photo: photo.thumbnail,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong.',
      });
    } finally {
      processingRef.current = false;
      abortRef.current = null;
    }
    },
    []
  );

  const onCapture = useCallback(() => {
    // Live preview available: grab a frame. Otherwise open the native camera,
    // which lands in onFilePicked — still an IRL scan, hence the explicit source
    // on that input rather than one rule for every file.
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
        void runPipeline(await fileToPhoto(file), source);
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not read that image.',
        });
      }
    },
    [runPipeline]
  );

  // The bundled photo is a file like any other, so it saves as a web upload.
  const onTestImage = useCallback(async () => {
    const response = await fetch('/img/test_plant.jpg');
    void runPipeline(await fileToPhoto(await response.blob()), 'web');
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
          onClick={() => uploadInputRef.current?.click()}
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

      {/* Upload: gallery / files. No `capture`, so it does NOT launch the camera
          — a picture off disk is a web upload, and expires in 24 hours. */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void onFilePicked(event.target.files?.[0], 'web');
          event.target.value = '';
        }}
      />

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

      {status.kind === 'naming' && (
        <NameDialog
          onCancel={() => setStatus({ kind: 'idle' })}
          onSubmit={(name) => void runPipeline(status.photo, status.source, name)}
        />
      )}

      {status.kind === 'done' && (
        <ResultDialog
          sprite={status.sprite}
          plant={status.plant}
          source={status.source}
          photo={status.photo}
          onScanAnother={() => setStatus({ kind: 'idle' })}
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

/**
 * The finished creature, and what can be done with it.
 *
 * "Save sprite" used to be an `<a download>` and nothing else — it wrote the
 * PNG to the player's Downloads folder, which is why a scanned plant never
 * turned up in the archive. Banking the record is the primary action now; the
 * download stays as the secondary one, because keeping a copy of the art is a
 * reasonable thing to want and it is the only action that works signed out.
 */
function ResultDialog({
  sprite,
  plant,
  source,
  photo,
  onScanAnother,
}: {
  sprite: string;
  plant: ScannedPlant;
  source: CaptureSource;
  photo?: string;
  onScanAnother: () => void;
}) {
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const isUpload = source === 'web';

  const onSave = useCallback(async () => {
    setSave({ kind: 'saving' });
    try {
      await createAvatar({
        speciesName: plant.name,
        speciesFamily: plant.family,
        spriteDataUrl: sprite,
        photoDataUrl: photo,
        source,
        metadata: {
          taxonomy: plant.taxonomy,
          commonNames: plant.commonNames,
          description: plant.description,
          confidence: plant.confidence,
        },
      });
      setSave({ kind: 'saved' });
    } catch (error) {
      setSave({
        kind: 'error',
        message: extractApiError(error, 'Could not save this plant to your archive.'),
      });
    }
  }, [photo, plant, source, sprite]);

  return (
    <Overlay>
      <h2 className="text-center text-xs">Done!</h2>
      <img src={sprite} alt="" className="pixelated mx-auto mt-3 h-40 w-40 object-contain" />
      <p className="mt-2 text-center text-[10px] leading-relaxed">{plant.name}</p>

      {/* Say which it is before the save, not after: the difference between a
          kept plant and one that is gone tomorrow is worth knowing up front. */}
      <p className="mt-2 text-center">
        <CaptureBadge source={source} />
      </p>
      <p className="mt-1 text-center text-[8px] leading-relaxed opacity-70">
        {isUpload
          ? 'Uploaded from a file, so this one expires 24 hours after you save it.'
          : 'Scanned from your camera, so this one is kept in your archive.'}
      </p>

      {save.kind === 'saved' ? (
        <p
          role="status"
          className="mt-4 text-center text-[9px] leading-relaxed"
          style={{ color: 'var(--color-hp-high)' }}
        >
          Saved to your archive.{' '}
          <Link to="/archive" className="underline">
            Open it
          </Link>
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={save.kind === 'saving'}
          style={{ background: 'var(--color-hp-high)', color: '#fff' }}
          className="press pixel-button mt-4 block w-full px-2 py-2 text-center text-[9px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {save.kind === 'saving' ? 'Saving…' : 'Save to archive'}
        </button>
      )}

      {save.kind === 'error' && (
        <p role="alert" className="mt-2 text-center text-[9px] leading-relaxed text-red-700">
          {save.message}
        </p>
      )}

      <a
        href={sprite}
        download={`${plant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
        className="press pixel-button mt-2 block w-full px-2 py-2 text-center text-[9px]"
      >
        Download sprite
      </a>
      <button
        type="button"
        onClick={onScanAnother}
        className="press pixel-button mt-2 w-full px-2 py-2 text-[9px]"
      >
        Scan another
      </button>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
      <div className="pixel-panel w-full max-w-xs p-4">{children}</div>
    </div>
  );
}
