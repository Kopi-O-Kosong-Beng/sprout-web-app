import {
  buildPosixLsofArgs,
  cleanupFirestoreEmulator,
  isSamePortOwner,
  parseFirestoreJavaCommand,
  resolveTestExitCode,
  runFirestoreEmulatorTests,
  type EmulatorProcessController,
  type PortOwner,
} from '../scripts/run-firestore-emulator-tests';

const expectedOwner: PortOwner = {
  processId: 4242,
  executable: 'java.exe',
  commandLine:
    'java -jar cloud-firestore-emulator-v1.19.8.jar --project_id sprout-test --port 8080',
};

function createController(
  overrides: Partial<EmulatorProcessController> = {}
): EmulatorProcessController {
  return {
    platform: 'win32',
    isPortOpen: async () => false,
    listPortOwners: async () => [],
    guardedTerminate: async () => undefined,
    ...overrides,
  };
}

describe('Firestore emulator test runner', () => {
  it.each([
    [
      'Windows',
      '"C:\\Program Files\\Java\\bin\\java.exe" -jar "C:\\Users\\test\\cloud-firestore-emulator-v1.19.8.jar" --project_id sprout-test',
    ],
    [
      'POSIX',
      '/usr/bin/java -jar /tmp/cloud-firestore-emulator-v1.21.0.jar --project_id=sprout-test',
    ],
  ])('parses a legitimate %s Java emulator command', (_platform, commandLine) => {
    expect(parseFirestoreJavaCommand(commandLine)).toEqual({
      jarBasename: expect.stringMatching(/^cloud-firestore-emulator-v\d+\.\d+\.\d+\.jar$/),
      projectId: 'sprout-test',
    });
  });

  it('builds POSIX lsof arguments for the loopback listening endpoint only', () => {
    expect(buildPosixLsofArgs()).toEqual([
      '-nP',
      '-iTCP@127.0.0.1:8080',
      '-sTCP:LISTEN',
      '-t',
    ]);
  });

  it('compares complete process identity without accepting missing or changed fields', () => {
    expect(isSamePortOwner(expectedOwner, expectedOwner)).toBe(true);
    expect(isSamePortOwner(expectedOwner, { ...expectedOwner, processId: 0 })).toBe(false);
    expect(isSamePortOwner(expectedOwner, { ...expectedOwner, executable: 'java' })).toBe(false);
    expect(
      isSamePortOwner(expectedOwner, { ...expectedOwner, commandLine: 'java changed' })
    ).toBe(false);
  });

  it('uses fully mocked Windows cleanup and guarded termination', async () => {
    const guardedTerminate = jest.fn(async () => undefined);
    const controller = createController({
      listPortOwners: async () => [expectedOwner],
      guardedTerminate,
    });

    await expect(cleanupFirestoreEmulator(controller)).resolves.toBe(true);
    expect(guardedTerminate).toHaveBeenCalledWith(expectedOwner);
  });

  it('uses fully mocked POSIX cleanup and guarded termination', async () => {
    const guardedTerminate = jest.fn(async () => undefined);
    const controller = createController({
      platform: 'linux',
      listPortOwners: async () => [
        {
          ...expectedOwner,
          executable: '/usr/bin/java',
        },
      ],
      guardedTerminate,
    });

    await expect(cleanupFirestoreEmulator(controller)).resolves.toBe(true);
    expect(guardedTerminate).toHaveBeenCalledTimes(1);
  });

  it('rejects a near-match project ID before termination', async () => {
    const guardedTerminate = jest.fn(async () => undefined);
    const controller = createController({
      listPortOwners: async () => [
        {
          ...expectedOwner,
          commandLine:
            'java -jar cloud-firestore-emulator.jar --project_id sprout-test-prod',
        },
      ],
      guardedTerminate,
    });

    await expect(cleanupFirestoreEmulator(controller)).rejects.toThrow(
      'unexpected process'
    );
    expect(guardedTerminate).not.toHaveBeenCalled();
  });

  it('rejects a near-match Firestore emulator JAR before termination', async () => {
    const guardedTerminate = jest.fn(async () => undefined);
    const controller = createController({
      listPortOwners: async () => [
        {
          ...expectedOwner,
          commandLine:
            'java -jar my-cloud-firestore-emulator-backup.jar --project_id sprout-test',
        },
      ],
      guardedTerminate,
    });

    await expect(cleanupFirestoreEmulator(controller)).rejects.toThrow(
      'unexpected process'
    );
    expect(guardedTerminate).not.toHaveBeenCalled();
  });

  it.each([
    {
      ...expectedOwner,
      executable: 'C:\\Program Files\\Node\\node.exe',
    },
    {
      ...expectedOwner,
      commandLine: 'java -jar unrelated-service.jar --project_id sprout-test',
    },
  ])('rejects a non-Java or non-emulator owner', async (owner) => {
    const guardedTerminate = jest.fn(async () => undefined);
    const controller = createController({
      listPortOwners: async () => [owner],
      guardedTerminate,
    });

    await expect(cleanupFirestoreEmulator(controller)).rejects.toThrow(
      'unexpected process'
    );
    expect(guardedTerminate).not.toHaveBeenCalled();
  });

  it('handles multiple owners fail-closed before any termination', async () => {
    const guardedTerminate = jest.fn(async () => undefined);
    const controller = createController({
      listPortOwners: async () => [
        expectedOwner,
        {
          ...expectedOwner,
          processId: 9999,
        },
      ],
      guardedTerminate,
    });

    await expect(cleanupFirestoreEmulator(controller)).rejects.toThrow(
      'multiple process owners'
    );
    expect(guardedTerminate).not.toHaveBeenCalled();
  });

  it('rejects an identity change inside guarded termination', async () => {
    const controller = createController({
      listPortOwners: async () => [expectedOwner],
      guardedTerminate: async () => {
        throw new Error('process identity changed before termination');
      },
    });

    await expect(cleanupFirestoreEmulator(controller)).rejects.toThrow(
      'identity changed'
    );
  });

  it('refuses an occupied port before Firebase or Jest can start', async () => {
    const runCommand = jest.fn(async () => 0);
    const controller = createController({ isPortOpen: async () => true });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(runFirestoreEmulatorTests(runCommand, controller)).resolves.toBe(1);
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('preserves Firebase or Jest failure and fails a cleanup-only error', () => {
    expect(resolveTestExitCode(7, new Error('cleanup failed'))).toBe(7);
    expect(resolveTestExitCode(0, new Error('cleanup failed'))).toBe(1);
    expect(resolveTestExitCode(0)).toBe(0);
  });
});
