import {
  parseInspectMode,
  redactFirestoreDocument,
} from '../scripts/inspect-firestore';

describe('Firestore inspection safety', () => {
  it('requires an explicit flag before documents are included', () => {
    expect(parseInspectMode([])).toEqual({ includeDocuments: false });
    expect(parseInspectMode(['--include-documents'])).toEqual({
      includeDocuments: true,
    });
    expect(() => parseInspectMode(['--verbose'])).toThrow(
      'Use --include-documents to print redacted summaries.'
    );
  });

  it('redacts secret-bearing and personal fields from document summaries', () => {
    expect(
      redactFirestoreDocument('users', 'user-1', {
        id: 'user-1',
        email: 'private@example.com',
        displayName: 'Private User',
        passwordHash: 'secret-hash',
        resetOtpHash: 'secret-otp',
        isVerified: true,
      })
    ).toEqual({ id: 'user-1', displayName: 'Private User', isVerified: true });

    expect(
      redactFirestoreDocument('query_tickets', 'ticket-1', {
        refNumber: 'SPR-20260722-0001',
        email: 'private@example.com',
        message: 'private message',
        category: 'general',
        status: 'open',
      })
    ).toEqual({
      id: 'ticket-1',
      refNumber: 'SPR-20260722-0001',
      category: 'general',
      status: 'open',
    });
  });
});
