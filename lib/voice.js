// ElevenLabs voice: tenant speech-to-text (Scribe v2) and owner spoken briefings (Flash v2.5),
// plus parsing of spoken owner commands like "approve option two". Server-side only.
import {fmt} from './options.js';

const KEY = () => (process.env.ELEVENLABS_API_KEY || '').trim().replace(/^["']|["']$/g, '');
export const voiceEnabled = () => Boolean(KEY());

const say = cents => {   // speakable money: "$140" not "$140.00"
  const d = Math.round(cents / 100);
  return `$${d.toLocaleString('en-US')}`;
};
const range = o => (o.cost_low_cents === o.cost_high_cents ? (o.cost_low_cents ? say(o.cost_low_cents) : 'no cost') : `${say(o.cost_low_cents)} to ${say(o.cost_high_cents)}`);
const ORD = ['one', 'two', 'three'];

export function requestBriefing(r) {
  const first = r.tenant_name.split(' ')[0];
  const rec = r.plan.options.find(o => o.recommended);
  const opts = r.plan.options.map((o, i) => o.blocked ? `Option ${ORD[i]} is not advised.` : `Option ${ORD[i]}: ${o.title.replace(/\(.*?\)/g, '')}, ${range(o)}, ${o.eta_label.toLowerCase()}.`).join(' ');
  return [
    `${r.plan.urgency === 'emergency' ? 'Emergency. ' : ''}New request at ${r.property}. ${first} reports: ${r.plan.issue_label.toLowerCase()}.`,
    r.triage.method === 'ai' && r.triage.likely_cause ? `Likely cause: ${r.triage.likely_cause.split('. ')[0].replace(/\.$/, '')}.` : '',
    opts,
    `I recommend option ${ORD[r.plan.options.indexOf(rec)]}, ${range(rec)}.`,
    r.status === 'awaiting_owner' ? 'Tap the mic and say approve option one, two or three, or decline.' : `This one is ${r.status.replace('_', ' ')}.`,
  ].filter(Boolean).join(' ');
}

export function portfolioBriefing(records, m) {
  const pending = records.filter(r => r.status === 'awaiting_owner');
  if (!records.length) return 'Good news. You have no maintenance requests. Everything is quiet across your properties.';
  const lines = [`Here is your maintenance update. ${pending.length ? `${pending.length} request${pending.length > 1 ? 's need' : ' needs'} your approval.` : 'Nothing needs your approval right now.'}`];
  if (m.emergencies_open) lines.push(`${m.emergencies_open} of them ${m.emergencies_open > 1 ? 'are emergencies' : 'is an emergency'}. Please look at ${m.emergencies_open > 1 ? 'those' : 'that'} first.`);
  pending.slice(0, 3).forEach(r => { const rec = r.plan.options.find(o => o.recommended); lines.push(`${r.property}: ${r.plan.issue_label.toLowerCase()}. Recommended fix ${range(rec)}.`); });
  if (m.in_progress) lines.push(`${m.in_progress} job${m.in_progress > 1 ? 's are' : ' is'} in progress.`);
  if (m.not_fixed_flags) lines.push(`A tenant says a repair is still not fixed.`);
  lines.push(`You've spent about ${say(m.spend_month_cents)} on maintenance this month${m.savings_cents ? `, and saved about ${say(m.savings_cents)} by picking the recommended options` : ''}.`);
  return lines.join(' ');
}

export async function why(r) {
  try { const j = await r.json(); const d = j.detail || j; return [d.status, d.message].filter(Boolean).join(': ').slice(0, 200); } catch { return ''; }
}

async function speak(text, {fetcher = fetch, voice = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'} = {}) {
  if (!KEY()) throw Error('Voice is not configured (add ELEVENLABS_API_KEY)');
  const r = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: {'xi-api-key': KEY(), 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify({text: text.slice(0, 2500), model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5'}),
  });
  if (!r.ok) throw Error(`Voice service error (HTTP ${r.status}) ${await why(r)}`.trim());
  return Buffer.from(await r.arrayBuffer());
}

export async function transcribe({data, mime}, {fetcher = fetch} = {}) {
  if (!KEY()) throw Error('Voice is not configured (add ELEVENLABS_API_KEY)');
  if (typeof data !== 'string' || !data) throw Error('No audio received');
  if (data.length > 3_500_000) throw Error('Recording too long — keep it under a minute');
  const type = /^audio\/[a-z0-9.+-]+/i.exec(mime || '')?.[0] || 'audio/webm';
  const form = new FormData();
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v2');
  form.append('file', new Blob([Buffer.from(data, 'base64')], {type}), `recording.${type.includes('mp4') ? 'm4a' : type.split('/')[1].split(';')[0]}`);
  const r = await fetcher('https://api.elevenlabs.io/v1/speech-to-text', {method: 'POST', headers: {'xi-api-key': KEY()}, body: form, signal: AbortSignal.timeout(45000)});
  if (!r.ok) throw Error(`Transcription error (HTTP ${r.status}) ${await why(r)}`.trim());
  const out = await r.json();
  return {text: String(out.text || '').trim()};
}

// "approve option two" / "approve the recommended one" / "go with the handyman" / "decline"
export function parseCommand(text, request) {
  const t = String(text || '').toLowerCase();
  if (/\b(decline|reject|deny|no thanks|i'?ll handle)\b/.test(t)) return {action: 'decline'};
  if (!/\b(approve|go with|do|book|yes|accept|pick|choose|option)\b/.test(t)) return null;
  const opts = request.plan.options;
  const nums = {one: 0, first: 0, '1': 0, two: 1, second: 1, '2': 1, to: 1, too: 1, three: 2, third: 2, '3': 2};
  const m = t.match(/\b(?:option|number|#)\s*(one|two|three|first|second|third|to|too|[123])\b/) || t.match(/\b(first|second|third)\b/);
  let idx = m ? nums[m[1]] : null;
  if (idx == null && /recommend/.test(t)) idx = opts.findIndex(o => o.recommended);
  if (idx == null) { const byType = [['part', 'diy'], ['handyman', 'handyman'], ['emergency', 'emergency'], ['replace', 'replace'], ['plumber', 'pro'], ['company', 'pro'], ['technician', 'pro'], ['electrician', 'pro']];
    const hit = byType.find(([w]) => t.includes(w)); if (hit) idx = opts.findIndex(o => o.type === hit[1]); }
  if (idx == null || idx < 0 || !opts[idx]) return null;
  return {action: 'approve', option_id: opts[idx].id, option: opts[idx]};
}
