import { getDb } from '../firebase';
import type { AuthUserProfile } from '../models/auth';

export async function clearFirestore(): Promise<void> {
  const db = getDb();
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
}

export async function seedFirestoreUser(profile: AuthUserProfile): Promise<void> {
  await getDb().collection('users').doc(profile.id).set(profile);
}
