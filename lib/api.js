// Framework-neutral API shared by the local server and the Vercel function.
// Owner routes require the OWNER_PIN (header x-owner-pin) when that env var is set.
import {timingSafeEqual} from 'node:crypto';
import {getStore} from './store.js';
import {createRequest, decide, complete, tenantConfirm, tenantView, ledger, metrics, listProperties, saveProperty} from './workflow.js';
import {voiceEnabled, speak, transcribe, requestBriefing, portfolioBriefing, parseCommand} from './voice.js';

const pinOk = given => {
  const pin = process.env.OWNER_PIN;
  if (!pin) return true;
  const a = Buffer.from(String(given || '')), b = Buffer.from(pin);
  return a.length === b.length && timingSafeEqual(a, b);
};
const audio = buf => ({__binary: buf, type: 'audio/mpeg'});
const strip = r => ({...r, triage: {...r.triage, ai_error: undefined}});

const PUBLIC = new Set(['session', 'property', 'report', 'status', 'confirm', 'transcribe']);

export async function handle(route, method, {body = {}, query = {}, headers = {}} = {}, store = getStore()) {
  try {
    if (!PUBLIC.has(route) && !pinOk(headers['x-owner-pin'])) return [401, {error: 'Owner PIN required'}];
    const GET = method === 'GET', POST = method === 'POST';
    switch (route) {
      // ---- public / tenant ----
      case 'session': if (GET) return [200, {pin_required: Boolean(process.env.OWNER_PIN), pin_ok: pinOk(headers['x-owner-pin']), voice: voiceEnabled(), ai: Boolean(process.env.ANTHROPIC_API_KEY), store: store.kind}]; break;
      case 'property': if (GET) { const ps = await listProperties(store); const p = ps.find(x => x.id === query.id) || ps[0];
        return [200, {id: p.id, name: p.name, unit: p.unit, city: p.city, tenant_name: p.tenant_name, voice: voiceEnabled()}]; } break;
      case 'report': if (POST) return [201, tenantView(await createRequest(store, body))]; break;
      case 'status': if (GET) { const r = await store.requests.get(String(query.id || '')); return r ? [200, tenantView(r)] : [404, {error: 'Request not found'}]; } break;
      case 'confirm': if (POST) return [200, tenantView(await tenantConfirm(store, String(body.id || ''), body))]; break;
      case 'transcribe': if (POST) return [200, await transcribe(body)]; break;
      // ---- owner ----
      case 'dashboard': if (GET) { const [rs, ps] = await Promise.all([store.requests.list(), listProperties(store)]);
        return [200, {properties: ps, metrics: metrics(rs, ps), requests: rs.map(({photo, ...r}) => ({...strip(r), has_photo: Boolean(photo)})), voice: voiceEnabled(), store: store.kind}]; } break;
      case 'request': if (GET) { const r = await store.requests.get(String(query.id || '')); return r ? [200, strip(r)] : [404, {error: 'Request not found'}]; } break;
      case 'decide': if (POST) return [200, strip(await decide(store, String(body.id || ''), body))]; break;
      case 'complete': if (POST) return [200, strip(await complete(store, String(body.id || ''), body))]; break;
      case 'properties': if (POST) return [200, await saveProperty(store, body)]; break;
      case 'ledger': if (GET) return [200, ledger(await store.requests.list())]; break;
      case 'reset': if (POST) { if (body.confirm !== 'RESET') throw Error('Confirmation required'); await store.requests.clear(); return [200, {ok: true}]; } break;
      case 'briefing': if (POST) {
        if (body.id) { const r = await store.requests.get(String(body.id)); if (!r) throw Error('Request not found'); return [200, audio(await speak(requestBriefing(r)))]; }
        const [rs, ps] = await Promise.all([store.requests.list(), listProperties(store)]);
        return [200, audio(await speak(portfolioBriefing(rs, metrics(rs, ps))))]; } break;
      case 'briefing-text': if (GET) { const r = await store.requests.get(String(query.id || '')); return r ? [200, {text: requestBriefing(r)}] : [404, {error: 'Request not found'}]; } break;
      case 'voice-command': if (POST) {
        const r = await store.requests.get(String(body.id || '')); if (!r) throw Error('Request not found');
        const heard = body.audio ? (await transcribe(body.audio)).text : String(body.text || '');
        return [200, {heard, command: parseCommand(heard, r)}]; } break;
      default: return [404, {error: 'Not found'}];
    }
    return [405, {error: 'Method not allowed'}];
  } catch (e) {
    return [400, {error: e.message}];
  }
}

// Adapter for the single Vercel function (api/main.js); vercel.json rewrites /api/:route -> /api/main?route=:route
export async function vercelHandler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const {route, ...query} = req.query || {};
  const [status, data] = await handle(String(route || ''), req.method, {body, query, headers: req.headers});
  res.setHeader('Cache-Control', 'no-store');
  if (data?.__binary) { res.setHeader('Content-Type', data.type); return res.status(status).send(data.__binary); }
  res.status(status).json(data);
}
