import { useEffect, useState } from 'react';
import { collection, db, onSnapshot, query } from '../lib/firebase';

export interface DexDoc {
  id: string;
  speciesKey?: string;
  canonicalName?: string;
  commonNames?: string[];
  spriteUrl?: string;
  firstDiscoveredBy?: string;
  firstDiscoveredAt?: string;
  producedByTier?: string;
  paletteVersion?: string;
  status?: string;
  evalScores?: Record<string, unknown>;
}

/**
 * Live subscription to the Firestore `dex` collection. Lifted to the app shell
 * so the sidebar count and the Dex page share one listener.
 */
export function useDexCollection(): DexDoc[] {
  const [docs, setDocs] = useState<DexDoc[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'dex')),
      (snapshot) => {
        const next: DexDoc[] = [];
        snapshot.forEach((snap) => next.push({ id: snap.id, ...snap.data() } as DexDoc));
        setDocs(next);
      },
      (err) => console.warn('Firestore dex listener:', err.message),
    );

    return () => unsubscribe();
  }, []);

  return docs;
}
