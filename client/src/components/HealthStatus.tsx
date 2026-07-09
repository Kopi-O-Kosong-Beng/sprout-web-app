import { useEffect, useState } from 'react';
import { checkHealth } from '../services/sproutApi';
import { API_BASE_URL } from '../services/apiClient';

type Status = 'checking' | 'ok' | 'down';

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
    <div className={`health-banner health-${status}`}>
      <span className="health-dot" aria-hidden="true" />
      {status === 'checking' && <span>Checking backend at {API_BASE_URL}…</span>}
      {status === 'ok' && (
        <span>
          Backend OK — {API_BASE_URL} (as of {new Date(timestamp!).toLocaleTimeString()})
        </span>
      )}
      {status === 'down' && (
        <span>
          Backend unreachable at {API_BASE_URL}. Is the server running (
          <code>npm run dev</code> in <code>sprout-app/</code>)?
        </span>
      )}
    </div>
  );
}
