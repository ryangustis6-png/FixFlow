import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOptions, fmt} from '../lib/options.js';
import {triage, keywordTriage} from '../lib/triage.js';
import {createRequest, decide, ledger} from '../lib/workflow.js';

const memStore = () => { const m = new Map(); return {kind: 'mem', list: async () => [...m.values()], get: async id => m.get(id) || null, put: async r => (m.set(r.id, structuredClone(r)), r)}; };
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
  const L = ledger(await store.list());
  assert.equal(L.totals.jobs, 2);
  assert.equal(L.totals.repairs_cents, 17500);
  assert.equal(L.totals.improvements_cents, 115000);
  assert.equal(L.totals.est_cost_cents, L.totals.repairs_cents + L.totals.improvements_cents);
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
