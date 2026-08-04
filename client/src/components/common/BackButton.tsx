import { useNavigate } from 'react-router-dom';

/**
 * Stands in for the `← Back` button every Android activity wired to finish().
 *
 * Falls back to a route when there is no history to pop — the common case for
 * an installed PWA opened straight onto a deep link. The hub passes `/`, since
 * defaulting it to `/home` there would navigate the page to itself.
 */
export default function BackButton({
  className = '',
  fallback = '/home',
}: {
  className?: string;
  fallback?: string;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate(fallback);
      }}
      className={`press pixel-button px-3 py-2 text-xs ${className}`}
    >
      ← Back
    </button>
  );
}
