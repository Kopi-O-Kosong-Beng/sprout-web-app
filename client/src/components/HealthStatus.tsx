import { useEffect, useState } from 'react';
import { checkHealth } from '../services/sproutApi';
import { API_BASE_URL } from '../services/apiClient';

type Status = 'checking' | 'ok' | 'down';

/* The state is worded as well as coloured. Colour is never the sole carrier of
   meaning (PRODUCT.md), and the dot alone cannot say "checking". */
const STATE_WORD: Record<Status, string> = {
  checking: 'Checking',
  ok: 'Online',
  down: 'Unreachable',
};

export default function HealthStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [timestamp, setTimestamp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then((res) => {
        if (cancelled) return;
        setStatus('ok');
        setTimestamp(res.timestamp);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('down');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    // `is-${status}` rather than `health-${status}`: the stylesheet's dot and
    // edge rules were written against .is-ok / .is-down and so never matched,
    // which is why the indicator sat amber even on a healthy backend.
    <div className={`health-banner is-${status}`} role="status">
      <span className="health-state">
        <span className="health-dot" aria-hidden="true" />
        {STATE_WORD[status]}
      </span>
      <span className="health-line">
        {status === 'checking' && (
          <>
            Contacting <code>{API_BASE_URL}</code>…
          </>
        )}
        {status === 'ok' && (
          <>
            <code>{API_BASE_URL}</code> answered at{' '}
            {new Date(timestamp!).toLocaleTimeString()}.
          </>
        )}
        {status === 'down' && (
          <>
            No answer from <code>{API_BASE_URL}</code>. Start the server with{' '}
            <code>npm run dev</code> in <code>sprout-app/</code>.
          </>
        )}
      </span>
    </div>
  );
}
