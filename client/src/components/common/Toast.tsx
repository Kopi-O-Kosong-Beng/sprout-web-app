/**
 * Transient messages, for the things a player has to be told and may have to
 * act on.
 *
 * Errors used to surface inline, per screen, in whatever wording the server
 * happened to send — so a player could be shown a Firestore exception, and the
 * one message that needed acting on ("you're offline") looked exactly like the
 * ones that did not. Toasts give those a single, consistent place, and the
 * `action` slot lets a message carry the way out of the situation it describes
 * rather than just naming it.
 *
 * What goes here: anything the player must notice, and especially anything they
 * can fix — no connection, a photo too blurry to identify, a save that did not
 * take. What does not: raw server text. Sanitising is extractApiError's job (see
 * services/apiClient.ts); this component renders whatever it is handed, so
 * handing it an exception message would put an exception on screen.
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'error' | 'warn' | 'success' | 'info';

export interface ToastAction {
  label: string;
  onSelect: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  /** One line, plain language, no error codes. */
  message: string;
  /** What to do about it, when there is something to do. */
  action?: ToastAction;
  /**
   * Milliseconds on screen. Null pins it until dismissed — right for anything
   * carrying an action, since a message that disappears before it is read is
   * the same as no message.
   */
  durationMs?: number | null;
}

interface ActiveToast extends ToastOptions {
  id: number;
  tone: ToastTone;
}

export interface ToastContextValue {
  /** Shows a toast and returns its id, so a caller can dismiss it early. */
  showToast: (options: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** How long each tone stays up when the caller does not say. Errors linger:
 *  they are the ones worth re-reading, and often the ones with an action. */
const DEFAULT_DURATION_MS: Record<ToastTone, number | null> = {
  error: 8000,
  warn: 6000,
  success: 3500,
  info: 4500,
};

/** Cap on what is on screen at once; oldest goes first. Three is enough to
 *  show a cascade without burying the newest under a wall. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      const tone = options.tone ?? 'error';
      // An action means "do something", so it stays until the player answers
      // it — auto-dismissing an offer to retry throws the offer away.
      const duration =
        options.durationMs !== undefined
          ? options.durationMs
          : options.action
            ? null
            : DEFAULT_DURATION_MS[tone];

      setToasts((current) => [...current, { ...options, id, tone }].slice(-MAX_VISIBLE));

      if (duration !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismissToast(id), duration)
        );
      }
      return id;
    },
    [dismissToast]
  );

  // Clear pending timers on unmount so a dismissal cannot fire into a dead tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Record<ToastTone, { background: string; color: string }> = {
  error: { background: 'var(--color-hp-low)', color: '#fff' },
  warn: { background: 'var(--color-warn)', color: '#1b1205' },
  success: { background: 'var(--color-hp-high)', color: '#fff' },
  info: { background: 'var(--color-f24-teal-deep)', color: '#fff' },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ActiveToast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      // aria-live rather than role="alert" on each: the region is announced
      // once and updates are read in turn, instead of several alerts
      // interrupting each other.
      aria-live="assertive"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={TONE_STYLE[toast.tone]}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 border-2 border-black px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.35)]"
        >
          <p className="flex-1 text-[10px] leading-relaxed">{toast.message}</p>

          {toast.action && (
            <button
              type="button"
              onClick={() => {
                onDismiss(toast.id);
                toast.action!.onSelect();
              }}
              className="press shrink-0 border-2 border-black bg-white/90 px-2 py-1 text-[9px] font-semibold text-black"
            >
              {toast.action.label}
            </button>
          )}

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 px-1 text-xs leading-none opacity-80"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
