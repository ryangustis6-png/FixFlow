// Request lifecycle: tenant report -> AI triage -> priced options -> owner decision -> work order + ledger.
// "Execution" (vendor booking, part order, texts) is simulated for the demo and labeled as such.
import {randomUUID} from 'node:crypto';
import {triage as runTriage} from './triage.js';
import {buildOptions, fmt} from './options.js';

const now = () => new Date().toISOString();
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const addDays = (iso, d) => { const t = new Date(iso); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

export const DEFAULT_PROPERTY = {name: '412 Maple St, Unit B', owner: 'Owner', auto_approve_limit_cents: Number(process.env.AUTO_APPROVE_LIMIT_CENTS || 0)};

export async function createRequest(store, input, {triageFn = runTriage, property = DEFAULT_PROPERTY} = {}) {
  const text = clean(input.text, 2000);
  const tenant = clean(input.tenant_name, 60) || 'Tenant';
  let image = null;
  if (input.image?.data) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(input.image.media_type || '')) throw Error('Photo must be JPEG, PNG, WebP or GIF');
    if (input.image.data.length > 2_800_000) throw Error('Photo too large; please retake');
    image = {data: input.image.data, media_type: input.image.media_type};
  }
  if (!text && !image) throw Error('Describe the problem or add a photo');
  const t = await triageFn({text, image});
  const plan = buildOptions(t, {autoApproveCents: property.auto_approve_limit_cents});
  const created = now();
  const rec = {
    id: randomUUID().slice(0, 8), created_at: created, status: 'awaiting_owner',
    property: property.name, tenant_name: tenant, text, input_mode: clean(input.input_mode, 20) || 'text',
    photo: image ? `data:${image.media_type};base64,${image.data}` : null,
    triage: t, plan, decision: null, work_order: null,
    timeline: [{at: created, who: tenant, what: 'Reported the issue'}, {at: now(), who: 'FixFlow', what: `Triaged as ${plan.issue_label} (${plan.urgency}) via ${t.method === 'ai' ? 'AI' : 'keyword fallback'}; 3 options priced`}],
  };
  if (plan.auto_approve) return execute(store, rec, plan.recommended_id, {by: 'Auto-approve rule', note: `Recommended option is under the ${fmt(plan.auto_approve_limit_cents)} auto-approve limit`});
  rec.timeline.push({at: now(), who: 'FixFlow', what: 'Sent options to owner for approval'});
  return store.put(rec);
}

export async function decide(store, id, {action, option_id, note}) {
  const rec = await store.get(id);
  if (!rec) throw Error('Request not found');
  if (rec.status !== 'awaiting_owner') throw Error(`Already ${rec.status.replace('_', ' ')}`);
  if (action === 'decline') {
    rec.status = 'declined'; rec.decision = {action, at: now(), note: clean(note, 300)};
    rec.timeline.push({at: now(), who: 'Owner', what: `Declined${note ? `: ${clean(note, 120)}` : ''}`});
    return store.put(rec);
  }
  if (action !== 'approve') throw Error('Action must be approve or decline');
  return execute(store, rec, option_id, {by: 'Owner', note: clean(note, 300)});
}

async function execute(store, rec, optionId, {by, note}) {
  const opt = rec.plan.options.find(o => o.id === optionId);
  if (!opt) throw Error('Unknown option');
  if (opt.blocked) throw Error(opt.blocked_reason);
  const at = now();
  const date = addDays(at, opt.eta_days);
  const window = opt.type === 'diy' ? null : opt.eta_days === 0 ? 'Today, first available 2-hour window' : `${date}, 9:00–11:00 am`;
  const tenantFirst = rec.tenant_name.split(' ')[0];
  const wo = {
    id: `WO-${rec.id.toUpperCase()}`, option_id: opt.id, type: opt.type, vendor: opt.vendor, vendor_phone: opt.vendor_phone,
    scheduled: window, part: opt.part, est_cost_cents: opt.cost_expected_cents, cost_label: opt.cost_label,
    not_to_exceed_cents: opt.cost_high_cents, tax: opt.tax, tax_label: opt.tax_label, tax_line: opt.tax_line, simulated: true,
    part_link: opt.part ? `https://www.amazon.com/s?k=${encodeURIComponent(opt.part)}` : null,
    vendor_message: opt.type === 'diy'
      ? `Order placed: ${opt.part || 'parts'} shipped to ${rec.property}. Estimated delivery ${date}.`
      : `New work order ${`WO-${rec.id.toUpperCase()}`} — ${rec.plan.issue_label} at ${rec.property}. ${rec.triage.summary} Approved not-to-exceed ${fmt(opt.cost_high_cents)}. Tenant: ${rec.tenant_name}. Requested window: ${window}. Please confirm.`,
    tenant_message: opt.type === 'diy'
      ? `Hi ${tenantFirst}, your owner approved a fix. A ${opt.part || 'replacement part'} is on its way (arrives ~${date}) with a step-by-step guide. ${rec.triage.tenant_safety_steps?.[0] || ''}`.trim()
      : `Hi ${tenantFirst}, your owner approved a repair. ${opt.vendor.replace(' (sample)', '')} is scheduled for ${window}. ${rec.triage.tenant_safety_steps?.[0] || ''}`.trim(),
  };
  rec.status = 'dispatched'; rec.work_order = wo;
  rec.decision = {action: 'approve', option_id: opt.id, by, at, note: note || null};
  rec.timeline.push({at, who: by, what: `Approved: ${opt.title} (${opt.cost_label})`},
    {at: now(), who: 'FixFlow', what: opt.type === 'diy' ? 'Part ordered and tenant notified (simulated)' : `Work order ${wo.id} sent to ${opt.vendor} and tenant notified (simulated)`});
  return store.put(rec);
}

// Owner expense ledger: every approved job, totals by tax treatment, in integer cents.
export function ledger(records) {
  const rows = records.filter(r => r.work_order).map(r => ({
    date: r.decision.at.slice(0, 10), request_id: r.id, property: r.property, issue: r.plan.issue_label,
    vendor: r.work_order.vendor, approved_by: r.decision.by, est_cost_cents: r.work_order.est_cost_cents,
    not_to_exceed_cents: r.work_order.not_to_exceed_cents, tax: r.work_order.tax, tax_label: r.work_order.tax_label, tax_line: r.work_order.tax_line,
  }));
  const sum = (list, k) => list.reduce((s, r) => s + r[k], 0);
  return {rows, totals: {
    jobs: rows.length, est_cost_cents: sum(rows, 'est_cost_cents'),
    repairs_cents: sum(rows.filter(r => r.tax === 'repair'), 'est_cost_cents'),
    improvements_cents: sum(rows.filter(r => r.tax === 'improvement'), 'est_cost_cents'),
    auto_approved: rows.filter(r => r.approved_by === 'Auto-approve rule').length,
  }, note: 'Estimated costs pending vendor invoices. Tax treatment is a suggestion — confirm with your tax preparer.'};
}
