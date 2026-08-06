import { useCallback, useEffect, useState } from 'react';
import { AlmanacGrid } from '../components/common/AlmanacGrid';
import { useAlmanacFilter } from '../hooks/useAlmanacFilter';
import {
  deleteAdminAccount,
  getAdminAlmanac,
  getApiHealth,
  listAdminAccounts,
  runAdminCleanup,
  setAccountSuperAdmin,
  type AdminAccount,
  type AdminAlmanac,
  type ApiHealth,
  type CleanupReport,
} from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';

/** Superadmin console. Access is enforced by the server (the Firestore
 *  isSuperAdmin flag, or the ADMIN_EMAILS break-glass allowlist); this page
 *  simply renders whatever the API allows, so anyone who reaches it without
 *  the grant sees 403s rather than a partial dashboard. */
export default function AdminPage() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminAccounts();
      setAccounts(data.items);
    } catch (err) {
      setError(extractApiError(err, 'Could not load accounts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSuperAdmin(account: AdminAccount, next: boolean) {
    setPendingId(account.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await setAccountSuperAdmin(account.id, next);
      setAccounts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setNotice(
        next
          ? `${updated.email} is now a superadmin.`
          : `Superadmin revoked for ${updated.email}.`
      );
    } catch (err) {
      setError(extractApiError(err, 'Could not change superadmin status.'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(account: AdminAccount) {
    setPendingId(account.id);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setNotice(
        `Deleted ${account.email}. That address can now register again.`
      );
    } catch (err) {
      setError(extractApiError(err, 'Could not delete the account.'));
    } finally {
      setPendingId(null);
      setConfirmId(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-heading">
        <p className="eyebrow">Team tools</p>
        <h1>Sprout admin</h1>
        <p>
          Accounts, live API health, Firestore cleanup and the full plant
          almanac. Everything here is gated server-side by the superadmin grant,
          so anyone without it sees 403s rather than a partial dashboard.
        </p>
      </section>

      <ApiHealthPanel />
      <CleanupPanel />
      <AdminAlmanacPanel />

      <section className="page-heading">
        <h2>Accounts</h2>
        <p>
          Every registered Sprout account. Deleting one removes its Firebase
          login and profile, which frees the email address to sign up again —
          useful for re-running the signup and OTP walkthrough. Promoting one
          grants the operator tools: Studio, API Test, Ticket Manager and this
          page.
        </p>
      </section>

      {notice && <p className="form-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading accounts…</p>
      ) : accounts.length === 0 && !error ? (
        <p>No accounts yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <caption className="sr-only">
              Registered Sprout accounts with delete controls
            </caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Display name</th>
                <th scope="col">Verified</th>
                <th scope="col">PVE record</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.email}
                    {account.isAdmin && <span className="pill">superadmin</span>}
                    {account.isAllowlisted && (
                      <span className="pill" title="Granted by ADMIN_EMAILS">
                        allowlist
                      </span>
                    )}
                  </td>
                  <td>{account.displayName || '—'}</td>
                  <td>{account.isVerified ? 'Yes' : 'No'}</td>
                  <td>
                    {account.pveWins}W / {account.pveLosses}L · {account.pveXp} XP
                  </td>
                  <td>
                    {account.createdAt
                      ? new Date(account.createdAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>
                    {confirmId === account.id ? (
                      <span className="confirm-row">
                        <button
                          type="button"
                          className="danger-action"
                          onClick={() => void handleDelete(account)}
                          disabled={pendingId === account.id}
                        >
                          {pendingId === account.id
                            ? 'Deleting…'
                            : `Confirm delete ${account.email}`}
                        </button>
                        <button
                          type="button"
                          className="details-link"
                          onClick={() => setConfirmId(null)}
                          disabled={pendingId === account.id}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="confirm-row">
                        <SuperAdminToggle
                          account={account}
                          isSelf={account.id === profile?.uid}
                          busy={pendingId === account.id}
                          onChange={(next) => void handleSuperAdmin(account, next)}
                        />
                        <button
                          type="button"
                          className="details-link"
                          onClick={() => {
                            setConfirmId(account.id);
                            setNotice(null);
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/**
 * Promote / revoke, or an explanation of why neither is offered.
 *
 * Two rows carry no button, because pressing it could only fail:
 *   - your own, since the server refuses self-demotion — the operator holding
 *     the console should not be able to lock themselves out of it in one click
 *   - an allowlisted address, since clearing the flag leaves ADMIN_EMAILS
 *     still granting, and a button that reports success while access continues
 *     is worse than no button
 */
function SuperAdminToggle({
  account,
  isSelf,
  busy,
  onChange,
}: {
  account: AdminAccount;
  isSelf: boolean;
  busy: boolean;
  onChange(next: boolean): void;
}) {
  if (isSelf) {
    return <span className="status-meta">Your account</span>;
  }
  if (account.isAllowlisted) {
    return <span className="status-meta">Set by ADMIN_EMAILS</span>;
  }
  return (
    <button
      type="button"
      className="details-link"
      disabled={busy}
      onClick={() => onChange(!account.isSuperAdmin)}
    >
      {busy
        ? 'Saving…'
        : account.isSuperAdmin
          ? 'Revoke superadmin'
          : 'Make superadmin'}
    </button>
  );
}

/**
 * Live provider health.
 *
 * The probes already existed — /api/platform/health-check calls Plant.id,
 * Gemini and friends for real and reports latency and remaining credits — but
 * they were only reachable from the pipeline studio, which is a different tool
 * for a different job. Probing costs an upstream call per provider, so it runs
 * on request rather than on page load.
 */
function ApiHealthPanel() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setHealth(await getApiHealth());
    } catch (err) {
      setError(extractApiError(err, 'Could not reach the health probes.'));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="panel">
      <h2>API health</h2>
      <p>
        Contacts Plant.id, Gemini and withoutBG once each and reports what came
        back. Flux and the cutout service are listed but deliberately not
        probed: both bill per call, and a health page that spends credit every
        time you open it is its own problem — they report SKIP, meaning key
        present, liveness unknown. A missing key is a SKIP too; the pipeline
        degrades hop by hop rather than stopping.
      </p>

      <button
        type="button"
        className="details-link"
        onClick={() => void probe()}
        disabled={busy}
      >
        {busy ? 'Probing…' : health ? 'Probe again' : 'Run health check'}
      </button>

      {error && <p className="form-error">{error}</p>}

      {health && (
        <>
          <p className="form-notice">
            {health.overallStatus} · checked{' '}
            {new Date(health.timestamp).toLocaleTimeString()}
          </p>
          <div className="table-scroll">
            <table className="admin-table">
              <caption className="sr-only">Upstream provider probe results</caption>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Status</th>
                  <th scope="col">Latency</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(health.probes).map(([name, probeResult]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{probeResult.status}</td>
                    <td>
                      {/* null means not probed, which is not the same as 0 ms. */}
                      {probeResult.latencyMs == null
                        ? '—'
                        : `${probeResult.latencyMs} ms`}
                    </td>
                    <td>{probeResult.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Firestore cleanup.
 *
 * Two presses, never one: the first reports what matches and deletes nothing,
 * and only then does a confirm button appear. The server enforces the same rule
 * independently, so a client that forgot it still cannot delete by accident.
 */
function CleanupPanel() {
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await runAdminCleanup('expired-temp-avatars', { dryRun }));
    } catch (err) {
      setError(extractApiError(err, 'Cleanup failed.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const pendingDeletion = report?.dryRun === true && report.matched > 0;

  return (
    <section className="panel">
      <h2>Firestore cleanup</h2>
      <p>
        Web uploads expire 24 hours after they are saved, but nothing has ever
        removed them — they sit in <code>avatar_records</code> badged “Expired”,
        refused by the battle picker. This deletes the ones that have run out.
        Camera scans are never touched.
      </p>

      <button
        type="button"
        className="details-link"
        onClick={() => void run(true)}
        disabled={busy}
      >
        {busy ? 'Working…' : 'Check what would be deleted'}
      </button>

      {error && <p className="form-error">{error}</p>}

      {report && (
        <>
          <p className={report.dryRun ? 'form-notice' : 'form-notice'}>
            {report.dryRun
              ? `${report.matched} expired upload${report.matched === 1 ? '' : 's'} match. Nothing has been deleted.`
              : `Deleted ${report.deleted} expired upload${report.deleted === 1 ? '' : 's'}.`}
          </p>

          {report.sample.length > 0 && (
            <ul>
              {report.sample.map((candidate) => (
                <li key={candidate.id}>
                  {candidate.label} — {candidate.detail}
                </li>
              ))}
            </ul>
          )}

          {pendingDeletion && (
            <span className="confirm-row">
              <button
                type="button"
                className="danger-action"
                onClick={() => void run(false)}
                disabled={busy}
              >
                Delete {report.matched} expired upload
                {report.matched === 1 ? '' : 's'}
              </button>
              <button
                type="button"
                className="details-link"
                onClick={() => setReport(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </span>
          )}
        </>
      )}
    </section>
  );
}

/** The full taxonomy, with who found what — and anything found off-list. */
function AdminAlmanacPanel() {
  const [almanac, setAlmanac] = useState<AdminAlmanac | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { query, setQuery, foundOnly, setFoundOnly, filtered } = useAlmanacFilter(
    almanac?.species ?? []
  );

  useEffect(() => {
    let live = true;
    void getAdminAlmanac()
      .then((data) => live && setAlmanac(data))
      .catch(
        (err) => live && setError(extractApiError(err, 'Could not load the almanac.'))
      );
    return () => {
      live = false;
    };
  }, []);

  const discoveries = almanac?.species.filter((entry) => entry.discovered) ?? [];

  return (
    <section className="panel">
      <h2>Plant almanac</h2>
      {error && <p className="form-error">{error}</p>}
      {!almanac ? (
        !error && <p>Loading the almanac…</p>
      ) : (
        <>
          <p>
            {almanac.discovered} of {almanac.total} species discovered.{' '}
            {almanac.offTaxonomy.length > 0 &&
              `${almanac.offTaxonomy.length} scanned species are not on the list.`}
          </p>

          {discoveries.length > 0 && (
            <div className="table-scroll">
              <table className="admin-table">
                <caption className="sr-only">Discovered species and their finders</caption>
                <thead>
                  <tr>
                    <th scope="col">Species</th>
                    <th scope="col">First found by</th>
                    <th scope="col">Date</th>
                    <th scope="col">Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {discoveries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <em>{entry.speciesName}</em>
                        {entry.commonName ? ` — ${entry.commonName}` : ''}
                      </td>
                      <td>{entry.discoveredByName ?? '—'}</td>
                      <td>
                        {entry.discoveredAt
                          ? new Date(entry.discoveredAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>{entry.discoveryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {almanac.offTaxonomy.length > 0 && (
            <>
              <h3>Found but not on the list</h3>
              <p>
                Species players have scanned that the almanac does not carry —
                the signal that the taxonomy needs extending.
              </p>
              <ul>
                {almanac.offTaxonomy.map((entry) => (
                  <li key={entry.speciesId}>
                    <em>{entry.speciesName}</em> — {entry.discoveryCount} scan
                    {entry.discoveryCount === 1 ? '' : 's'}, first by{' '}
                    {entry.discoveredByName}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="confirm-row">
            <label className="sr-only" htmlFor="admin-almanac-search">
              Search the almanac
            </label>
            <input
              id="admin-almanac-search"
              className="admin-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search species, family…"
            />
            <button
              type="button"
              className="details-link"
              onClick={() => setFoundOnly(!foundOnly)}
              aria-pressed={foundOnly}
            >
              {foundOnly ? 'Showing found only' : 'Showing all'}
            </button>
          </div>

          <AlmanacGrid species={filtered} tone="light" />
        </>
      )}
    </section>
  );
}
