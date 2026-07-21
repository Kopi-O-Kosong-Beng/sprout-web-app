import {
  cleanupFirestoreEmulator,
  resolveTestExitCode,
  type PowerShellRunner,
} from '../scripts/run-firestore-emulator-tests';

describe('Firestore emulator test runner', () => {
  it('keeps the Jest or Firebase failure code even when cleanup also fails', () => {
    expect(resolveTestExitCode(7, new Error('cleanup failed'))).toBe(7);
    expect(resolveTestExitCode(0, new Error('cleanup failed'))).toBe(1);
    expect(resolveTestExitCode(0)).toBe(0);
  });

  it('removes only a leaked sprout-test Firestore Java process', async () => {
    const commands: string[] = [];
    const runPowerShell: PowerShellRunner = async (script) => {
      commands.push(script);
      if (commands.length === 1) {
        return JSON.stringify([
          {
            processId: 4242,
            name: 'java.exe',
            commandLine:
              'java cloud-firestore-emulator-1.19.8.jar --project_id sprout-test',
          },
        ]);
      }
      return '';
    };

    await expect(cleanupFirestoreEmulator(runPowerShell)).resolves.toBe(true);
    expect(commands).toHaveLength(2);
    expect(commands[1]).toContain('Stop-Process -Id 4242 -Force');
  });

  it('refuses to stop an unrelated process listening on the Firestore port', async () => {
    const runPowerShell: PowerShellRunner = async () =>
      JSON.stringify([
        {
          processId: 9999,
          name: 'node.exe',
          commandLine: 'node unrelated-server.js',
        },
      ]);

    await expect(cleanupFirestoreEmulator(runPowerShell)).rejects.toThrow(
      'unexpected process'
    );
  });
});
