import { execFile, spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const FIRESTORE_PROJECT = 'sprout-test';

export interface PortOwner {
  processId: number;
  executable: string;
  commandLine: string;
}

export interface EmulatorProcessController {
  platform: NodeJS.Platform;
  isPortOpen(): Promise<boolean>;
  listPortOwners(): Promise<PortOwner[]>;
  guardedTerminate(expectedOwner: PortOwner): Promise<void>;
}

export type RunCommand = (command: string, args: string[]) => Promise<number>;

function isJavaExecutable(executable: string): boolean {
  const filename = executable.split(/[\\/]/).pop() ?? '';
  return /^java(?:\.exe)?$/i.test(filename);
}

function projectIdFrom(commandLine: string): string | null {
  const match = /(?:^|\s)--project_id(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/.exec(
    commandLine
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function isExpectedFirestoreEmulator(owner: PortOwner): boolean {
  return (
    isJavaExecutable(owner.executable) &&
    owner.commandLine.includes('cloud-firestore-emulator') &&
    projectIdFrom(owner.commandLine) === FIRESTORE_PROJECT
  );
}

function unexpectedOwnerError(owner: PortOwner): Error {
  return new Error(
    `Port ${FIRESTORE_PORT} is owned by unexpected process ${owner.processId} (${owner.executable}).`
  );
}

function encodeOwner(owner: PortOwner): string {
  return Buffer.from(JSON.stringify(owner), 'utf8').toString('base64');
}

function parsePortOwners(raw: string): PortOwner[] {
  const parsed: unknown = JSON.parse(raw || '[]');
  return Array.isArray(parsed) ? (parsed as PortOwner[]) : [parsed as PortOwner];
}

function isFirestorePortOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: FIRESTORE_HOST, port: FIRESTORE_PORT });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function runPowerShell(script: string): Promise<string> {
  return execFileAsync('powershell.exe', ['-NoProfile', '-Command', script]).then(
    ({ stdout }) => stdout
  );
}

const listWindowsPortOwners = `
$connections = Get-NetTCPConnection -LocalAddress '${FIRESTORE_HOST}' -LocalPort ${FIRESTORE_PORT} -State Listen -ErrorAction SilentlyContinue
$owners = foreach ($connection in $connections) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"
  [pscustomobject]@{
    processId = [int]$connection.OwningProcess
    executable = $process.ExecutablePath
    commandLine = $process.CommandLine
  }
}
if ($owners) { $owners | ConvertTo-Json -Compress } else { '[]' }
`;

async function listWindowsPortOwnersForTest(): Promise<PortOwner[]> {
  return parsePortOwners(await runPowerShell(listWindowsPortOwners));
}

async function guardedTerminateWindows(expectedOwner: PortOwner): Promise<void> {
  const expected = encodeOwner(expectedOwner);
  const script = `
$expected = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${expected}')) | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($expected.processId)"
if ($null -eq $process) { throw 'process identity changed before termination' }
$actual = [pscustomobject]@{
  processId = [int]$process.ProcessId
  executable = $process.ExecutablePath
  commandLine = $process.CommandLine
}
if ($actual.processId -ne $expected.processId -or $actual.executable -cne $expected.executable -or $actual.commandLine -cne $expected.commandLine) {
  throw 'process identity changed before termination'
}
if ([IO.Path]::GetFileName($actual.executable) -notmatch '^java(\\.exe)?$') {
  throw 'unexpected process during guarded termination'
}
Stop-Process -Id $actual.processId -Force
`;
  await runPowerShell(script);
}

function noPortOwners(error: unknown): boolean {
  return (error as { code?: number | string }).code === 1;
}

async function inspectPosixProcess(processId: number): Promise<PortOwner | null> {
  try {
    const [{ stdout: executable }, { stdout: commandLine }] = await Promise.all([
      execFileAsync('ps', ['-p', String(processId), '-o', 'comm=']),
      execFileAsync('ps', ['-p', String(processId), '-o', 'args=']),
    ]);
    if (!executable.trim() || !commandLine.trim()) return null;
    return { processId, executable: executable.trim(), commandLine: commandLine.trim() };
  } catch (error) {
    if (noPortOwners(error)) return null;
    throw error;
  }
}

async function listPosixPortOwners(): Promise<PortOwner[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('lsof', ['-ti', `tcp:${FIRESTORE_PORT}`]));
  } catch (error) {
    if (noPortOwners(error)) return [];
    throw error;
  }

  const owners = await Promise.all(
    stdout
      .split(/\s+/)
      .filter(Boolean)
      .map((pid) => inspectPosixProcess(Number(pid)))
  );
  return owners.filter((owner): owner is PortOwner => owner !== null);
}

async function guardedTerminatePosix(expectedOwner: PortOwner): Promise<void> {
  const script = `
actual_executable=$(ps -p "$1" -o comm= | sed 's/^ *//')
actual_command=$(ps -p "$1" -o args= | sed 's/^ *//')
if [ -z "$actual_executable" ] || [ -z "$actual_command" ] || [ "$actual_executable" != "$EXPECTED_EXECUTABLE" ] || [ "$actual_command" != "$EXPECTED_COMMAND_LINE" ]; then
  echo 'process identity changed before termination' >&2
  exit 1
fi
case "\${actual_executable##*/}" in java|java.exe) ;; *) echo 'unexpected process during guarded termination' >&2; exit 1 ;; esac
kill -TERM "$1"
`;
  await execFileAsync('sh', ['-c', script, '--', String(expectedOwner.processId)], {
    env: {
      ...process.env,
      EXPECTED_EXECUTABLE: expectedOwner.executable,
      EXPECTED_COMMAND_LINE: expectedOwner.commandLine,
    },
  });
}

export function createSystemProcessController(
  platform: NodeJS.Platform = process.platform
): EmulatorProcessController {
  if (platform === 'win32') {
    return {
      platform: 'win32',
      isPortOpen: isFirestorePortOpen,
      listPortOwners: listWindowsPortOwnersForTest,
      guardedTerminate: guardedTerminateWindows,
    };
  }

  return {
    platform,
    isPortOpen: isFirestorePortOpen,
    listPortOwners: listPosixPortOwners,
    guardedTerminate: guardedTerminatePosix,
  };
}

export async function cleanupFirestoreEmulator(
  controller: EmulatorProcessController = createSystemProcessController()
): Promise<boolean> {
  const owners = await controller.listPortOwners();
  if (owners.length === 0) return false;
  if (owners.length > 1) {
    throw new Error(`Port ${FIRESTORE_PORT} has multiple process owners; refusing cleanup.`);
  }

  for (const owner of owners) {
    if (!isExpectedFirestoreEmulator(owner)) throw unexpectedOwnerError(owner);
  }

  for (const owner of owners) {
    await controller.guardedTerminate(owner);
  }
  return true;
}

async function waitForFirestorePortToClose(
  controller: Pick<EmulatorProcessController, 'isPortOpen'>
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (await controller.isPortOpen()) {
    if (Date.now() >= deadline) {
      throw new Error(`Firestore Emulator still listens on ${FIRESTORE_HOST}:${FIRESTORE_PORT}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function runProcess(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

export function resolveTestExitCode(
  emulatorExitCode: number,
  cleanupError?: Error
): number {
  if (emulatorExitCode !== 0) return emulatorExitCode;
  return cleanupError ? 1 : 0;
}

export async function runFirestoreEmulatorTests(
  runCommand: RunCommand = runProcess,
  controller: EmulatorProcessController = createSystemProcessController()
): Promise<number> {
  if (await controller.isPortOpen()) {
    console.error(`Firestore Emulator port ${FIRESTORE_PORT} must be free before tests start.`);
    return 1;
  }

  let emulatorExitCode = 1;
  let cleanupError: Error | undefined;
  try {
    const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase.js');
    emulatorExitCode = await runCommand(process.execPath, [
      firebaseCli,
      'emulators:exec',
      '--project',
      FIRESTORE_PROJECT,
      '--only',
      'firestore',
      'jest --runInBand',
    ]);
  } catch (error) {
    console.error(error);
  } finally {
    try {
      await cleanupFirestoreEmulator(controller);
      await waitForFirestorePortToClose(controller);
    } catch (error) {
      cleanupError = error instanceof Error ? error : new Error(String(error));
      console.error(cleanupError);
    }
  }

  return resolveTestExitCode(emulatorExitCode, cleanupError);
}

if (require.main === module) {
  void runFirestoreEmulatorTests().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
