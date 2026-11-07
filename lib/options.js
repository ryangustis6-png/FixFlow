// Turns a triage result into three priced options with a transparent recommendation.
// All money is integer cents. The AI never sets a price: it only picks the issue type.
import {ISSUES, VENDORS} from '../data/catalog.js';

export const fmt = cents => {
  const neg = cents < 0; const v = Math.abs(cents);
  return `${neg ? '-' : ''}$${Math.floor(v / 100).toLocaleString('en-US')}${v % 100 ? '.' + String(v % 100).padStart(2, '0') : ''}`;
};
const MAX_ETA = {emergency: 0, urgent: 1, routine: 3};

export const TAX = {
  repair: {label: 'Repair', line: 'Schedule E line 14 — Repairs (expense this year)'},
  improvement: {label: 'Likely capital improvement',
    line: 'Depreciate (Schedule E line 18) unless it qualifies for the de minimis safe harbor (≤ $2,500 per item)'},
};

export function buildOptions(triage, {autoApproveCents = 0} = {}) {
  const issue = ISSUES[triage.issue_type] || ISSUES.other;
  const urgency = MAX_ETA[triage.urgency] !== undefined ? triage.urgency : 'routine';
  const options = issue.options.map((o, i) => {
    const low = o.low * 100, high = o.high * 100;
    const v = VENDORS[o.vendor];
    const diyBlocked = o.type === 'diy' && (triage.diy_safe === false || urgency === 'emergency');
    return {
      id: `opt-${i + 1}`, type: o.type, title: o.title, vendor: v.name, vendor_phone: v.phone, vendor_rating: v.rating,
      cost_low_cents: low, cost_high_cents: high, cost_expected_cents: Math.round((low + high) / 2),
      cost_label: low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`,
      eta_days: o.etaDays, eta_label: o.etaDays === 0 ? 'Today' : o.etaDays === 1 ? 'Tomorrow' : `${o.etaDays} days`,
      tenant_effort: o.tenantEffort, warranty_days: o.warrantyDays, part: o.part || null,
      tax: o.tax, tax_label: TAX[o.tax].label, tax_line: TAX[o.tax].line,
      blocked: diyBlocked, blocked_reason: diyBlocked ? 'Not advised: safety risk or emergency — use a professional' : null,
      meets_urgency: o.etaDays <= MAX_ETA[urgency],
    };
  });
  // Recommendation: cheapest expected cost among options that are allowed and fast enough;
  // ties go to the longer warranty. If nothing is fast enough, take the fastest allowed option.
  const allowed = options.filter(o => !o.blocked);
  const fastEnough = allowed.filter(o => o.meets_urgency);
  const pool = fastEnough.length ? fastEnough : [...allowed].sort((a, b) => a.eta_days - b.eta_days).slice(0, 1);
  const rec = [...pool].sort((a, b) => a.cost_expected_cents - b.cost_expected_cents || b.warranty_days - a.warranty_days)[0];
  rec.recommended = true;
  const reason = fastEnough.length
    ? `Lowest expected cost (${fmt(rec.cost_expected_cents)}) among options that can happen ${urgency === 'emergency' ? 'today' : `within ${MAX_ETA[urgency]} day${MAX_ETA[urgency] === 1 ? '' : 's'}`} for a ${urgency} issue.`
    : 'No option meets the urgency window; recommending the fastest allowed option.';
  const savings = Math.max(...allowed.map(o => o.cost_expected_cents)) - rec.cost_expected_cents;
  const autoApprove = autoApproveCents > 0 && rec.cost_high_cents <= autoApproveCents && urgency !== 'emergency';
  return {issue_type: triage.issue_type in ISSUES ? triage.issue_type : 'other', issue_label: issue.label, trade: issue.trade,
    urgency, options, recommended_id: rec.id, recommendation_reason: reason,
    savings_vs_most_expensive_cents: savings, auto_approve: autoApprove, auto_approve_limit_cents: autoApproveCents};
}
