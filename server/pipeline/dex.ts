/**
 * Sanitizes species name to speciesKey (lowercased, non-alphanumerics -> "_")
 */
export function sanitizeSpeciesKey(speciesName: string): string {
  return speciesName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}
