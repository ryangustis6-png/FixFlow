// Request lifecycle: tenant report -> AI triage -> priced options -> owner decision -> work order
// -> owner records actual cost -> tenant confirms fixed. "Execution" (vendor booking, part order,
// texts) is simulated for the demo and labeled as such. All money is integer cents.
import {randomUUID} from 'node:crypto';
import {triage as runTriage} from './triage.js';
import {buildOptions, fmt} from './options.js';

const now = () => new Date().toISOString();
export const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const addDays = (iso, d) => { const t = new Date(iso); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const dollarsToCents = v => {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error('Enter an amount like 185 or 185.50');
  const [w, f = ''] = s.split('.'); const c = Number(w) * 100 + Number(f.padEnd(2, '0'));
  if (c > 10_000_000) throw Error('Amount looks too large');
  return c;
};

// ---------- Properties ----------
export const DEMO_PROPERTY = {id: 'demo', name: '412 Maple St', unit: 'Unit B', city: 'Columbus, OH', tenant_name: 'Jamie Lee',
  monthly_rent_cents: 145000, auto_approve_limit_cents: 0};

export async function listProperties(store) {
  let props = (await store.properties.list()).filter(p => p.status !== 'archived');
  if (!props.length) { await store.properties.put({...DEMO_PROPERTY, created_at: now(), status: 'active'}); props = await store.properties.list(); }
  return props.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function saveProperty(store, input) {
  const existing = input.id ? await store.properties.get(String(input.id)) : null;
  if (input.id && !existing) throw Error('Property not found');
  const name = clean(input.name ?? existing?.name, 80);
  if (!name) throw Error('Property address is required');
  const limit = input.auto_approve_limit !== undefined && input.auto_approve_limit !== '' ? dollarsToCents(input.auto_approve_limit) : (existing?.auto_approve_limit_cents ?? 0);
  const rent = input.monthly_rent !== undefined && input.monthly_rent !== '' ? dollarsToCents(input.monthly_rent) : (existing?.monthly_rent_cents ?? null);
  const rec = {...(existing || {id: randomUUID().slice(0, 6), created_at: now()}), status: input.archived ? 'archived' : 'active', name,
    unit: clean(input.unit ?? existing?.unit, 40), city: clean(input.city ?? existing?.city, 60),
    tenant_name: clean(input.tenant_name ?? existing?.tenant_name, 60), monthly_rent_cents: rent, auto_approve_limit_cents: limit};
  return store.properties.put(rec);
}

const label = p => `${p.name}${p.unit ? ', ' + p.unit : ''}`;

// ---------- Requests ----------
export async function createRequest(store, input, {triageFn = runTriage} = {}) {
  const props = await listProperties(store);
  const property = props.find(p => p.id === input.property_id) || props[0];
  const text = clean(input.text, 2000);
  const tenant = clean(input.tenant_name, 60) || property.tenant_name || 'Tenant';
  let image = null;
  if (input.image?.data) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(input.image.media_type || '')) throw Error('Photo must be JPEG, PNG, WebP or GIF');
    if (input.image.data.length > 2_800_000) throw Error('Photo too large; please retake');
    image = {data: input.image.data, media_type: input.image.media_type};
  }
  if (!text && !image) throw Error('Describe the problem or add a photo');
  const t = await triageFn({text, image});
  const plan = buildOptions(t, {autoApproveCents: property.auto_approve_limit_cents || 0});
  const created = now();
  const rec = {
    id: randomUUID().slice(0, 8), created_at: created, status: 'awaiting_owner',
    property_id: property.id, property: label(property), tenant_name: tenant, text, input_mode: clean(input.input_mode, 20) || 'text',
    photo: image ? `data:${image.media_type};base64,${image.data}` : null,
    triage: t, plan, decision: null, work_order: null, completion: null, tenant_confirmation: null,
    timeline: [{at: created, who: tenant, what: `Reported the issue${input.input_mode === 'voice' ? ' by voice' : image ? ' with a photo' : ''}`},
      {at: now(), who: 'FixFlow', what: `Triaged as ${plan.issue_label} (${plan.urgency}) via ${t.method === 'ai' ? 'AI' : 'keyword fallback'}; 3 options priced`}],
  };
  if (plan.auto_approve) return execute(store, rec, plan.recommended_id, {by: 'Auto-approve rule', note: `Recommended option is under this property's ${fmt(plan.auto_approve_limit_cents)} auto-approve limit`});
  rec.timeline.push({at: now(), who: 'FixFlow', what: plan.urgency === 'emergency' ? 'EMERGENCY — owner alerted for immediate decision' : 'Sent options to owner for approval'});
  return store.requests.put(rec);
}

export async function decide(store, id, {action, option_id, note, via}) {
  const rec = await store.requests.get(id);
  if (!rec) throw Error('Request not found');
  if (rec.status !== 'awaiting_owner') throw Error(`Already ${rec.status.replace('_', ' ')}`);
  const by = via === 'voice' ? 'Owner (voice)' : 'Owner';
  if (action === 'decline') {
    rec.status = 'declined'; rec.decision = {action, by, at: now(), note: clean(note, 300)};
    rec.timeline.push({at: now(), who: by, what: `Declined${note ? `: ${clean(note, 120)}` : ''}`});
    return store.requests.put(rec);
  }
  if (action !== 'approve') throw Error('Action must be approve or decline');
  return execute(store, rec, option_id, {by, note: clean(note, 300)});
}

async function execute(store, rec, optionId, {by, note}) {
  const opt = rec.plan.options.find(o => o.id === optionId);
  if (!opt) throw Error('Unknown option');
  if (opt.blocked) throw Error(opt.blocked_reason);
  const at = now();
  const date = addDays(at, opt.eta_days);
  const window = opt.type === 'diy' ? null : opt.eta_days === 0 ? 'Today, first available 2-hour window' : `${date}, 9:00–11:00 am`;
  const first = rec.tenant_name.split(' ')[0];
  const woId = `WO-${rec.id.toUpperCase()}`;
  const safety = rec.triage.tenant_safety_steps?.[0] || '';
  const wo = {
    id: woId, option_id: opt.id, type: opt.type, title: opt.title, vendor: opt.vendor, vendor_phone: opt.vendor_phone,
    scheduled: window, part: opt.part, est_cost_cents: opt.cost_expected_cents, cost_label: opt.cost_label,
    not_to_exceed_cents: opt.cost_high_cents, tax: opt.tax, tax_label: opt.tax_label, tax_line: opt.tax_line, simulated: true,
    part_link: opt.part ? `https://www.amazon.com/s?k=${encodeURIComponent(opt.part)}` : null,
    vendor_message: opt.type === 'diy'
      ? `Order placed: ${opt.part || 'parts'} shipped to ${rec.property}. Estimated delivery ${date}.`
      : `New work order ${woId} — ${rec.plan.issue_label} at ${rec.property}. ${rec.triage.summary} Approved not-to-exceed ${fmt(opt.cost_high_cents)}; call the owner before exceeding it. Tenant: ${rec.tenant_name}. Requested window: ${window}. Please confirm.`,
    tenant_message: opt.type === 'diy'
      ? `Hi ${first}, your owner approved a fix. A ${opt.part || 'replacement part'} is on its way (arrives ~${date}) with a step-by-step guide. ${safety}`.trim()
      : `Hi ${first}, your owner approved a repair. ${opt.vendor.replace(' (sample)', '')} is scheduled for ${window}. ${safety}`.trim(),
  };
  rec.status = 'dispatched'; rec.work_order = wo;
  rec.decision = {action: 'approve', option_id: opt.id, by, at, note: note || null};
  rec.timeline.push({at, who: by, what: `Approved: ${opt.title} (${opt.cost_label})`},
    {at: now(), who: 'FixFlow', what: opt.type === 'diy' ? 'Part ordered and tenant notified (simulated)' : `Work order ${woId} sent to ${opt.vendor} and tenant notified (simulated)`});
  return store.requests.put(rec);
}

export async function complete(store, id, {actual_cost, note}) {
  const rec = await store.requests.get(id);
  if (!rec) throw Error('Request not found');
  if (rec.status !== 'dispatched') throw Error('Only dispatched jobs can be completed');
  const actual = dollarsToCents(actual_cost);
  const over = actual - rec.work_order.not_to_exceed_cents;
  rec.status = 'completed';
  rec.completion = {at: now(), actual_cost_cents: actual, variance_cents: actual - rec.work_order.est_cost_cents, over_limit_cents: over > 0 ? over : 0, note: clean(note, 300)};
  rec.timeline.push({at: now(), who: 'Owner', what: `Marked complete — actual cost ${fmt(actual)}${over > 0 ? ` (${fmt(over)} over the approved limit)` : ''}`});
  return store.requests.put(rec);
}

export async function tenantConfirm(store, id, {fixed, note}) {
  const rec = await store.requests.get(id);
  if (!rec) throw Error('Request not found');
  if (!['dispatched', 'completed'].includes(rec.status)) throw Error('Nothing to confirm yet');
  rec.tenant_confirmation = {at: now(), fixed: Boolean(fixed), note: clean(note, 300)};
  rec.timeline.push({at: now(), who: rec.tenant_name, what: fixed ? 'Confirmed the issue is fixed' : `Says it is still not fixed${note ? `: ${clean(note, 120)}` : ''}`});
  return store.requests.put(rec);
}

// What a tenant may see: status and messages, not owner pricing or vendor terms.
export function tenantView(r) {
  return {id: r.id, status: r.status, created_at: r.created_at, property: r.property, tenant_name: r.tenant_name,
    issue_label: r.plan.issue_label, urgency: r.plan.urgency, summary: r.triage.summary, safety_steps: r.triage.tenant_safety_steps || [],
    tenant_message: r.work_order?.tenant_message || null, part_link: r.work_order?.part_link || null, scheduled: r.work_order?.scheduled || null,
    declined_note: r.status === 'declined' ? (r.decision?.note || null) : null, tenant_confirmation: r.tenant_confirmation};
}

// ---------- Money views ----------
const cost = r => r.completion?.actual_cost_cents ?? r.work_order.est_cost_cents;

export function ledger(records) {
  const rows = records.filter(r => r.work_order).map(r => ({
    date: r.decision.at.slice(0, 10), request_id: r.id, property_id: r.property_id, property: r.property, issue: r.plan.issue_label,
    vendor: r.work_order.vendor, approved_by: r.decision.by, est_cost_cents: r.work_order.est_cost_cents,
    actual_cost_cents: r.completion?.actual_cost_cents ?? null, cost_cents: cost(r), basis: r.completion ? 'actual' : 'estimate',
    not_to_exceed_cents: r.work_order.not_to_exceed_cents, tax: r.work_order.tax, tax_label: r.work_order.tax_label, tax_line: r.work_order.tax_line,
  }));
  const sum = (list, k = 'cost_cents') => list.reduce((s, r) => s + r[k], 0);
  return {rows, totals: {
    jobs: rows.length, cost_cents: sum(rows), actual_cents: sum(rows.filter(r => r.basis === 'actual')), estimate_cents: sum(rows.filter(r => r.basis === 'estimate')),
    repairs_cents: sum(rows.filter(r => r.tax === 'repair')), improvements_cents: sum(rows.filter(r => r.tax === 'improvement')),
  }, note: 'Uses actual invoice cost once a job is completed, otherwise the estimate. Tax treatment is a suggestion — confirm with your tax preparer.'};
}

export function metrics(records, properties, at = new Date()) {
  const month = at.toISOString().slice(0, 7);
  const decided = records.filter(r => r.decision);
  const hours = decided.map(r => (Date.parse(r.decision.at) - Date.parse(r.created_at)) / 3600000);
  const approved = records.filter(r => r.work_order);
  const spendMonth = approved.filter(r => r.decision.at.startsWith(month)).reduce((s, r) => s + cost(r), 0);
  const savings = approved.reduce((s, r) => {
    const allowed = r.plan.options.filter(o => !o.blocked).map(o => o.cost_expected_cents);
    return s + Math.max(0, Math.max(...allowed) - r.work_order.est_cost_cents);
  }, 0);
  const perProperty = properties.map(p => {
    const rs = records.filter(r => r.property_id === p.id);
    const spendYtd = rs.filter(r => r.work_order && r.decision.at.slice(0, 4) === month.slice(0, 4)).reduce((s, r) => s + cost(r), 0);
    return {property_id: p.id, open: rs.filter(r => ['awaiting_owner', 'dispatched'].includes(r.status)).length, total: rs.length, spend_ytd_cents: spendYtd,
      rent_ytd_cents: p.monthly_rent_cents ? p.monthly_rent_cents * (at.getUTCMonth() + 1) : null};
  });
  return {
    needs_approval: records.filter(r => r.status === 'awaiting_owner').length,
    emergencies_open: records.filter(r => r.status === 'awaiting_owner' && r.plan.urgency === 'emergency').length,
    in_progress: records.filter(r => r.status === 'dispatched').length,
    completed: records.filter(r => r.status === 'completed').length,
    not_fixed_flags: records.filter(r => r.tenant_confirmation && !r.tenant_confirmation.fixed).length,
    spend_month_cents: spendMonth, savings_cents: savings,
    avg_hours_to_decision: hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length * 10) / 10 : null,
    per_property: perProperty,
  };
}
