// Framework-neutral API used by both the local server and the Vercel functions.
import {getStore} from './store.js';
import {createRequest, decide, ledger, DEFAULT_PROPERTY} from './workflow.js';

const publicRec = r => r && ({...r, triage: {...r.triage, ai_error: undefined}});

export async function handle(route, method, {body = {}, query = {}} = {}, store = getStore()) {
  try {
    if (route === 'requests' && method === 'GET') {
      const list = await store.list();
      return [200, {property: DEFAULT_PROPERTY, store: store.kind, requests: list.map(({photo, ...r}) => ({...r, has_photo: Boolean(photo)}))}];
    }
    if (route === 'requests' && method === 'POST') return [201, publicRec(await createRequest(store, body))];
    if (route === 'request' && method === 'GET') {
      const rec = await store.get(String(query.id || ''));
      return rec ? [200, publicRec(rec)] : [404, {error: 'Request not found'}];
    }
    if (route === 'decide' && method === 'POST') return [200, publicRec(await decide(store, String(body.id || ''), body))];
    if (route === 'ledger' && method === 'GET') return [200, ledger(await store.list())];
    return [405, {error: 'Method not allowed'}];
  } catch (e) {
    return [400, {error: e.message}];
  }
}

// Adapter for Vercel Node functions.
export const vercel = route => async (req, res) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const [status, data] = await handle(route, req.method, {body, query: req.query || {}});
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(data);
};
