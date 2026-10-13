import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

const USAGE = `Copy each finished session's results subcollection onto sessions/{id}.playerResults.

  node scripts/backfill-player-results.mjs [--dry-run] [--project <id>]

  --dry-run   Only count what would change; write nothing.
  --project   Firebase project id. Required for production (uses application default credentials).
              With FIRESTORE_EMULATOR_HOST set it defaults to demo-nonsense.`;

const BATCH_LIMIT = 450;
const PAGE_SIZE = 300;
const SUMMARY_FIELDS = ['playerName', 'totalBuyIn', 'cashOut', 'profit'];

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    project: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulator && !args.project) {
  console.log(USAGE);
  process.exit(1);
}
const projectId = args.project ?? 'demo-nonsense';
initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId });

const db = getFirestore();
const dryRun = args['dry-run'];

function resultSummary(data) {
  return Object.fromEntries(SUMMARY_FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

const sameMap = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

async function playerResultsFor(session) {
  const results = await session.ref.collection('results').get();
  return Object.fromEntries(results.docs.map((d) => [d.id, resultSummary(d.data())]));
}

async function* finishedSessionPages() {
  let last = null;
  for (;;) {
    let q = db.collection('sessions').where('status', '==', 'finished').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) return;
    yield page.docs;
    last = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) return;
  }
}

const counts = { scanned: 0, updated: 0, skipped: 0, empty: 0 };
let batch = db.batch();
let pending = 0;

async function flush() {
  if (pending === 0) return;
  if (!dryRun) await batch.commit();
  batch = db.batch();
  pending = 0;
}

console.log(`${dryRun ? '[dry-run] ' : ''}Backfilling playerResults in ${projectId}${emulator ? ` (emulator ${emulator})` : ''}`);

for await (const sessions of finishedSessionPages()) {
  const maps = await Promise.all(sessions.map(playerResultsFor));
  for (const [i, session] of sessions.entries()) {
    counts.scanned += 1;
    const playerResults = maps[i];
    if (Object.keys(playerResults).length === 0) counts.empty += 1;
    if (sameMap(session.get('playerResults'), playerResults)) {
      counts.skipped += 1;
      continue;
    }
    batch.update(session.ref, { playerResults });
    pending += 1;
    counts.updated += 1;
    if (pending >= BATCH_LIMIT) await flush();
  }
}
await flush();

console.log(
  `Sessions scanned: ${counts.scanned}\n` +
    `${dryRun ? 'Would update' : 'Updated'}: ${counts.updated}\n` +
    `Skipped (already in sync): ${counts.skipped}\n` +
    `Finished with no results docs: ${counts.empty}`
);
if (dryRun && counts.updated) console.log('Nothing written. Re-run without --dry-run to apply.');
process.exit(0);
