/**
 * Stand-in for `@supabase/supabase-js` in the batch 4 harness.
 *
 * Behaviour is driven through `globalThis.__supabase`:
 *   getUser(kind, token) -> { data, error }   (may return a pending promise)
 *   query(table)        -> { single, list }   (rows for maybeSingle / awaited)
 *
 * `kind` is "admin" or "anon" so the harness can prove the auth path no longer
 * borrows the service-role client.
 */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function tagged(kind) {
  const query = (table) => {
    const result = () => globalThis.__supabase?.query?.(table) ?? { single: null, list: [] };
    const chain = {
      select: () => chain,
      eq: () => chain,
      lte: () => chain,
      order: () => chain,
      update: () => chain,
      delete: () => chain,
      insert: () => chain,
      upsert: () => chain,
      maybeSingle: async () => result().single,
      single: async () => result().single,
      then: (resolve, reject) => Promise.resolve({ data: result().list, error: null }).then(resolve, reject),
    };
    return chain;
  };

  return {
    __kind: kind,
    auth: {
      getUser: (token) => {
        const handler = globalThis.__supabase?.getUser;
        if (!handler) return Promise.resolve({ data: { user: null }, error: { message: "no stub", status: 500 } });
        return handler(kind, token);
      },
    },
    from: query,
    channel() {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
      };
      return channel;
    },
  };
}

export function createClient(_url, key) {
  return tagged(key === SERVICE_ROLE_KEY ? "admin" : "anon");
}

export default { createClient };
