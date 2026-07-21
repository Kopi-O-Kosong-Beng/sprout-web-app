import { execFile, spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const FIRESTORE_PROJECT = 'sprout-test';

export type PowerShellRunner = (script: string) => Promise<string>;

interface PortOwner {
  processId: number;
  name: string;
  commandLine: string;
}

function runPowerShell(script: string): Promise<string> {
  return execFileAsync('powershell.exe', ['-NoProfile', '-Command', script]).then(
    ({ stdout }) => stdout
  );
}

function parsePortOwners(raw: string): PortOwner[] {
  const parsed: unknown = JSON.parse(raw || '[]');
  if (!Array.isArray(parsed)) return [parsed as PortOwner];
  return parsed as PortOwner[];
}

function isExpectedFirestoreEmulator(owner: PortOwner): boolean {
  return (
    owner.name.toLowerCase() === 'java.exe' &&
    owner.commandLine.includes('cloud-firestore-emulator') &&
    /--project_id(?:=|\s+)sprout-test\b/.test(owner.commandLine)
  );
}

const listWindowsPortOwners = `
$connections = Get-NetTCPConnection -LocalAddress '${FIRESTORE_HOST}' -LocalPort ${FIRESTORE_PORT} -State Listen -ErrorAction SilentlyContinue
$owners = foreach ($connection in $connections) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"
  [pscustomobject]@{
    processId = [int]$connection.OwningProcess
    name = $process.Name
    commandLine = $process.CommandLine
  }
}
if ($owners) { $owners | ConvertTo-Json -Compress } else { '[]' }
`;

export async function cleanupFirestoreEmulator(
  powerShell: PowerShellRunner = runPowerShell
): Promise<boolean> {
  if (process.platform === 'win32') {
    const owners = parsePortOwners(await powerShell(listWindowsPortOwners));
    if (owners.length === 0) return false;

    for (const owner of owners) {
      if (!isExpectedFirestoreEmulator(owner)) {
        throw new Error(
          `Port ${FIRESTORE_PORT} is owned by unexpected process ${owner.processId} (${owner.name}).`
        );
      }
    }

    await Promise.all(
      owners.map((owner) =>
        powerShell(`Stop-Process -Id ${owner.processId} -Force`)
      )
    );
    return true;
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('lsof', ['-ti', `tcp:${FIRESTORE_PORT}`]));
  } catch (error) {
    if ((error as { code?: number | string }).code === 1) return false;
    throw error;
  }

  const pids = stdout
    .split(/\s+/)
    .filter(Boolean)
    .map((pid) => Number(pid));
  for (const pid of pids) {
    const { stdout: commandLine } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
    if (!commandLine.includes('cloud-firestore-emulator') || !commandLine.includes(FIRESTORE_PROJECT)) {
      throw new Error(`Port ${FIRESTORE_PORT} is owned by unexpected process ${pid}.`);
    }
    process.kill(pid, 'SIGTERM');
  }
  return pids.length > 0;
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

async function waitForFirestorePortToClose(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (await isFirestorePortOpen()) {
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
  runCommand: typeof runProcess = runProcess,
  cleanup: typeof cleanupFirestoreEmulator = cleanupFirestoreEmulator
): Promise<number> {
  if (await isFirestorePortOpen()) {
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
      await cleanup();
      await waitForFirestorePortToClose();
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
