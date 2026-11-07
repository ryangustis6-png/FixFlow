import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOptions, fmt} from '../lib/options.js';
import {triage, keywordTriage} from '../lib/triage.js';
import {createRequest, decide, ledger, complete, tenantConfirm, tenantView, metrics, listProperties, saveProperty} from '../lib/workflow.js';
import {parseCommand, requestBriefing, portfolioBriefing} from '../lib/voice.js';
import {handle} from '../lib/api.js';

const coll = () => { const m = new Map(); return {list: async () => [...m.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)), get: async id => structuredClone(m.get(id)) || null, put: async r => (m.set(r.id, structuredClone(r)), r), clear: async () => m.clear()}; };
const memStore = () => ({kind: 'mem', requests: coll(), properties: coll()});
const ai = (over = {}) => async () => ({issue_type: 'dryer', urgency: 'routine', summary: 'Dryer tumbles but no heat.', likely_cause: 'Blown thermal fuse.',
  tenant_safety_steps: ['Unplug the dryer.'], diy_safe: true, confidence: 'high', method: 'ai', ...over});

test('options: three priced options in cents, recommendation is cheapest allowed within urgency window', () => {
  const p = buildOptions({issue_type: 'dryer', urgency: 'routine', diy_safe: true});
  assert.equal(p.options.length, 3);
  assert.deepEqual(p.options.map(o => o.cost_expected_cents), [3500, 17500, 25500]);
  assert.equal(p.recommended_id, 'opt-1');
  assert.equal(p.savings_vs_most_expensive_cents, 22000);
  const unsafe = buildOptions({issue_type: 'dryer', urgency: 'urgent', diy_safe: false});
  assert.ok(unsafe.options[0].blocked);
  assert.equal(unsafe.recommended_id, 'opt-2');                     // handyman tomorrow, cheaper than pro
  const emergency = buildOptions({issue_type: 'no_heat', urgency: 'emergency', diy_safe: true});
  assert.equal(emergency.options.find(o => o.recommended).type, 'emergency');
  assert.equal(buildOptions({issue_type: 'made_up', urgency: 'whatever'}).issue_type, 'other');
  assert.equal(fmt(12345), '$123.45'); assert.equal(fmt(20000), '$200');
});

test('auto-approve is opt-in and never applies to emergencies', () => {
  assert.equal(buildOptions({issue_type: 'dryer', urgency: 'routine'}).auto_approve, false);
  assert.equal(buildOptions({issue_type: 'dryer', urgency: 'routine'}, {autoApproveCents: 15000}).auto_approve, true);
  assert.equal(buildOptions({issue_type: 'gas', urgency: 'emergency'}, {autoApproveCents: 100000}).auto_approve, false);
});

test('lifecycle: report -> owner approves -> work order + ledger; double-approve and bad input rejected', async () => {
  const store = memStore();
  const rec = await createRequest(store, {text: 'Dryer runs but no heat', tenant_name: 'Jamie Lee', image: {data: 'aGk=', media_type: 'image/jpeg'}}, {triageFn: ai()});
  assert.equal(rec.status, 'awaiting_owner');
  assert.match(rec.photo, /^data:image\/jpeg;base64,/);
  const done = await decide(store, rec.id, {action: 'approve', option_id: 'opt-2'});
  assert.equal(done.status, 'dispatched');
  assert.equal(done.work_order.not_to_exceed_cents, 21000);
  assert.match(done.work_order.tenant_message, /^Hi Jamie/);
  assert.equal(done.work_order.simulated, true);
  await assert.rejects(decide(store, rec.id, {action: 'approve', option_id: 'opt-1'}), /Already dispatched/);
  await assert.rejects(createRequest(store, {text: ''}, {triageFn: ai()}), /Describe the problem/);
  await assert.rejects(createRequest(store, {text: 'x', image: {data: 'aGk=', media_type: 'text/html'}}, {triageFn: ai()}), /Photo must be/);
  const second = await createRequest(store, {text: 'fridge warm'}, {triageFn: ai({issue_type: 'fridge', urgency: 'urgent'})});
  await decide(store, second.id, {action: 'approve', option_id: 'opt-3'});  // replacement = improvement
  const declined = await createRequest(store, {text: 'squeaky door'}, {triageFn: ai({issue_type: 'other'})});
  await decide(store, declined.id, {action: 'decline', note: 'Will handle at next visit'});
  const L = ledger(await store.requests.list());
  assert.equal(L.totals.jobs, 2);
  assert.equal(L.totals.repairs_cents, 17500);
  assert.equal(L.totals.improvements_cents, 115000);
  assert.equal(L.totals.cost_cents, L.totals.repairs_cents + L.totals.improvements_cents);
});

test('AI triage uses forced tool output; falls back to keywords on failure or bad output', async () => {
  let sent;
  const ok = async (url, o) => (sent = JSON.parse(o.body), {ok: true, json: async () => ({content: [{type: 'tool_use', input: {issue_type: 'sink_leak', urgency: 'urgent', summary: 's', likely_cause: 'c', tenant_safety_steps: ['Turn off the valve'], diy_safe: true, confidence: 'high'}}]})});
  const r = await triage({text: 'leak', image: {data: 'aGk=', media_type: 'image/png'}}, {key: 'k', fetcher: ok});
  assert.equal(r.method, 'ai'); assert.equal(r.issue_type, 'sink_leak');
  assert.equal(sent.tool_choice.name, 'report_triage'); assert.equal(sent.messages[0].content[0].type, 'image');
  const down = await triage({text: 'my dryer has no heat'}, {key: 'k', fetcher: async () => ({ok: false, status: 529})});
  assert.equal(down.method, 'keywords'); assert.equal(down.issue_type, 'dryer');
  const weird = await triage({text: 'toilet keeps running'}, {key: 'k', fetcher: async () => ({ok: true, json: async () => ({content: [{type: 'tool_use', input: {issue_type: 'spaceship'}}]})})});
  assert.equal(weird.issue_type, 'toilet');
  assert.equal(keywordTriage('I smell gas in the kitchen').urgency, 'emergency');
  assert.equal(keywordTriage('I smell gas in the kitchen').diy_safe, false);
});

test('properties: demo seeded, add property with auto-approve limit, requests attach to the right property', async () => {
  const store = memStore();
  assert.equal((await listProperties(store))[0].id, 'demo');
  const p = await saveProperty(store, {name: '9 Oak Ave', unit: 'Apt 2', tenant_name: 'Sam Ortiz', monthly_rent: '1,250', auto_approve_limit: '50'});
  assert.equal(p.monthly_rent_cents, 125000); assert.equal(p.auto_approve_limit_cents, 5000);
  await assert.rejects(saveProperty(store, {name: ''}), /address is required/);
  await assert.rejects(saveProperty(store, {name: 'x', monthly_rent: 'abc'}), /Enter an amount/);
  const auto = await createRequest(store, {property_id: p.id, text: 'dryer no heat'}, {triageFn: ai()});
  assert.equal(auto.status, 'dispatched');                             // $25–$45 part under $50 limit
  assert.equal(auto.decision.by, 'Auto-approve rule');
  assert.equal(auto.tenant_name, 'Sam Ortiz');
  const manual = await createRequest(store, {property_id: 'demo', text: 'dryer no heat'}, {triageFn: ai()});
  assert.equal(manual.status, 'awaiting_owner');                       // demo property has no limit
});

test('completion with actual cost, tenant confirmation, metrics and tenant privacy', async () => {
  const store = memStore();
  const r = await createRequest(store, {text: 'dryer no heat', tenant_name: 'Jamie Lee'}, {triageFn: ai()});
  await assert.rejects(complete(store, r.id, {actual_cost: '100'}), /Only dispatched/);
  await decide(store, r.id, {action: 'approve', option_id: 'opt-2', via: 'voice'});
  const done = await complete(store, r.id, {actual_cost: '$235.50'});
  assert.equal(done.completion.actual_cost_cents, 23550);
  assert.equal(done.completion.over_limit_cents, 2550);                // limit was $210
  assert.equal(done.decision.by, 'Owner (voice)');
  const conf = await tenantConfirm(store, r.id, {fixed: false, note: 'still cold'});
  assert.equal(conf.tenant_confirmation.fixed, false);
  const tv = tenantView(conf);
  assert.equal(tv.plan, undefined); assert.equal(tv.work_order, undefined);
  assert.ok(!JSON.stringify(tv).includes('not-to-exceed'));
  const all = await store.requests.list(), props = await listProperties(store);
  const m = metrics(all, props);
  assert.equal(m.completed, 1); assert.equal(m.not_fixed_flags, 1); assert.equal(m.spend_month_cents, 23550);
  assert.equal(ledger(all).rows[0].basis, 'actual');
  assert.match(portfolioBriefing(all, m), /still not fixed/);
});

test('voice: briefing text and spoken command parsing', async () => {
  const store = memStore();
  const r = await createRequest(store, {text: 'dryer no heat', tenant_name: 'Jamie Lee'}, {triageFn: ai()});
  const b = requestBriefing(r);
  assert.match(b, /Jamie reports/); assert.match(b, /I recommend option one, \$25 to \$45/);
  assert.equal(parseCommand('Approve option two', r).option_id, 'opt-2');
  assert.equal(parseCommand('yeah go with option 3 please', r).option_id, 'opt-3');
  assert.equal(parseCommand('approve the recommended one', r).option_id, 'opt-1');
  assert.equal(parseCommand('book the handyman', r).option_id, 'opt-2');
  assert.equal(parseCommand('decline, I will handle it', r).action, 'decline');
  assert.equal(parseCommand('what is the weather', r), null);
});

test('API: owner routes need the PIN when set; tenant routes do not expose pricing', async () => {
  const store = memStore();
  process.env.OWNER_PIN = '2468';
  try {
    const [s1] = await handle('dashboard', 'GET', {}, store); assert.equal(s1, 401);
    const [s2] = await handle('dashboard', 'GET', {headers: {'x-owner-pin': '2468'}}, store); assert.equal(s2, 200);
    const [s3, rep] = await handle('report', 'POST', {body: {text: 'my dryer has no heat'}}, store); assert.equal(s3, 201);
    assert.equal(rep.plan, undefined);
    const [s4] = await handle('decide', 'POST', {body: {id: rep.id, action: 'approve', option_id: 'opt-1'}}, store); assert.equal(s4, 401);
    const [s5] = await handle('reset', 'POST', {headers: {'x-owner-pin': '2468'}, body: {}}, store); assert.equal(s5, 400);
  } finally { delete process.env.OWNER_PIN; }
});
