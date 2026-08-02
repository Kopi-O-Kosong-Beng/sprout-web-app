import { useMemo, useState } from 'react';
import type { AlmanacEntry } from '../services/sproutApi';

/**
 * Search over the grid.
 *
 * Two hundred cards is a lot to scan by eye, and the thing a player actually
 * wants to ask is "have we got the tembusu yet" — so this matches the
 * scientific name, the common name and the family alike.
 */
export function useAlmanacFilter(species: AlmanacEntry[]) {
  const [query, setQuery] = useState('');
  const [foundOnly, setFoundOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return species.filter((entry) => {
      if (foundOnly && !entry.discovered) return false;
      if (!needle) return true;
      return (
        entry.speciesName.toLowerCase().includes(needle) ||
        entry.family.toLowerCase().includes(needle) ||
        (entry.commonName?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [foundOnly, query, species]);

  return { query, setQuery, foundOnly, setFoundOnly, filtered };
}
