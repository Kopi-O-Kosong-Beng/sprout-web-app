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
    process.env.SMTP_USER = 'sproutteamadmin@gmail.com';
    process.env.SMTP_PASS = 'app-password';
    process.env.EMAIL_FROM = 'sproutteamadmin@gmail.com';
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
      auth: { user: 'sproutteamadmin@gmail.com', pass: 'app-password' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'sproutteamadmin@gmail.com',
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
      expect.objectContaining({ from: 'sproutteamadmin@gmail.com' })
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

describe('email.service send() - invalid mode', () => {
  it('rejects an unsupported EMAIL_MODE with a clear error', async () => {
    process.env.EMAIL_MODE = 'carrier-pigeon';
    const send = await freshSend();
    await expect(send(payload)).rejects.toThrow('Unsupported EMAIL_MODE: carrier-pigeon');
  });
});
