// Persistence. Supabase (PostgREST over fetch, no SDK) when SUPABASE_URL + SUPABASE_KEY are set;
// otherwise local JSON files for development. Every table has the shape (id text pk, created_at, status, data jsonb).
import fs from 'node:fs/promises';

function fileCollection(name) {
  const FILE = new URL(`../.data/${name}.json`, import.meta.url);
  const load = async () => { try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return []; } };
  const save = async rows => { await fs.mkdir(new URL('./', FILE), {recursive: true}); await fs.writeFile(FILE, JSON.stringify(rows)); };
  return {
    async list() { return (await load()).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async get(id) { return (await load()).find(r => r.id === id) || null; },
    async put(rec) { const rows = await load(); const i = rows.findIndex(r => r.id === rec.id); if (i >= 0) rows[i] = rec; else rows.push(rec); await save(rows); return rec; },
    async clear() { await save([]); },
  };
}

function supabaseCollection(url, key, table, fetcher = fetch) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/${table}`;
  const headers = {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'};
  const call = async (path, opts = {}) => {
    const r = await fetcher(base + path, {...opts, headers: {...headers, ...(opts.headers || {})}, signal: AbortSignal.timeout(15000)});
    if (!r.ok) throw Error(r.status === 404 ? `Database table ${table} is missing — run supabase/setup.sql` : `Database error (HTTP ${r.status})`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  const toRec = row => ({...row.data, id: row.id, created_at: row.created_at, status: row.status});
  return {
    async list() { return (await call('?select=*&order=created_at.desc&limit=500')).map(toRec); },
    async get(id) { const rows = await call(`?select=*&id=eq.${encodeURIComponent(id)}`); return rows[0] ? toRec(rows[0]) : null; },
    async put(rec) {
      const {id, created_at, status, ...data} = rec;
      await call('?on_conflict=id', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id, created_at, status, data})});
      return rec;
    },
    async clear() { await call('?id=neq.__none__', {method: 'DELETE', headers: {Prefer: 'return=minimal'}}); },
  };
}

export function getStore(env = process.env) {
  const sb = env.SUPABASE_URL && env.SUPABASE_KEY;
  const make = (table, local) => sb ? supabaseCollection(env.SUPABASE_URL, env.SUPABASE_KEY, table) : fileCollection(local);
  return {kind: sb ? 'supabase' : 'local-file', requests: make('ff_requests', 'requests'), properties: make('ff_properties', 'properties')};
}
