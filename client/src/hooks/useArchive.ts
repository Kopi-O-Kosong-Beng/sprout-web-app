import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlantAvatarData } from '../components/common/PlantVisuals';
import { extractApiError } from '../services/apiClient';
import {
  deleteAvatar,
  listOwnedAvatars,
  setDemoAvatars,
  type AvatarRecord,
} from '../services/sproutApi';
import { toPlantAvatarData } from '../utils/avatarPresentation';

const DEMO_SET_VERSION = 'checkoff3-v1';
const DEMO_TEMPLATE_IDS = [
  'demo-avatar-helianthus-annuus',
  'demo-avatar-quercus-robur',
  'demo-avatar-monstera-deliciosa',
  'demo-avatar-ficus-lyrata',
  'demo-avatar-amanita-muscaria',
] as const;
const ARCHIVE_PAGE_SIZE = 100;

export type ArchiveStatus = 'loading' | 'ready' | 'error' | 'mutating';

export interface UseArchiveResult {
  avatars: PlantAvatarData[];
  status: ArchiveStatus;
  error: string | null;
  demoEnabled: boolean;
  setDemoEnabled: (enabled: boolean) => Promise<void>;
  /** Deletes one plant for good, then refreshes the shelves. Throws on
   *  failure so the caller's dialog can stay open and say why. */
  removePlant: (avatarId: string) => Promise<void>;
  retry: () => void;
}

function demoTemplateId(record: AvatarRecord): string | null {
  const metadata = record.metadata;
  if (
    metadata?.isDemo !== true ||
    metadata.version !== DEMO_SET_VERSION ||
    typeof metadata.templateId !== 'string'
  ) {
    return null;
  }
  return metadata.templateId;
}

async function fetchAllOwnedAvatars(
  shouldContinue: () => boolean
): Promise<AvatarRecord[]> {
  const recordsById = new Map<string, AvatarRecord>();
  let requestedPage = 1;

  while (shouldContinue()) {
    const result = await listOwnedAvatars(requestedPage, ARCHIVE_PAGE_SIZE);
    if (!shouldContinue()) break;
    if (result.page !== requestedPage) break;

    const previousCount = recordsById.size;
    for (const record of result.items) recordsById.set(record.id, record);

    const total =
      Number.isFinite(result.total) && result.total >= 0
        ? result.total
        : recordsById.size;
    if (recordsById.size >= total) break;
    if (result.items.length === 0 || recordsById.size === previousCount) break;

    requestedPage = result.page + 1;
  }

  return [...recordsById.values()];
}

export function useArchive(): UseArchiveResult {
  const [records, setRecords] = useState<AvatarRecord[]>([]);
  const [status, setStatus] = useState<ArchiveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadArchive = useCallback(async () => {
    const request = ++requestVersion.current;
    setStatus('loading');
    setError(null);
    try {
      const nextRecords = await fetchAllOwnedAvatars(
        () => request === requestVersion.current
      );
      if (request !== requestVersion.current) return;
      setRecords(nextRecords);
      setStatus('ready');
    } catch (caught) {
      if (request !== requestVersion.current) return;
      setError(extractApiError(caught, 'Could not load your archive.'));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadArchive();
    return () => {
      requestVersion.current += 1;
    };
  }, [loadArchive]);

  const setDemoEnabled = useCallback(async (enabled: boolean) => {
    const request = ++requestVersion.current;
    setStatus('mutating');
    setError(null);
    try {
      await setDemoAvatars(enabled);
      if (request !== requestVersion.current) return;
      const nextRecords = await fetchAllOwnedAvatars(
        () => request === requestVersion.current
      );
      if (request !== requestVersion.current) return;
      setRecords(nextRecords);
      setStatus('ready');
    } catch (caught) {
      if (request !== requestVersion.current) return;
      setError(extractApiError(caught, 'Could not update demo plants.'));
      setStatus('error');
    }
  }, []);

  const removePlant = useCallback(async (avatarId: string) => {
    const request = ++requestVersion.current;
    setStatus('mutating');
    setError(null);
    // Two failure modes, two different truths. If the DELETE itself fails the
    // plant still exists and the dialog should say so. If the delete COMMITTED
    // and only the follow-up refresh failed, reporting "could not remove"
    // over shelves that still show the dead record invites a second dig —
    // which the server then 404s. So the record is dropped locally the moment
    // the server confirms, and a refresh failure degrades to a quieter sync.
    try {
      await deleteAvatar(avatarId);
    } catch (caught) {
      if (request === requestVersion.current) setStatus('ready');
      throw new Error(extractApiError(caught, 'Could not remove that plant.'));
    }
    if (request !== requestVersion.current) return;
    setRecords((current) => current.filter((record) => record.id !== avatarId));
    try {
      const nextRecords = await fetchAllOwnedAvatars(
        () => request === requestVersion.current
      );
      if (request !== requestVersion.current) return;
      setRecords(nextRecords);
      setStatus('ready');
    } catch {
      // The removal succeeded; only the resync is stale. The local filter
      // above already reflects the delete.
      if (request === requestVersion.current) setStatus('ready');
    }
  }, []);

  const avatars = useMemo(() => records.map(toPlantAvatarData), [records]);
  const demoEnabled = useMemo(() => {
    const templateIds = new Set(
      records.map(demoTemplateId).filter((id): id is string => id !== null)
    );
    return DEMO_TEMPLATE_IDS.every((templateId) => templateIds.has(templateId));
  }, [records]);

  return {
    avatars,
    status,
    error,
    demoEnabled,
    setDemoEnabled,
    removePlant,
    retry: () => void loadArchive(),
  };
}
