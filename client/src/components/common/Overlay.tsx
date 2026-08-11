import { useEffect, useRef, type ReactNode } from 'react';

export type OverlaySize = 'sm' | 'md' | 'lg';

/**
 * `sm`/`md`/`lg` reproduce, respectively, what used to be three separate
 * hand-rolled dialog shells: ScanPage's own Overlay (NotSureDialog,
 * NameDialog, ResultDialog), ArchivePage's ArchiveModal (the error and
 * empty-collection pop-ups), and ScanPage's UploadDialog. Backdrop opacity is
 * bundled with size rather than a separate prop because it correlates 1:1
 * with those three original groups — ArchiveModal alone used bg-black/50, the
 * other two used /70.
 */
const OVERLAY_PRESETS: Record<OverlaySize, { backdrop: string; panel: string }> = {
  sm: { backdrop: 'bg-black/70', panel: 'max-w-xs p-4' },
  md: { backdrop: 'bg-black/50', panel: 'max-w-md p-6' },
  lg: { backdrop: 'bg-black/70', panel: 'max-w-md p-8' },
};

/**
 * Shared modal shell — backdrop plus a centered pixel-panel — for Scan and
 * Archive's pop-ups. Collapses three previously separate implementations
 * (see OVERLAY_PRESETS) after a PR review flagged the duplication and
 * pointed out that widening the original Overlay with a size prop was all
 * any of the three actually needed.
 *
 * `onDismiss` makes the backdrop and Escape close it, which is what pressing
 * outside a box is expected to do everywhere else. Dialogs that have no safe
 * way to be dismissed — one that must be answered — simply do not pass it,
 * and then neither affordance is offered rather than being offered and
 * ignored.
 *
 * The backdrop click is checked against the backdrop itself
 * (`event.target === event.currentTarget`), so a press that starts on the
 * panel and drifts onto the scrim does not count as clicking outside — no
 * `stopPropagation()` needed on the panel for this to hold.
 *
 * `fixed`, not `absolute`: ArchivePage's `<main>` scrolls
 * (`.screen-scrollable`), so an `absolute` backdrop there would scroll away
 * with the content instead of covering the viewport. `fixed` is correct on
 * every caller — ScanPage's `<main>` never scrolls, so it renders identically
 * there.
 */
export function Overlay({
  children,
  size = 'sm',
  onDismiss,
  labelledBy,
  className = '',
}: {
  children: ReactNode;
  size?: OverlaySize;
  onDismiss?: () => void;
  labelledBy?: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Guarded, not unconditional: a descendant can already hold focus by the
    // time this runs — NameDialog's <input autoFocus> commits synchronously,
    // before this effect fires — and stealing it back onto the panel would
    // undo that.
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
      dialogRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!onDismiss) return;
    // An arrow const, not a `function` declaration: declarations are
    // hoisted, so TypeScript will not carry the `!onDismiss` narrowing into
    // one and the call below fails the build — `tsc -b` catches it, a bare
    // `tsc --noEmit` did not.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  useEffect(() => {
    // Focus trap. aria-modal promises assistive tech that the page behind
    // the scrim is inert, but Tab used to walk straight out of the panel and
    // into the header nav — visibly focusing controls the scrim says are
    // unavailable. Cycle within the panel instead, the way <dialog> does.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        // Nothing tabbable inside — keep focus on the panel itself.
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Leaving the panel's own focus (tabIndex=-1) or its edges wraps to the
      // matching end; anything in the middle tabs normally.
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const preset = OVERLAY_PRESETS[size];

  return (
    <div
      // Extra top padding, not the uniform p-6 the other three sides use:
      // `fixed inset-0` sizes to the whole viewport, but the sticky site
      // header (z-50) sits on top of the first ~4.5rem of it — flex-centering
      // against the full viewport put a tall panel's top edge right under the
      // header, cramped against it. Padding the top of the centering region
      // more than the rest pushes the panel down clear of the header instead.
      className={`fixed inset-0 z-20 flex items-center justify-center ${preset.backdrop} px-6 pt-24 pb-6`}
      onClick={
        onDismiss
          ? (event) => {
              if (event.target === event.currentTarget) onDismiss();
            }
          : undefined
      }
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`pixel-panel w-full ${preset.panel} focus:outline-3 focus:outline-offset-1 focus:outline-[color:var(--color-brand)] ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
