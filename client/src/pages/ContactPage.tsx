import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  getTicketStatus,
  submitTicket,
  TICKET_CATEGORIES,
  type TicketCategory,
  type TicketStatus,
} from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { MiniArchive } from '../components/common/PlantVisuals';

/* These mirror the server's Joi rules in server/routes/query.routes.ts, which
   are `.max(n)` on a JS string — so the unit is UTF-16 code units on both
   sides, and an emoji costs two. That is a real limit (1000 emoji fills a
   2000 "character" message), but it is the limit the server enforces, so
   counting differently here would only invite a 400. What must NOT happen is
   cutting a surrogate pair in half — see truncate() below. */
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 150;
const MAX_ORGANISATION_LENGTH = 120;

/** Cut to `max` UTF-16 units without splitting a surrogate pair.
 *
 *  A plain `.slice(0, 2000)` landing mid-emoji left a lone high surrogate,
 *  which renders as the replacement character — the player watched a `�`
 *  appear at the end of their own message. Dropping the orphan costs one unit
 *  and keeps the text well-formed. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  // A high surrogate in final position has lost its partner to the cut.
  const strandedHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return strandedHighSurrogate ? cut.slice(0, -1) : cut;
}

/** Label text for a field the form will not submit without.
 *
 *  A wrapper rather than a bare asterisk because `.contact-form label` is a
 *  flex column — a loose `<span>*</span>` would become its own row and sit
 *  above the label instead of beside it.
 *
 *  The asterisk is aria-hidden and carries no visually-hidden "required"
 *  twin: that text would land inside the label and rename the field to
 *  "required Name" for anyone querying by accessible name. The input's own
 *  `required` attribute is what assistive tech announces, so the glyph is left
 *  as pure decoration for sighted users.
 */
function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="field-label">
      <span className="required-mark" aria-hidden="true">
        *
      </span>{' '}
      {children}
    </span>
  );
}

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
  const formRef = useRef<HTMLFormElement>(null);

  /*
    Back/Forward left the form and its own labels disagreeing: the browser
    restores the typed values into the DOM, but this component remounts with
    empty state, so the textarea showed 41 characters of text above a counter
    reading 0/2000 — and typing one more character jumped it to 41/2000 as
    React finally caught up with the DOM it had been ignoring.

    Reading the restored values back into state settles that. It runs on mount
    (the browser restores during load, before this fires) and again on a
    persisted pageshow, which is the case where no remount happens at all.
  */
  useEffect(() => {
    const syncFromRestoredDom = () => {
      const form = formRef.current;
      if (!form) return;
      const read = (field: string) =>
        (form.elements.namedItem(field) as HTMLInputElement | null)?.value ??
        '';
      // Only adopt a restored value; never clobber what the player has typed.
      const adopt =
        (setter: (v: string) => void, max: number) => (value: string) => {
          if (value) setter(truncate(value, max));
        };
      adopt(setName, MAX_NAME_LENGTH)(read('name'));
      adopt(setEmail, Number.MAX_SAFE_INTEGER)(read('email'));
      adopt(setOrganisation, MAX_ORGANISATION_LENGTH)(read('organisation'));
      adopt(setSubject, MAX_SUBJECT_LENGTH)(read('subject'));
      adopt(setMessage, MAX_MESSAGE_LENGTH)(read('message'));
    };

    syncFromRestoredDom();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) syncFromRestoredDom();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

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
        <p>Send your feedback or enquiries via our online form</p>
      </section>

      <section className="contact-layout">
        {refNumber ? (
          <div className="contact-form contact-success" aria-live="polite">
            <p className="eyebrow">Ticket created</p>
            <h2>
              Reference number: <strong>{refNumber}</strong>
            </h2>
            <p>
              Message received! Your support ticket has been created. Please save
              your reference number for follow-ups. We will reply within 3 working
              days.
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
          <form className="contact-form" ref={formRef} onSubmit={handleSubmit}>
            {/* Advice before the fields, not beside them. Told what to include
                while the message box is still empty, someone writes it into
                their first message; the same words in a side column are read
                after the fact, when they are only a reason the reply will be
                slow. */}
            <div className="form-intro">
              <h2>Helping us answer faster</h2>
              <p>
                If it is about a plant that would not scan, tell us the species you
                expected and roughly when you tried. If it is about your account, the
                email address you signed up with is usually all we need.
              </p>
            </div>

            {/* Two short fields that belong together sit on one row: six
                stacked inputs made the form a column tall enough to leave the
                aside beside it stranded above a screen of empty ground. */}
            <div className="field-row">
              <label>
                {/* Every capped field states its cap. Name, Subject and
                    Organisation previously truncated in silence at the DOM
                    level, so a pasted value simply lost its tail with nothing
                    said. The count only appears once it is worth watching. */}
                <RequiredLabel>
                  Name{' '}
                  {name.length > MAX_NAME_LENGTH / 2 &&
                    `(${name.length}/${MAX_NAME_LENGTH})`}
                </RequiredLabel>
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) =>
                    setName(truncate(e.target.value, MAX_NAME_LENGTH))
                  }
                  placeholder="Your name"
                  maxLength={MAX_NAME_LENGTH}
                  required
                />
              </label>
              <label>
                <RequiredLabel>Email</RequiredLabel>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
            </div>
            <label>
              Organisation (optional){' '}
              {organisation.length > MAX_ORGANISATION_LENGTH / 2 &&
                `(${organisation.length}/${MAX_ORGANISATION_LENGTH})`}
              <input
                type="text"
                name="organisation"
                value={organisation}
                onChange={(e) =>
                  setOrganisation(
                    truncate(e.target.value, MAX_ORGANISATION_LENGTH)
                  )
                }
                placeholder="Company, school, or team"
                maxLength={MAX_ORGANISATION_LENGTH}
              />
            </label>
            {/* Inquiry type before Subject: picking the category first frames
                what the subject line should say. */}
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
              <RequiredLabel>
                Subject{' '}
                {subject.length > MAX_SUBJECT_LENGTH / 2 &&
                  `(${subject.length}/${MAX_SUBJECT_LENGTH})`}
              </RequiredLabel>
              <input
                type="text"
                name="subject"
                value={subject}
                onChange={(e) =>
                  setSubject(truncate(e.target.value, MAX_SUBJECT_LENGTH))
                }
                placeholder="What is your query about?"
                maxLength={MAX_SUBJECT_LENGTH}
                required
              />
            </label>
            <label>
              <RequiredLabel>
                Message ({message.length}/{MAX_MESSAGE_LENGTH})
              </RequiredLabel>
              <textarea
                rows={6}
                name="message"
                value={message}
                onChange={(e) =>
                  setMessage(truncate(e.target.value, MAX_MESSAGE_LENGTH))
                }
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
          The column beside the form used to narrate what the submit button was
          about to do, which the person had no use for until after they pressed
          it. It now does the job the LTA contact page uses the same space for:
          letting someone who already filed a ticket look it up again.
        */}
        <aside className="support-card">
          <MiniArchive />
          <h2>Check Feedback Status</h2>
          <TicketStatusCheck />
        </aside>
      </section>
    </main>
  );
}

const TICKET_STATUS_LABELS: Record<TicketStatus['status'], string> = {
  open: 'Open — with the team',
  resolved: 'Resolved',
};

/** Date and time, in the reader's own locale and timezone — the stored value is
 *  UTC, and "replied at 23:40" is confusing to someone who saw 07:40. Falls
 *  back to the raw value rather than rendering "Invalid Date". */
function formatRepliedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Look up a ticket you already filed, with the reference number and the email
 * you filed it under.
 *
 * Both are required by the server, which answers one identical 404 for a
 * reference that does not exist and for one belonging to someone else — the
 * numbers are a daily sequence, so the email is what actually proves the
 * ticket is yours.
 */
function TicketStatusCheck() {
  const [refNumber, setRefNumber] = useState('');
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TicketStatus | null>(null);

  async function handleCheck(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await getTicketStatus({ refNumber: refNumber.trim(), email: email.trim() }));
    } catch (err) {
      setError(extractApiError(err, 'Could not check that ticket.'));
    } finally {
      setChecking(false);
    }
  }

  return (
    <form className="status-check" onSubmit={handleCheck}>
      <label>
        <RequiredLabel>Feedback Number</RequiredLabel>
        <input
          type="text"
          value={refNumber}
          onChange={(e) => setRefNumber(e.target.value)}
          placeholder="SPR-20260712-0001"
          maxLength={20}
          required
        />
      </label>
      <label>
        <RequiredLabel>Email Address</RequiredLabel>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      {result && (
        <div className="status-result" aria-live="polite">
          <p className="eyebrow">{result.refNumber}</p>
          <p>
            <strong>{TICKET_STATUS_LABELS[result.status]}</strong>
          </p>
          <p>{result.subject}</p>
          {/* Only when a date was actually recorded. Tickets resolved before
              resolvedAt existed report the state without one — the alternative
              is telling someone Sprout replied at a time nobody logged.

              "check your email" is accurate even though nothing in this app
              sends mail on resolve: the team answers manually from the support
              inbox, and marking the ticket resolved is what they do afterwards.
              So the reply is real and this line points at it. Do not "fix" the
              missing send by wiring an automated resolution email — that would
              put a second, empty message in front of the actual answer. */}
          {result.status === 'resolved' && result.resolvedAt && (
            <p className="status-replied">
              Sprout replied on {formatRepliedAt(result.resolvedAt)}, please check
              your email.
            </p>
          )}
          {result.submittedAt && (
            <p className="status-meta">
              Submitted {new Date(result.submittedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
      <button className="secondary-cta form-submit" type="submit" disabled={checking}>
        {checking ? 'Checking…' : 'Check'}
      </button>
    </form>
  );
}
