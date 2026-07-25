import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore Emulator', () => {
  beforeEach(clearFirestore);

  it('writes and reads an isolated document', async () => {
    await getDb().collection('smoke').doc('one').set({ ok: true });
    const doc = await getDb().collection('smoke').doc('one').get();
    expect(doc.data()).toEqual({ ok: true });
  });
});
