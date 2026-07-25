import { useCallback, useEffect, useState } from 'react';
import {
  deleteAdminAccount,
  listAdminAccounts,
  type AdminAccount,
} from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';

/** Admin-only account list. Access is enforced by the server (ADMIN_EMAILS);
 *  this page simply renders whatever the API allows, so a non-admin who
 *  navigates here sees the 403 message rather than a partial dashboard. */
export default function AdminPage() {
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
        <h1>Sprout accounts</h1>
        <p>
          Every registered Sprout account. Deleting one removes its Firebase
          login and profile, which frees the email address to sign up again —
          useful for re-running the signup and OTP walkthrough.
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
                    {account.isAdmin && <span className="pill">admin</span>}
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
