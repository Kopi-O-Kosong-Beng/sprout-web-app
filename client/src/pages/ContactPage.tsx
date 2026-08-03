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
const MAX_SUBJECT_LENGTH = 150;
const MAX_ORGANISATION_LENGTH = 120;

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [subject, setSubject] = useState('');
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
        organisation: organisation.trim() || undefined,
        subject: subject.trim(),
        category,
        message,
      });
      setRefNumber(res.refNumber);
      // Clear only on success — a failed submit keeps everything typed.
      setName('');
      setEmail('');
      setOrganisation('');
      setSubject('');
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
        <h1>Ask the Sprout team anything</h1>
        <p>
          No account needed — tell us what you ran into and we will write back.
          You get a reference number the moment it is saved, so you can quote it
          if you need to chase us.
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
            {/* Two short fields that belong together sit on one row: six
                stacked inputs made the form a column tall enough to leave the
                aside beside it stranded above a screen of empty ground. */}
            <div className="field-row">
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
            </div>
            <label>
              Organisation (optional)
              <input
                type="text"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder="Company, school, or team"
                maxLength={MAX_ORGANISATION_LENGTH}
              />
            </label>
            <label>
              Subject
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What is your query about?"
                maxLength={MAX_SUBJECT_LENGTH}
                required
              />
            </label>
            <label>
              Inquiry type
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
              >
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
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

        {/*
          The aside used to hold one short paragraph beside a form four times
          its height, which left most of the column as bare ground. It now
          answers the three things someone actually wants to know before typing:
          what happens to the message, how long it takes, and what to include so
          the first reply is useful rather than a request for more detail.
        */}
        <aside className="support-card">
          <MiniArchive />
          <h2>What happens next</h2>
          <ol className="support-steps">
            <li>
              <strong>Your ticket is saved</strong> with a reference like{' '}
              <code>SPR-20260712-0001</code>.
            </li>
            {/* "attempts", not "sends": storing the ticket is confirmed, the
                email is not. Overstating it would promise delivery the system
                cannot guarantee, and the ticket is safe either way. */}
            <li>
              <strong>Sprout then attempts a confirmation email</strong> to the
              address you gave, with that reference in it.
            </li>
            <li>
              <strong>The team is notified</strong> and picks it up from there.
            </li>
          </ol>

          <h2 className="support-heading-alt">Helping us answer faster</h2>
          <p>
            If it is about a plant that would not scan, tell us the species you
            expected and roughly when you tried. If it is about your account, the
            email address you signed up with is usually all we need.
          </p>
        </aside>
      </section>
    </main>
  );
}
