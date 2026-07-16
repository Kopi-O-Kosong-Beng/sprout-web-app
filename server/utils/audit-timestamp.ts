export interface AuditTimestamp {
  iso: string;
  date: string;
  time: string;
  readable: string;
}

const TIME_ZONE = 'Asia/Singapore';

const readableFormatter = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
});

export function buildAuditTimestamp(now = new Date()): AuditTimestamp {
  const dateParts = Object.fromEntries(
    dateFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    iso: now.toISOString(),
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time: `${timeFormatter.format(now)} SGT`,
    readable: `${readableFormatter.format(now)} SGT`,
  };
}
