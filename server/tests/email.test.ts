const mockVerify = jest.fn();
const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({
      verify: mockVerify,
      sendMail: mockSendMail,
    })),
  },
}));

describe('email transport', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.EMAIL_FROM;
  });

  it('logs safely in console mode without constructing SMTP', async () => {
    process.env.EMAIL_MODE = 'console';
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { send } = await import('../services/email.service');
    await expect(send({ to: 'a@example.com', subject: 'Subject', text: 'Body' }))
      .resolves.toEqual({ delivered: true, mode: 'console' });
    expect(log).toHaveBeenCalled();
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
