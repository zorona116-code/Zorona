export function createStateStore({ readJsonWithStatus, writeJson, storageReady, dbReady = storageReady, allowEphemeral = false, stateKey, menuVersion, products, reservations }) {
  const PERSIST_DEBOUNCE_MS = 250;
  let persistQueue = Promise.resolve(true);
  let persistTimer = null;
  let persistRequested = false;
  let persistWaiters = [];
  let restoreStatus = 'not_started';
  let restoredAt = null;
  let lastPersistAt = null;
  const persistenceReady = dbReady || storageReady;
  let lastPersistOk = persistenceReady ? null : Boolean(allowEphemeral);

  const settlePersistWaiters = (result, waiters) => {
    for (const resolve of waiters) resolve(result);
  };

  async function restore() {
    restoreStatus = persistenceReady ? 'reading' : 'storage_not_configured';
    if (!persistenceReady) {
      restoredAt = new Date().toISOString();
      return;
    }
    const result = await readJsonWithStatus(stateKey);
    if (!result.ok) {
      restoreStatus = 'restore_failed';
      restoredAt = new Date().toISOString();
      lastPersistOk = false;
      throw new Error('State snapshot could not be restored from storage.');
    }
    const saved = result.value;
    if (!result.found || !saved || typeof saved !== 'object') {
      restoreStatus = 'no_snapshot';
      restoredAt = new Date().toISOString();
      return;
    }
    if (saved.menuVersion === menuVersion && Array.isArray(saved.products)) {
      products.splice(0, products.length, ...saved.products);
    }
    if (Array.isArray(saved.reservations)) reservations.splice(0, reservations.length, ...saved.reservations);
    restoreStatus = 'restored';
    restoredAt = new Date().toISOString();
  }

  const flush = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!persistRequested) return persistQueue;
    persistRequested = false;
    const snapshot = structuredClone({ menuVersion, products, reservations });
    const waiters = persistWaiters;
    persistWaiters = [];
    persistQueue = persistQueue.catch(() => true).then(async () => {
      try {
        const ok = await writeJson(stateKey, snapshot);
        lastPersistOk = ok;
        lastPersistAt = new Date().toISOString();
        return ok;
      } catch {
        lastPersistOk = false;
        lastPersistAt = new Date().toISOString();
        return false;
      }
    });
    persistQueue.then(result => settlePersistWaiters(result, waiters));
    return persistQueue;
  };

  const persist = () => {
    if (!persistenceReady) return Promise.resolve(Boolean(allowEphemeral));
    if (restoreStatus === 'restore_failed') return Promise.resolve(false);

    persistRequested = true;
    const result = new Promise(resolve => persistWaiters.push(resolve));

    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        void flush();
      }, PERSIST_DEBOUNCE_MS);
      persistTimer.unref();
    }

    return result;
  };

  return {
    restore,
    persist,
    flush,
    status: () => ({
      restoreStatus,
      restoredAt,
      lastPersistAt,
      lastPersistOk
    })
  };
}
