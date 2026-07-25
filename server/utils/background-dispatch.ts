export class InMemoryBackgroundDispatcher {
  private readonly inFlight = new Set<Promise<void>>();

  dispatch(failureCode: string, work: () => Promise<void>): void {
    const job = Promise.resolve()
      .then(work)
      .catch(() => {
        console.error(`[background] ${failureCode}`);
      })
      .finally(() => {
        this.inFlight.delete(job);
      });
    this.inFlight.add(job);
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
  }
}

export const backgroundDispatcher = new InMemoryBackgroundDispatcher();
