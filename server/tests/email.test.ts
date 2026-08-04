const mockVerify = jest.fn();
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  verify: mockVerify,
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: mockCreateTransport },
}));

type SendFn = typeof import('../services/email.service')['send'];

async function freshSend(): Promise<SendFn> {
  const mod = await import('../services/email.service');
  return mod.send;
}

const EMAIL_ENV_KEYS = [
  'EMAIL_MODE',
  'EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'RESEND_API_KEY',
  'RESEND_FROM',
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockVerify.mockReset();
  mockSendMail.mockReset().mockResolvedValue({ messageId: 'test-message' });

  for (const key of EMAIL_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of EMAIL_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const payload = { to: 'user@example.com', subject: 'Hello', text: 'Body text' };

describe('email transport', () => {
  it('logs safely in console mode without constructing SMTP', async () => {
    process.env.EMAIL_MODE = 'console';
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { send } = await import('../services/email.service');
    await expect(send({ to: 'a@example.com', subject: 'Subject', text: 'Body' }))
      .resolves.toEqual({ delivered: true, mode: 'console' });
    expect(log).toHaveBeenCalled();
    expect(mockCreateTransport).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('rejects missing SMTP configuration with the missing key name only', async () => {
    process.env.EMAIL_MODE = 'smtp';
    const { verifyEmailTransport } = await import('../services/email.service');
    await expect(verifyEmailTransport()).rejects.toThrow('SMTP_HOST');
  });

  it('verifies and sends through configured SMTP', async () => {
    process.env.EMAIL_MODE = 'smtp';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'hello.sprout.team@gmail.com';
    process.env.SMTP_PASS = 'test-app-password';
    process.env.EMAIL_FROM = 'hello.sprout.team@gmail.com';
    mockVerify.mockResolvedValue(true);
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
    const { send, verifyEmailTransport } = await import('../services/email.service');
    await expect(verifyEmailTransport()).resolves.toEqual({ mode: 'smtp', verified: true });
    await expect(send({ to: 'a@example.com', subject: 'Subject', text: 'Body' }))
      .resolves.toEqual({ delivered: true, mode: 'smtp' });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'hello.sprout.team@gmail.com',
      to: 'a@example.com',
    }));
  });
});

describe('email.service send() - console mode', () => {
  it('logs delivery metadata without exposing message content', async () => {
    process.env.EMAIL_MODE = 'console';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const sensitivePayload = {
      to: 'user@example.com',
      subject: 'Sensitive delivery',
      text: 'OTP 123456 oobCode=secret-action-code private ticket message',
    };

    const send = await freshSend();
    const result = await send(sensitivePayload);

    expect(result).toEqual({ delivered: true, mode: 'console' });
    const logText = logSpy.mock.calls.flat().join('\n');
    expect(logText).toContain('to=user@example.com');
    expect(logText).toContain('subject="Sensitive delivery"');
    expect(logText).toContain('mode=console');
    expect(logText).toContain('delivered=true');
    expect(logText).not.toContain('123456');
    expect(logText).not.toContain('secret-action-code');
    expect(logText).not.toContain('private ticket message');
    expect(mockCreateTransport).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('defaults to console mode when EMAIL_MODE is unset', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const send = await freshSend();
    const result = await send(payload);

    expect(result.mode).toBe('console');
    expect(mockCreateTransport).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('email.service send() - smtp mode', () => {
  function setSmtpEnv(overrides: Record<string, string | undefined> = {}) {
    process.env.EMAIL_MODE = 'smtp';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'hello.sprout.team@gmail.com';
    process.env.SMTP_PASS = 'app-password';
    process.env.EMAIL_FROM = 'hello.sprout.team@gmail.com';
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it('sends through nodemailer with STARTTLS config on port 587', async () => {
    setSmtpEnv();
    const send = await freshSend();
    const result = await send(payload);

    expect(result).toEqual({ delivered: true, mode: 'smtp' });
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: 'hello.sprout.team@gmail.com', pass: 'app-password' },
      // Bounded waits: hosts that blackhole outbound SMTP (Render free tier)
      // must fail in seconds, not hang a signup request for minutes.
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'hello.sprout.team@gmail.com',
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
  });

  it('uses implicit TLS (secure: true) on port 465', async () => {
    setSmtpEnv({ SMTP_PORT: '465' });
    const send = await freshSend();
    await send(payload);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true })
    );
  });

  it('falls back to SMTP_USER as the from address when EMAIL_FROM is unset', async () => {
    setSmtpEnv({ EMAIL_FROM: undefined });
    const send = await freshSend();
    await send(payload);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'hello.sprout.team@gmail.com' })
    );
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'])(
    'fails with a clear error naming the missing var: %s',
    async (missing) => {
      setSmtpEnv({ [missing]: undefined });
      const send = await freshSend();
      await expect(send(payload)).rejects.toThrow(
        `Missing required email env var: ${missing}`
      );
      expect(mockSendMail).not.toHaveBeenCalled();
    }
  );

  it('reuses one cached transporter across multiple sends', async () => {
    setSmtpEnv();
    const send = await freshSend();
    await send(payload);
    await send({ ...payload, to: 'second@example.com' });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});

describe('email.service send() - resend mode', () => {
  const RESEND_ENDPOINT = 'https://api.resend.com/emails';

  function setResendEnv(overrides: Record<string, string | undefined> = {}) {
    process.env.EMAIL_MODE = 'resend';
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.EMAIL_FROM = 'hello.sprout.team@gmail.com';
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  function mockFetchOnce(init: { ok: boolean; status?: number; body?: string }) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: init.ok,
      status: init.status ?? (init.ok ? 200 : 422),
      text: async () => init.body ?? '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
  });

  it('posts the payload to the Resend API and reports the resend mode', async () => {
    setResendEnv();
    const fetchMock = mockFetchOnce({ ok: true, body: '{"id":"re_123"}' });

    const send = await freshSend();
    await expect(send(payload)).resolves.toEqual({ delivered: true, mode: 'resend' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-resend-key'
    );
    expect(JSON.parse(options.body as string)).toEqual({
      from: 'hello.sprout.team@gmail.com',
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
    });
    // SMTP must stay untouched: the whole point is avoiding blocked ports.
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('prefers RESEND_FROM over EMAIL_FROM for the verified sender', async () => {
    setResendEnv({ RESEND_FROM: 'onboarding@resend.dev' });
    const fetchMock = mockFetchOnce({ ok: true });

    const send = await freshSend();
    await send(payload);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string).from).toBe('onboarding@resend.dev');
  });

  it('falls back to the shared Resend sender when no from address is set', async () => {
    setResendEnv({ EMAIL_FROM: undefined });
    const fetchMock = mockFetchOnce({ ok: true });

    const send = await freshSend();
    await send(payload);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string).from).toBe('onboarding@resend.dev');
  });

  it('fails with a clear error when RESEND_API_KEY is missing', async () => {
    setResendEnv({ RESEND_API_KEY: undefined });
    const fetchMock = mockFetchOnce({ ok: true });

    const send = await freshSend();
    await expect(send(payload)).rejects.toThrow(
      'Missing required email env var: RESEND_API_KEY (required when EMAIL_MODE=resend)'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a provider rejection without leaking the API key', async () => {
    setResendEnv();
    mockFetchOnce({ ok: false, status: 422, body: 'domain is not verified' });

    const send = await freshSend();
    await expect(send(payload)).rejects.toThrow(/HTTP 422.*domain is not verified/s);
    await expect(send(payload)).rejects.not.toThrow(/test-resend-key/);
  });

  it('truncates a verbose provider body so recipient content cannot leak', async () => {
    setResendEnv();
    mockFetchOnce({ ok: false, status: 500, body: 'x'.repeat(5000) });

    const send = await freshSend();
    await expect(send(payload)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/^Resend API request failed \(HTTP 500\): x{200}$/),
      })
    );
  });

  it('aborts a stalled provider request instead of hanging the caller', async () => {
    setResendEnv();
    // Reject on abort the way fetch does, proving the timeout wiring is live.
    global.fetch = jest.fn((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))
        );
      });
    }) as unknown as typeof fetch;

    jest.useFakeTimers();
    const send = await freshSend();
    const pending = send(payload);
    const assertion = expect(pending).rejects.toThrow(/aborted/i);
    jest.advanceTimersByTime(10_000);
    await assertion;
    jest.useRealTimers();
  });

  it('verifies transport by config presence without sending a probe email', async () => {
    setResendEnv();
    const fetchMock = mockFetchOnce({ ok: true });

    const { verifyEmailTransport } = await import('../services/email.service');
    await expect(verifyEmailTransport()).resolves.toEqual({
      mode: 'resend',
      verified: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('email.service send() - invalid mode', () => {
  it('rejects an unsupported EMAIL_MODE with a clear error', async () => {
    process.env.EMAIL_MODE = 'carrier-pigeon';
    const send = await freshSend();
    await expect(send(payload)).rejects.toThrow('Unsupported EMAIL_MODE: carrier-pigeon');
  });
});

describe('check-email command', () => {
  // Unlike the other suites, check-email imports ../env inside the test, so
  // dotenv re-reads the developer's real server/.env after setup-env.ts has
  // already cleared it. Stub the loader so "missing SMTP_HOST" stays missing
  // on a configured laptop as well as on CI.
  beforeEach(() => {
    jest.doMock('dotenv', () => ({
      __esModule: true,
      default: { config: jest.fn() },
      config: jest.fn(),
    }));
  });

  it('preserves the explicit missing-environment message', async () => {
    process.env.EMAIL_MODE = 'smtp';
    const error = jest.fn();
    const { runEmailCheck } = await import('../scripts/check-email');

    const exitCode = await runEmailCheck({ error, log: jest.fn() });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      '[email-check] failed: Missing required email env var: SMTP_HOST (required when EMAIL_MODE=smtp)'
    );
  });

  it('maps secret-bearing transport exceptions to a stable failure message', async () => {
    const secret = 'smtp-password=transport-secret';
    const error = jest.fn();
    const { runEmailCheck } = await import('../scripts/check-email');

    const exitCode = await runEmailCheck({
      verify: async () => {
        throw new Error(secret);
      },
      error,
      log: jest.fn(),
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      '[email-check] failed: transport_verification_failed'
    );
    expect(error.mock.calls.flat().join('\n')).not.toContain(secret);
  });
});
