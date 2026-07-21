import { rmSync } from 'fs';
import path from 'path';

export function cleanServerDist(serverRoot = path.resolve(__dirname, '..')): void {
  const resolvedRoot = path.resolve(serverRoot);
  const distPath = path.resolve(resolvedRoot, 'dist');
  if (path.dirname(distPath) !== resolvedRoot || path.basename(distPath) !== 'dist') {
    throw new Error(`Refusing to clean unexpected build path: ${distPath}`);
  }
  rmSync(distPath, { recursive: true, force: true });
}

if (require.main === module) {
  cleanServerDist();
}
