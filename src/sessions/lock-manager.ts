export function createSessionLockManager() {
  const tails = new Map<string, Promise<void>>();

  return {
    async withSessionLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
      const previous = tails.get(sessionId) ?? Promise.resolve();
      let releaseCurrent!: () => void;
      const current = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      });
      tails.set(sessionId, previous.then(() => current));

      await previous;

      try {
        return await work();
      } finally {
        releaseCurrent();
        if (tails.get(sessionId) === current) {
          tails.delete(sessionId);
        }
      }
    },
  };
}
