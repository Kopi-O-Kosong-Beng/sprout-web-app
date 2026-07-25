import type { DocumentData } from 'firebase-admin/firestore';

export interface FirestoreSnapshotLike {
  id: string;
  data(): DocumentData | undefined;
}

export function invalidFirestoreDocument(
  collectionName: string,
  documentId: string,
  reason: string
): Error {
  return new Error(
    `Invalid Firestore ${collectionName} document ${documentId}: ${reason}.`
  );
}

export function requireDocumentData(
  snapshot: FirestoreSnapshotLike,
  collectionName: string
): DocumentData {
  const data = snapshot.data();
  if (!data) {
    throw invalidFirestoreDocument(collectionName, snapshot.id, 'data is missing');
  }
  return data;
}

export function requireString(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidFirestoreDocument(
      collectionName,
      documentId,
      `${fieldName} must be a non-empty string`
    );
  }
  return value;
}

export function requireBoolean(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): boolean {
  if (typeof value !== 'boolean') {
    throw invalidFirestoreDocument(
      collectionName,
      documentId,
      `${fieldName} must be a boolean`
    );
  }
  return value;
}

export function requireFiniteNumber(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidFirestoreDocument(
      collectionName,
      documentId,
      `${fieldName} must be a finite number`
    );
  }
  return value;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value);
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return (value as { toDate(): Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeRequiredTimestamp(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): string {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    throw invalidFirestoreDocument(
      collectionName,
      documentId,
      `${fieldName} must be a timestamp`
    );
  }
  return date.toISOString();
}

export function normalizeOptionalTimestamp(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): string | undefined {
  if (value === undefined) return undefined;
  return normalizeRequiredTimestamp(value, fieldName, collectionName, documentId);
}

export function normalizeNullableTimestamp(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return normalizeRequiredTimestamp(value, fieldName, collectionName, documentId);
}

export function optionalNullableString(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') {
    throw invalidFirestoreDocument(
      collectionName,
      documentId,
      `${fieldName} must be a string or null`
    );
  }
  return value;
}

export function optionalAuditTimestamp(
  value: unknown,
  fieldName: string,
  collectionName: string,
  documentId: string
): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return normalizeRequiredTimestamp(value, fieldName, collectionName, documentId);
}
