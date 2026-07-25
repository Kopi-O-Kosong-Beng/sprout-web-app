import { InMemoryBackgroundDispatcher } from '../utils/background-dispatch';

describe('InMemoryBackgroundDispatcher', () => {
  it('consumes rejected work and logs only its controlled failure code', async () => {
    const secret = 'provider-password=do-not-log';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const dispatcher = new InMemoryBackgroundDispatcher();

    try {
      dispatcher.dispatch('controlled_dispatch_failure', async () => {
        throw new Error(secret);
      });
      await dispatcher.waitForIdle();

      const logs = errorSpy.mock.calls.flat().join('\n');
      expect(logs).toContain('controlled_dispatch_failure');
      expect(logs).not.toContain(secret);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
