// SAMPLE vendor and price catalog for the demo. All vendor names are fictional;
// price ranges are illustrative US estimates, not quotes. Replace with real local vendors.
// Each issue type lists exactly three ways to resolve it, cheapest-effort first.
// Money is whole dollars here and converted to integer cents in lib/options.js.

export const VENDORS = {
  handyman: {name: 'Northside Handyman Co. (sample)', phone: '(555) 010-2001', rating: 4.6},
  appliance: {name: 'BrightLine Appliance Repair (sample)', phone: '(555) 010-2002', rating: 4.8},
  plumber: {name: 'ClearFlow Plumbing (sample)', phone: '(555) 010-2003', rating: 4.7},
  hvac: {name: 'Comfort Air Heating & Cooling (sample)', phone: '(555) 010-2004', rating: 4.7},
  electrician: {name: 'Volt Electric Services (sample)', phone: '(555) 010-2005', rating: 4.8},
  pest: {name: 'GreenShield Pest Control (sample)', phone: '(555) 010-2006', rating: 4.5},
  locksmith: {name: 'KeyRight Locksmith (sample)', phone: '(555) 010-2007', rating: 4.6},
  utility: {name: 'Gas utility emergency line', phone: '911 or utility emergency number', rating: null},
  parts: {name: 'Online parts order', phone: null, rating: null},
  retailer: {name: 'Appliance retailer delivery + install (sample)', phone: null, rating: null},
};

// type: diy | handyman | pro | emergency | replace
// tax: repair (expense now) | improvement (capitalize; check de minimis safe harbor)
export const ISSUES = {
  dryer: {label: 'Dryer not working / not heating', trade: 'Appliance', options: [
    {type: 'diy', vendor: 'parts', title: 'Ship a replacement part, tenant installs', low: 25, high: 45, etaDays: 2, tenantEffort: 'Medium — 30 min with a screwdriver, video guide included', warrantyDays: 0, tax: 'repair', part: 'dryer heating element + thermal fuse kit'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman diagnoses and swaps the part', low: 140, high: 210, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'appliance', title: 'Appliance repair company, full diagnosis', low: 190, high: 320, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 90, tax: 'repair'}]},
  washer: {label: 'Washer not draining / leaking / not spinning', trade: 'Appliance', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant clears the drain pump filter (no cost) + part if needed', low: 0, high: 40, etaDays: 0, tenantEffort: 'Low — 15 min, towels needed', warrantyDays: 0, tax: 'repair', part: 'washer drain pump (only if filter is clear)'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman clears drain and checks hoses', low: 110, high: 180, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'appliance', title: 'Appliance repair company', low: 180, high: 340, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 90, tax: 'repair'}]},
  fridge: {label: 'Refrigerator not cooling', trade: 'Appliance', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant cleans condenser coils + checks door seal', low: 0, high: 15, etaDays: 0, tenantEffort: 'Low — 20 min, coil brush shipped', warrantyDays: 0, tax: 'repair', part: 'condenser coil brush'},
    {type: 'pro', vendor: 'appliance', title: 'Appliance repair company (same-day, food at risk)', low: 200, high: 400, etaDays: 0, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 90, tax: 'repair'},
    {type: 'replace', vendor: 'retailer', title: 'Replace refrigerator (delivery + haul-away)', low: 900, high: 1400, etaDays: 3, tenantEffort: 'Be home for delivery', warrantyDays: 365, tax: 'improvement'}]},
  dishwasher: {label: 'Dishwasher not draining / not cleaning', trade: 'Appliance', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant cleans filter and checks disposal knockout', low: 0, high: 20, etaDays: 0, tenantEffort: 'Low — 15 min', warrantyDays: 0, tax: 'repair', part: 'dishwasher filter (only if damaged)'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman clears drain line', low: 110, high: 170, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'appliance', title: 'Appliance repair company', low: 170, high: 300, etaDays: 2, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 90, tax: 'repair'}]},
  sink_leak: {label: 'Leak under sink / dripping faucet', trade: 'Plumbing', options: [
    {type: 'diy', vendor: 'parts', title: 'Ship a supply line / P-trap kit, tenant tightens or swaps', low: 15, high: 35, etaDays: 2, tenantEffort: 'Medium — 20 min, bucket needed', warrantyDays: 0, tax: 'repair', part: 'braided supply line + slip-joint washer kit'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman repairs the connection', low: 120, high: 190, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'plumber', title: 'Licensed plumber', low: 180, high: 350, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 365, tax: 'repair'}]},
  toilet: {label: 'Toilet running / clogged / leaking', trade: 'Plumbing', options: [
    {type: 'diy', vendor: 'parts', title: 'Ship a fill valve + flapper kit, tenant installs', low: 15, high: 30, etaDays: 2, tenantEffort: 'Medium — 30 min, video guide included', warrantyDays: 0, tax: 'repair', part: 'universal fill valve + flapper kit'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman repairs toilet', low: 110, high: 180, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'plumber', title: 'Licensed plumber (needed if leaking at the base)', low: 180, high: 380, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 365, tax: 'repair'}]},
  water_heater: {label: 'No hot water', trade: 'Plumbing', options: [
    {type: 'pro', vendor: 'plumber', title: 'Plumber diagnoses and repairs (thermostat/element/igniter)', low: 180, high: 450, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 365, tax: 'repair'},
    {type: 'emergency', vendor: 'plumber', title: 'Same-day emergency plumber', low: 300, high: 650, etaDays: 0, tenantEffort: 'Be home today', warrantyDays: 365, tax: 'repair'},
    {type: 'replace', vendor: 'plumber', title: 'Replace 40–50 gal water heater (installed)', low: 1400, high: 2400, etaDays: 2, tenantEffort: 'Half-day access', warrantyDays: 2190, tax: 'improvement'}]},
  no_heat: {label: 'No heat', trade: 'HVAC', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant checks thermostat batteries, breaker and filter', low: 0, high: 25, etaDays: 0, tenantEffort: 'Low — 10 min checklist', warrantyDays: 0, tax: 'repair', part: 'furnace filter (correct size from photo)'},
    {type: 'pro', vendor: 'hvac', title: 'HVAC technician, next available', low: 150, high: 450, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 90, tax: 'repair'},
    {type: 'emergency', vendor: 'hvac', title: 'Emergency HVAC call tonight', low: 300, high: 700, etaDays: 0, tenantEffort: 'Be home tonight', warrantyDays: 90, tax: 'repair'}]},
  no_cooling: {label: 'AC not cooling', trade: 'HVAC', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant replaces filter, checks breaker and thermostat', low: 0, high: 25, etaDays: 1, tenantEffort: 'Low — 10 min', warrantyDays: 0, tax: 'repair', part: 'AC air filter'},
    {type: 'pro', vendor: 'hvac', title: 'HVAC technician, next available', low: 150, high: 500, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 90, tax: 'repair'},
    {type: 'emergency', vendor: 'hvac', title: 'Same-day HVAC (heat advisory)', low: 280, high: 650, etaDays: 0, tenantEffort: 'Be home today', warrantyDays: 90, tax: 'repair'}]},
  electrical: {label: 'Outlet / switch / breaker problem', trade: 'Electrical', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant resets GFCI / breaker (guided, no tools)', low: 0, high: 0, etaDays: 0, tenantEffort: 'Low — 5 min checklist', warrantyDays: 0, tax: 'repair'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman replaces outlet or switch', low: 100, high: 170, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'electrician', title: 'Licensed electrician (required for burning smell, sparks, warm outlets)', low: 180, high: 400, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 365, tax: 'repair'}]},
  disposal: {label: 'Garbage disposal jammed / humming', trade: 'Plumbing', options: [
    {type: 'diy', vendor: 'parts', title: 'Tenant resets and frees it with the hex key (guided)', low: 0, high: 10, etaDays: 0, tenantEffort: 'Low — 10 min', warrantyDays: 0, tax: 'repair', part: '1/4" disposal hex wrench'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman repairs or swaps disposal', low: 120, high: 260, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'replace', vendor: 'plumber', title: 'Plumber installs new 1/2 HP disposal', low: 280, high: 450, etaDays: 2, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 365, tax: 'improvement'}]},
  pest: {label: 'Pests (ants, roaches, mice)', trade: 'Pest control', options: [
    {type: 'diy', vendor: 'parts', title: 'Ship bait stations + seal kit', low: 20, high: 45, etaDays: 2, tenantEffort: 'Low — place baits', warrantyDays: 0, tax: 'repair', part: 'bait stations + steel wool seal kit'},
    {type: 'pro', vendor: 'pest', title: 'One-time pest treatment', low: 150, high: 300, etaDays: 2, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'pest', title: 'Quarterly pest plan (first visit)', low: 100, high: 150, etaDays: 3, tenantEffort: 'Quarterly visits', warrantyDays: 90, tax: 'repair'}]},
  lock: {label: 'Door / lock problem', trade: 'Locksmith', options: [
    {type: 'diy', vendor: 'parts', title: 'Ship a replacement deadbolt, tenant installs', low: 30, high: 60, etaDays: 2, tenantEffort: 'Medium — 30 min', warrantyDays: 0, tax: 'repair', part: 'rekeyable deadbolt'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman adjusts strike plate / swaps lock', low: 100, high: 180, etaDays: 1, tenantEffort: 'Be home for a 1-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'emergency', vendor: 'locksmith', title: 'Locksmith today (door will not lock)', low: 150, high: 300, etaDays: 0, tenantEffort: 'Be home today', warrantyDays: 90, tax: 'repair'}]},
  gas: {label: 'Possible gas leak', trade: 'Gas / HVAC', options: [
    {type: 'emergency', vendor: 'utility', title: 'Tenant leaves now and calls the gas utility emergency line (free)', low: 0, high: 0, etaDays: 0, tenantEffort: 'Leave the unit immediately; call from outside', warrantyDays: 0, tax: 'repair'},
    {type: 'emergency', vendor: 'hvac', title: 'Emergency gas-certified technician after utility clears the unit', low: 250, high: 600, etaDays: 0, tenantEffort: 'Wait outside for the technician', warrantyDays: 90, tax: 'repair'},
    {type: 'pro', vendor: 'plumber', title: 'Licensed plumber repairs gas line / connector', low: 200, high: 500, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 365, tax: 'repair'}]},
  other: {label: 'General repair', trade: 'General', options: [
    {type: 'diy', vendor: 'parts', title: 'Owner sends guidance, tenant attempts simple fix', low: 0, high: 40, etaDays: 1, tenantEffort: 'Varies', warrantyDays: 0, tax: 'repair'},
    {type: 'handyman', vendor: 'handyman', title: 'Handyman visit (1–2 hours)', low: 120, high: 240, etaDays: 1, tenantEffort: 'Be home for a 2-hour window', warrantyDays: 30, tax: 'repair'},
    {type: 'pro', vendor: 'handyman', title: 'Get two quotes before deciding', low: 0, high: 0, etaDays: 3, tenantEffort: 'Two visits', warrantyDays: 0, tax: 'repair'}]},
};

export const ISSUE_KEYS = Object.keys(ISSUES);
