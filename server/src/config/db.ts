import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env';

export async function connectDB(): Promise<void> {
  // Atlas's mongodb+srv:// URI requires a DNS SRV lookup. We try the system
  // resolver first (almost always correct, since the OS already uses it for
  // every other app on the box). If that fails — typical on networks where
  // SRV records are stripped by middleware — we retry with public resolvers
  // as a last resort.
  const systemServers = (() => {
    try { return dns.getServers(); } catch { return []; }
  })();

  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    const msg = (err as Error).message || '';
    const isDnsIssue = /querySrv|ENOTFOUND|ETIMEOUT|ECONNREFUSED|EAI_AGAIN/.test(msg);
    if (!isDnsIssue) throw err;
    // Try public DNS as a fallback. Cloudflare first because Google is
    // commonly blocked on Indian / corporate ISPs.
    try { dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8', ...systemServers]); } catch { /* ignore */ }
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
    } catch (fallbackErr) {
      // Restore system DNS so other Node DNS lookups (e.g. outbound HTTP) keep
      // working on user's actual network even after we fail.
      try { dns.setServers(systemServers); } catch { /* ignore */ }
      throw fallbackErr;
    }
  }
  // eslint-disable-next-line no-console
  console.log('[db] connected');

  // Sync indexes for every registered model so schema-declared indexes stay
  // authoritative (drops stale ones, creates new). Cheap on small collections;
  // for very large collections you'd manage indexes via migrations instead.
  await Promise.all(
    Object.values(mongoose.models).map(async (m) => {
      try {
        await m.syncIndexes();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[db] syncIndexes(${m.modelName}) failed:`, (e as Error).message);
      }
    }),
  );
  // eslint-disable-next-line no-console
  console.log('[db] indexes synced');
}
