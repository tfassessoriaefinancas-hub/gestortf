import type { CrmResource, CrmRevisions } from './crm-resources.ts';

/** One serialized check, with a follow-up if a save happens during a request. */
export function createResourceSync(options: {
  revisions: () => Promise<CrmRevisions>;
  load: (resource: CrmResource) => Promise<boolean | void>;
  scopeChanged: () => void;
  error: (error: unknown) => void;
}) {
  const loaded = new Map<CrmResource, string>();
  let resources: readonly CrmResource[] = [];
  let scope: string | undefined;
  let pending = false;
  let disposed = false;
  let running: Promise<void> | undefined;
  async function drain() {
    while (pending && !disposed) {
      pending = false;
      try {
        // Capture BEFORE reading data. Concurrent commits remain detectable on
        // the next check, even if several paginated reads straddle a commit.
        const revisions = await options.revisions();
        if (disposed) return;
        if (scope !== undefined && scope !== revisions.scope) {
          disposed = true;
          options.scopeChanged();
          return;
        }
        scope = revisions.scope;
        const changed = resources.filter(resource => loaded.get(resource) !== revisions[resource]);
        const outcomes = await Promise.allSettled(changed.map(async resource => {
          const accepted = await options.load(resource);
          if (!disposed && accepted !== false) loaded.set(resource, revisions[resource]);
        }));
        for (const result of outcomes) if (result.status === 'rejected') throw result.reason;
      } catch (error) {
        if (!disposed) options.error(error);
      }
    }
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    pending = true;
    // Coalesce local notifications and view effects in the same event turn.
    if (!running) running = Promise.resolve().then(drain).finally(() => {
      running = undefined;
      if (pending && !disposed) void refresh();
    });
    return running;
  }
  return {
    refresh,
    setResources(next: readonly CrmResource[]) { resources = [...new Set(next)]; return refresh(); },
    dispose() { disposed = true; pending = false; },
  };
}
