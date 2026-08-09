export const serverStartTime = Date.now();

export interface AdminLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  hop: string;
  message: string;
  signature?: string;
  latencyMs?: number;
}

export const adminLogBuffer: AdminLogEntry[] = [];

export function logAdminEvent(
  level: "info" | "warn" | "error",
  hop: string,
  message: string,
  signature?: string,
  latencyMs?: number
) {
  adminLogBuffer.unshift({
    timestamp: new Date().toISOString(),
    level,
    hop,
    message,
    signature,
    latencyMs
  });
  if (adminLogBuffer.length > 200) adminLogBuffer.pop();
}

/* The hardcoded demo dex ("adminDexStore", three species with placeholder
 * smiley-face SVGs) and the three fake seed log lines are gone. The Dex Gate
 * now reads the real `dex` and `dex_candidates` collections
 * (platform/adminRoutes.ts), and the log buffer is fed by the pipeline as
 * scans actually run (routes/pipeline.routes.ts). The only line seeded at
 * boot is the honest one below. */
logAdminEvent("info", "System", "Server started. Pipeline ready; log buffer empty until the first scan.");
