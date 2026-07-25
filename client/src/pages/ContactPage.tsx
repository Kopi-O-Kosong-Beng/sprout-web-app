import { useState, type FormEvent } from 'react';
import {
  submitTicket,
  TICKET_CATEGORIES,
  type TicketCategory,
} from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { MiniArchive } from '../components/common/PlantVisuals';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refNumber, setRefNumber] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitTicket({
        name: name.trim(),
        email: email.trim(),
        category,
        message,
      });
      setRefNumber(res.refNumber);
      // Clear only on success — a failed submit keeps everything typed.
      setName('');
      setEmail('');
      setCategory('general');
      setMessage('');
    } catch (err) {
      setError(extractApiError(err, 'Ticket submission failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="contact-page">
      <section className="page-heading">
        <p className="eyebrow">Contact us</p>
        <h1>Send the Sprout team a query ticket</h1>
        <p>
          Submits to <code>POST /api/query/submit</code> — no account needed.
          You get a reference number back once the ticket is stored.
        </p>
      </section>

      <section className="contact-layout">
        {refNumber ? (
          <div className="contact-form contact-success" aria-live="polite">
            <p className="eyebrow">Ticket created</p>
            <h2>
              Reference number: <strong>{refNumber}</strong>
            </h2>
            <p>
              Your ticket is stored. Keep this reference for follow-ups.
              Notification delivery to you and the Sprout team has been attempted.
            </p>
            <button
              className="primary-cta form-submit"
              type="button"
              onClick={() => setRefNumber(null)}
            >
              <span aria-hidden="true">-&gt;</span>
              Submit Another Ticket
            </button>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={MAX_NAME_LENGTH}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
              >
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Message ({message.length}/{MAX_MESSAGE_LENGTH})
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                placeholder="Tell us what happened..."
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-cta form-submit" type="submit" disabled={submitting}>
              <span aria-hidden="true">-&gt;</span>
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </form>
        )}

        <aside className="support-card">
          <MiniArchive />
          <h2>What happens next</h2>
          <p>
            Sprout stores a ticket like SPR-20260712-0001, then attempts a
            confirmation email and a team notification for follow-up.
          </p>
        </aside>
      </section>
    </main>
  );
}
