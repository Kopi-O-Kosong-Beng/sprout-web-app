import { useNavigate } from 'react-router-dom';

/**
 * Stands in for the `← Back` button every Android activity wired to finish().
 *
 * Falls back to the hub when there is no history to pop — the common case for
 * an installed PWA opened straight onto a deep link.
 */
export default function BackButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/home');
      }}
      className={`press pixel-button px-3 py-2 text-xs ${className}`}
    >
      ← Back
    </button>
  );
}
