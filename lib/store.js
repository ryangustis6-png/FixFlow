// Persistence. Uses Supabase (PostgREST over fetch, no SDK) when SUPABASE_URL + SUPABASE_KEY are set;
// otherwise a local JSON file for development. One table: ff_requests(id text pk, created_at, status, data jsonb).
import fs from 'node:fs/promises';

const FILE = new URL('../.data/requests.json', import.meta.url);

function fileStore() {
  const load = async () => { try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return []; } };
  const save = async rows => { await fs.mkdir(new URL('./', FILE), {recursive: true}); await fs.writeFile(FILE, JSON.stringify(rows)); };
  return {
    kind: 'local-file',
    async list() { return (await load()).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async get(id) { return (await load()).find(r => r.id === id) || null; },
    async put(rec) { const rows = await load(); const i = rows.findIndex(r => r.id === rec.id); if (i >= 0) rows[i] = rec; else rows.push(rec); await save(rows); return rec; },
  };
}

function supabaseStore(url, key, fetcher = fetch) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/ff_requests`;
  const headers = {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'};
  const call = async (path, opts = {}) => {
    const r = await fetcher(base + path, {...opts, headers: {...headers, ...(opts.headers || {})}, signal: AbortSignal.timeout(15000)});
    if (!r.ok) throw Error(`Database error (HTTP ${r.status})`);
    return r.status === 204 ? null : r.json();
  };
  const toRec = row => ({...row.data, id: row.id, created_at: row.created_at, status: row.status});
  return {
    kind: 'supabase',
    async list() { return (await call('?select=*&order=created_at.desc&limit=100')).map(toRec); },
    async get(id) { const rows = await call(`?select=*&id=eq.${encodeURIComponent(id)}`); return rows[0] ? toRec(rows[0]) : null; },
    async put(rec) {
      const {id, created_at, status, ...data} = rec;
      await call('?on_conflict=id', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify({id, created_at, status, data})});
      return rec;
    },
  };
}

export function getStore(env = process.env) {
  return env.SUPABASE_URL && env.SUPABASE_KEY ? supabaseStore(env.SUPABASE_URL, env.SUPABASE_KEY) : fileStore();
}
