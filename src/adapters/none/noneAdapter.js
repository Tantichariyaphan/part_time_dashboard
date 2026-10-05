// "No source" adapter: what production looks like before the real Source/Copy Process exists.
// Every tab is absent, so the freshness rule shows the red "update stopped" banner and no store is listed.
// Nothing is fabricated.
export function createNoneAdapter() {
  return {
    kind: 'none',
    async load() {
      return { kind: 'none', now: Date.now(), raw: {}, storeConnection: {} };
    },
  };
}
