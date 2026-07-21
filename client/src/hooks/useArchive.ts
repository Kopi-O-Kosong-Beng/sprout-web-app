import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlantAvatarData } from '../components/common/PlantVisuals';
import { extractApiError } from '../services/apiClient';
import {
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

export type ArchiveStatus = 'loading' | 'ready' | 'error' | 'mutating';

export interface UseArchiveResult {
  avatars: PlantAvatarData[];
  status: ArchiveStatus;
  error: string | null;
  demoEnabled: boolean;
  setDemoEnabled: (enabled: boolean) => Promise<void>;
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
      const page = await listOwnedAvatars();
      if (request !== requestVersion.current) return;
      setRecords(page.items);
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
      const page = await listOwnedAvatars();
      if (request !== requestVersion.current) return;
      setRecords(page.items);
      setStatus('ready');
    } catch (caught) {
      if (request !== requestVersion.current) return;
      setError(extractApiError(caught, 'Could not update demo plants.'));
      setStatus('error');
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
    retry: () => void loadArchive(),
  };
}
