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

// Seed initial system logs
logAdminEvent("info", "System", "Server initialized on port 3000. Pipeline ready.", undefined, 0);
logAdminEvent("info", "Config", "Gemini 3.5 Flash Lite registered as primary vision model.", undefined, 0);
logAdminEvent("warn", "Hop 1b", "NVIDIA Gemma 4 31B registered as secondary fallback vision model (tail latency warning: >21s).", "NVIDIA_FALLBACK_LATENCY", 21200);

export const adminDexStore: Record<string, any> = {
  "polygala-calcarea": {
    id: "polygala-calcarea",
    species: "Polygala calcarea",
    commonName: "Chalk Milkwort",
    status: "APPROVED",
    cuteScore: 4.8,
    paletteMatch: "100%",
    dimensions: "192x192",
    craftedPrompt: "Polygala calcarea as a cute pixel art plant monster, thick black outlines (2-4px), flat cel-shading, vivid gentian blue blossoms",
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    spriteUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiB2aWV3Qm94PSIwIDAgMTkyIDE5MiIgc3R5bGU9ImJhY2tncm91bmQ6dHJhbnNwYXJlbnQiPjxyZWN0IHg9IjMyIiB5PSIzMiIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSI2NCIgZmlsbD0iIzgwRDIyRSIgc3Ryb2tlPSIjMUUxRTJFIiBzdHJva2Utd2lkdGg9IjYiLz48Y2lyY2xlIGN4PSI3MCIgY3k9Ijg1IiByPSIxMCIgZmlsbD0iIzFFMUUyRSIvPjxjaXJjbGUgY3g9IjEyMiIgY3k9Ijg1IiByPSIxMCIgZmlsbD0iIzFFMUUyRSIvPjxwYXRoIGQ9Ik0gODAgMTE1IFEgOTYgMTMwIDExMiAxMTUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFFMUUyRSIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4="
  },
  "brugmansia-candida": {
    id: "brugmansia-candida",
    species: "Brugmansia candida",
    commonName: "Angel's Trumpet",
    status: "APPROVED",
    cuteScore: 4.5,
    paletteMatch: "98%",
    dimensions: "192x192",
    craftedPrompt: "Brugmansia candida as a cute pixel art plant monster, thick black outlines (2-4px), pendant yellow bell flowers",
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    spriteUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiB2aWV3Qm94PSIwIDAgMTkyIDE5MiIgc3R5bGU9ImJhY2tncm91bmQ6dHJhbnNwYXJlbnQiPjxyZWN0IHg9IjMyIiB5PSIzMiIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSI2NCIgZmlsbD0iI0ZERjc2MiIgc3Ryb2tlPSIjMUUxRTJFIiBzdHJva2Utd2lkdGg9IjYiLz48Y2lyY2xlIGN4PSI3MCIgY3k9Ijg1IiByPSIxMCIgZmlsbD0iIzFFMUUyRSIvPjxjaXJjbGUgY3g9IjEyMiIgY3k9Ijg1IiByPSIxMCIgZmlsbD0iIzFFMUUyRSIvPjxwYXRoIGQ9Ik0gODAgMTE1IFEgOTYgMTMwIDExMiAxMTUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFFMUUyRSIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4="
  },
  "melastoma-malabathricum": {
    id: "melastoma-malabathricum",
    species: "Melastoma malabathricum",
    commonName: "Straits Rhododendron",
    status: "PENDING",
    cuteScore: 3.8,
    paletteMatch: "95%",
    dimensions: "192x192",
    craftedPrompt: "Melastoma malabathricum as a cute pixel art plant monster, magenta-pink flowers, golden spiraling stamens",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    spriteUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiB2aWV3Qm94PSIwIDAgMTkyIDE5MiIgc3R5bGU9ImJhY2tncm91bmQ6dHJhbnNwYXJlbnQiPjxyZWN0IHg9IjMyIiB5PSIzMiIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSI2NCIgZmlsbD0iI0RFNEM4QSIgc3Ryb2tlPSIjMUUxRTJFIiBzdHJva2Utd2lkdGg9IjYiLz48Y2lyY2xlIGN4PSI3MCIgY3k9Ijg1IiByPSIxMCIgZmlsbD0iIzFFMUUyRSIvPjxjaXJjbGUgY3g9IjEyMiIgY3k9Ijg1IiByPSIxMCIgZmlsbD0iIzFFMUUyRSIvPjxwYXRoIGQ9Ik0gODAgMTE1IFEgOTYgMTMwIDExMiAxMTUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFFMUUyRSIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4="
  }
};
