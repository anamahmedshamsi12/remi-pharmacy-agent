/*
 * Remi — AI Pharmacy Agent
 * Test Suite
 *
 * @file remi.test.js
 * @description Automated tests for all major Remi
 *              features. Tests are grouped by feature
 *              area and run sequentially. Each test
 *              logs PASS or FAIL with a description.
 *
 * @usage node tests/remi.test.js
 * @author Anam
 */

// ─── BROWSER GLOBALS MOCK ────────────────────────────────────────────────────

global.window = {
  innerWidth: 1440,
  localStorage: {
    getItem:    () => null,
    setItem:    () => {},
    removeItem: () => {}
  }
};
global.document = {
  getElementById: () => ({
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    textContent: '',
    innerHTML: ''
  }),
  createElement: () => ({
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    innerHTML: '',
    textContent: ''
  }),
  querySelector:    () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.fetch = async () => ({
  ok: true,
  json: async () => ({ results: [] })
});

// ─── IMPORTS ─────────────────────────────────────────────────────────────────

const {
  PHARMACY_STATE,
  EVENTS,
  shiftTimeStr,
  trace_discrepancy,
  check_inventory,
  decode_reject,
  add_followup,
  generate_form106,
  flag_pharmacist,
  generate_shift_report,
  buildStateSnapshot,
  patient_intake
} = require('./core');

// ─── TEST RUNNER ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓  ${description}`);
    passed++;
  } catch (e) {
    console.log(`  ✗  ${description}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(
    `${message} — expected ${JSON.stringify(expected)},` +
    ` got ${JSON.stringify(actual)}`
  );
}

function assertExists(value, message) {
  if (value === null || value === undefined)
    throw new Error(`${message} — got ${value}`);
}

function assertArray(value, message) {
  if (!Array.isArray(value))
    throw new Error(`${message} — got ${typeof value}`);
}

function assertRange(value, min, max, message) {
  if (value < min || value > max)
    throw new Error(
      `${message} — ${value} not in [${min}, ${max}]`
    );
}

// ══════════════════════════════════════════
// PHARMACY STATE
// ══════════════════════════════════════════

console.log('\nPharmacy State');

test('PHARMACY_STATE exists', () => {
  assertExists(PHARMACY_STATE, 'PHARMACY_STATE should exist');
});

test('shiftMinutes initializes to 0', () => {
  assertEqual(PHARMACY_STATE.shiftMinutes, 0, 'shiftMinutes');
});

test('running initializes to false', () => {
  assertEqual(PHARMACY_STATE.running, false, 'running');
});

test('scriptsFilled initializes to 0', () => {
  assertEqual(PHARMACY_STATE.scriptsFilled, 0, 'scriptsFilled');
});

test('agentFlags initializes to 0', () => {
  assertEqual(PHARMACY_STATE.agentFlags, 0, 'agentFlags');
});

test('diversionDetected initializes to false', () => {
  assertEqual(PHARMACY_STATE.diversionDetected, false, 'diversionDetected');
});

test('controlledSubstances has oxycodone5mg, hydrocodone10mg, adderall20mg, xanax05mg', () => {
  assertExists(PHARMACY_STATE.controlledSubstances.oxycodone5mg,    'oxycodone5mg');
  assertExists(PHARMACY_STATE.controlledSubstances.hydrocodone10mg, 'hydrocodone10mg');
  assertExists(PHARMACY_STATE.controlledSubstances.adderall20mg,    'adderall20mg');
  assertExists(PHARMACY_STATE.controlledSubstances.xanax05mg,       'xanax05mg');
});

test('each CS drug has expected, actual, fills, discrepancies fields', () => {
  ['oxycodone5mg', 'hydrocodone10mg', 'adderall20mg', 'xanax05mg'].forEach(drug => {
    const cs = PHARMACY_STATE.controlledSubstances[drug];
    assertExists(cs.expected,              `${drug}.expected`);
    assert(cs.actual !== undefined,        `${drug}.actual should exist`);
    assertArray(cs.fills,                  `${drug}.fills`);
    assertArray(cs.discrepancies,          `${drug}.discrepancies`);
  });
});

test('inventory has metformin500mg, ozempic05mg, lipitor20mg, amoxicillin500mg', () => {
  assertExists(PHARMACY_STATE.inventory.metformin500mg,   'metformin500mg');
  assertExists(PHARMACY_STATE.inventory.ozempic05mg,      'ozempic05mg');
  assertExists(PHARMACY_STATE.inventory.lipitor20mg,      'lipitor20mg');
  assertExists(PHARMACY_STATE.inventory.amoxicillin500mg, 'amoxicillin500mg');
});

test('followUps initializes as array', () => {
  assertArray(PHARMACY_STATE.followUps, 'followUps');
});

test('events initializes as array', () => {
  assertArray(PHARMACY_STATE.events, 'events');
});

// ══════════════════════════════════════════
// SIMULATION ENGINE
// ══════════════════════════════════════════

console.log('\nSimulation Engine');

test('EVENTS has at least 15 entries', () => {
  assert(EVENTS.length >= 15, `EVENTS should have at least 15 entries, got ${EVENTS.length}`);
});

test('every event has an at field', () => {
  EVENTS.forEach((ev, i) => {
    assertExists(ev.at, `event[${i}] should have an at field`);
  });
});

test('every event has a type field', () => {
  EVENTS.forEach((ev, i) => {
    assertExists(ev.type, `event[${i}] should have a type field`);
  });
});

test('all event types are valid: fill, reject, discrepancy, diversion, shortage, patient_pickup, shift_report', () => {
  const VALID = new Set(['fill', 'reject', 'discrepancy', 'diversion', 'shortage', 'patient_pickup', 'shift_report']);
  EVENTS.forEach((ev, i) => {
    assert(VALID.has(ev.type), `event[${i}] has invalid type: ${ev.type}`);
  });
});

test('events are sorted by at ascending', () => {
  for (let i = 1; i < EVENTS.length; i++) {
    assert(
      EVENTS[i].at >= EVENTS[i - 1].at,
      `events not sorted at index ${i}: ${EVENTS[i - 1].at} > ${EVENTS[i].at}`
    );
  }
});

test("shiftTimeStr(0) === '09:00'", () => {
  assertEqual(shiftTimeStr(0), '09:00', 'shiftTimeStr(0)');
});

test("shiftTimeStr(60) === '10:00'", () => {
  assertEqual(shiftTimeStr(60), '10:00', 'shiftTimeStr(60)');
});

test("shiftTimeStr(480) === '17:00'", () => {
  assertEqual(shiftTimeStr(480), '17:00', 'shiftTimeStr(480)');
});

test("shiftTimeStr(90) === '10:30'", () => {
  assertEqual(shiftTimeStr(90), '10:30', 'shiftTimeStr(90)');
});

// ══════════════════════════════════════════
// TOOL — trace_discrepancy
// ══════════════════════════════════════════

console.log('\nTool: trace_discrepancy');

test('returns object with steps, explanation, confidence, action', () => {
  const r = trace_discrepancy('oxycodone5mg', 4);
  assertExists(r.steps,       'steps');
  assertExists(r.explanation, 'explanation');
  assertExists(r.confidence,  'confidence');
  assertExists(r.action,      'action');
});

test('steps is array with at least 3 entries', () => {
  const r = trace_discrepancy('oxycodone5mg', 4);
  assertArray(r.steps, 'steps');
  assert(r.steps.length >= 3, `steps should have at least 3 entries, got ${r.steps.length}`);
});

test('gap > 0 returns action: escalate', () => {
  const r = trace_discrepancy('oxycodone5mg', 4);
  assertEqual(r.action, 'escalate', 'gap > 0 should return action: escalate');
});

test('gap of 0 returns action: resolve', () => {
  const r = trace_discrepancy('oxycodone5mg', 0);
  assertEqual(r.action, 'resolve', 'gap of 0 should return action: resolve');
});

test('confidence is number between 0 and 1', () => {
  const r = trace_discrepancy('oxycodone5mg', 4);
  assert(typeof r.confidence === 'number', 'confidence should be a number');
  assertRange(r.confidence, 0, 1, 'confidence');
});

test('large gap (>5) returns confidence < 0.5', () => {
  const r = trace_discrepancy('oxycodone5mg', 6);
  assert(r.confidence < 0.5, `large gap should return confidence < 0.5, got ${r.confidence}`);
});

// ══════════════════════════════════════════
// TOOL — check_inventory
// ══════════════════════════════════════════

console.log('\nTool: check_inventory');

test('returns object with current, par, max, pct, status, shortage, recommendation', () => {
  const r = check_inventory('metformin500mg');
  assert(r.current  !== undefined, 'current should exist');
  assert(r.par      !== undefined, 'par should exist');
  assert(r.max      !== undefined, 'max should exist');
  assert(r.pct      !== undefined, 'pct should exist');
  assertExists(r.status,          'status');
  assert(r.shortage !== undefined, 'shortage should exist');
  assertExists(r.recommendation,  'recommendation');
});

test('pct is between 0 and 100', () => {
  const r = check_inventory('metformin500mg');
  assertRange(r.pct, 0, 100, 'pct');
});

test('status is one of: good, warn, low, critical', () => {
  const VALID = new Set(['good', 'warn', 'low', 'critical']);
  const r = check_inventory('metformin500mg');
  assert(VALID.has(r.status), `status should be one of good/warn/low/critical, got ${r.status}`);
});

test('drug below par returns warn or low status', () => {
  const saved = PHARMACY_STATE.inventory.metformin500mg;
  PHARMACY_STATE.inventory.metformin500mg = 50; // below par of 120
  const r = check_inventory('metformin500mg');
  PHARMACY_STATE.inventory.metformin500mg = saved;
  assert(r.status === 'warn' || r.status === 'low',
    `drug below par should return warn or low, got ${r.status}`);
});

test('ozempic05mg returns shortage: true', () => {
  const r = check_inventory('ozempic05mg');
  assertEqual(r.shortage, true, 'ozempic05mg shortage');
});

test('drug at 0 stock returns status: critical', () => {
  const saved = PHARMACY_STATE.inventory.metformin500mg;
  PHARMACY_STATE.inventory.metformin500mg = 0;
  const r = check_inventory('metformin500mg');
  PHARMACY_STATE.inventory.metformin500mg = saved;
  assertEqual(r.status, 'critical', 'drug at 0 stock should return status: critical');
});

test('pct calculates correctly: (current/max)*100', () => {
  const r = check_inventory('metformin500mg'); // current=340, max=400
  assertEqual(r.pct, 85, 'pct for metformin500mg (340/400)');
});

// ══════════════════════════════════════════
// TOOL — decode_reject
// ══════════════════════════════════════════

console.log('\nTool: decode_reject');

test("returns object with meaning, likelyCause, fix, patientScript, goodrx", () => {
  const r = decode_reject(75, 'ozempic05mg');
  assertExists(r.meaning,       'meaning');
  assertExists(r.likelyCause,   'likelyCause');
  assertExists(r.fix,           'fix');
  assertExists(r.patientScript, 'patientScript');
  assertExists(r.goodrx,        'goodrx');
});

test("code 75 meaning contains 'refill'", () => {
  const r = decode_reject(75, 'ozempic05mg');
  assert(r.meaning.toLowerCase().includes('refill'),
    `code 75 meaning should contain 'refill', got: "${r.meaning}"`);
});

test("code 70 meaning contains 'DAW'", () => {
  const r = decode_reject(70, 'adderall20mg');
  assert(r.meaning.includes('DAW'),
    `code 70 meaning should contain 'DAW', got: "${r.meaning}"`);
});

test("code 76 meaning contains 'authorization'", () => {
  const r = decode_reject(76, 'lipitor20mg');
  assert(r.meaning.toLowerCase().includes('authorization'),
    `code 76 meaning should contain 'authorization', got: "${r.meaning}"`);
});

test("code 79 meaning contains 'controlled'", () => {
  const r = decode_reject(79, 'oxycodone5mg');
  assert(r.meaning.toLowerCase().includes('controlled'),
    `code 79 meaning should contain 'controlled', got: "${r.meaning}"`);
});

test('unknown code returns graceful fallback without throwing', () => {
  let r;
  r = decode_reject('XX', 'metformin500mg');
  assertExists(r.meaning, 'fallback meaning should exist');
  assertExists(r.fix,     'fallback fix should exist');
});

test('all fields are non-empty strings', () => {
  const r = decode_reject(75, 'ozempic05mg');
  ['meaning', 'likelyCause', 'fix', 'patientScript', 'goodrx'].forEach(field => {
    assert(
      typeof r[field] === 'string' && r[field].length > 0,
      `${field} should be a non-empty string, got ${JSON.stringify(r[field])}`
    );
  });
});

// ══════════════════════════════════════════
// TOOL — add_followup
// ══════════════════════════════════════════

console.log('\nTool: add_followup');

test('returns object with id, patient, reason, remindAt', () => {
  const r = add_followup('Mrs. Chen', 'Ozempic price check', 30);
  assertExists(r.id,       'id');
  assertExists(r.patient,  'patient');
  assertExists(r.reason,   'reason');
  assert(r.remindAt !== undefined, 'remindAt should exist');
});

test('PHARMACY_STATE.followUps length increases by 1 after call', () => {
  const before = PHARMACY_STATE.followUps.length;
  add_followup('Mr. Torres', 'Script ready for pickup');
  assertEqual(PHARMACY_STATE.followUps.length, before + 1, 'followUps length');
});

test('new follow-up has overdue: false', () => {
  const r = add_followup('Ms. Rivera', 'Insurance callback needed');
  const fu = PHARMACY_STATE.followUps.find(f => f.id === r.id);
  assertEqual(fu.overdue, false, 'new follow-up overdue');
});

test('new follow-up has correct patient name', () => {
  const r = add_followup('Dr. Patel', 'GoodRx price inquiry');
  const fu = PHARMACY_STATE.followUps.find(f => f.id === r.id);
  assertEqual(fu.patient, 'Dr. Patel', 'patient name');
});

test('new follow-up has correct reason', () => {
  const r = add_followup('Ms. Kim', 'Prior auth status update');
  const fu = PHARMACY_STATE.followUps.find(f => f.id === r.id);
  assertEqual(fu.reason, 'Prior auth status update', 'reason');
});

test('calling twice produces unique ids', () => {
  const r1 = add_followup('Patient A', 'Reason A');
  const r2 = add_followup('Patient B', 'Reason B');
  assert(r1.id !== r2.id, `ids should be unique, both were ${r1.id}`);
});

// ══════════════════════════════════════════
// TOOL — generate_form106
// ══════════════════════════════════════════

console.log('\nTool: generate_form106');

test('returns object with drugInfo, quantityMissing, dateRange, narrative', () => {
  const r = generate_form106('oxycodone5mg', 7, []);
  assertExists(r.drugInfo,         'drugInfo');
  assert(r.quantityMissing !== undefined, 'quantityMissing should exist');
  assertExists(r.dateRange,        'dateRange');
  assertExists(r.narrative,        'narrative');
});

test('narrative is non-empty string', () => {
  const r = generate_form106('oxycodone5mg', 7);
  assert(
    typeof r.narrative === 'string' && r.narrative.length > 0,
    'narrative should be a non-empty string'
  );
});

test('quantityMissing matches gap passed in', () => {
  const r = generate_form106('oxycodone5mg', 7);
  assertEqual(r.quantityMissing, 7, 'quantityMissing');
});

test('drugInfo contains drug name passed in', () => {
  const r = generate_form106('oxycodone5mg', 7);
  assert(
    r.drugInfo.includes('Oxycodone'),
    `drugInfo should contain drug name, got: "${r.drugInfo}"`
  );
});

test('dateRange is non-empty string', () => {
  const r = generate_form106('oxycodone5mg', 7);
  assert(
    typeof r.dateRange === 'string' && r.dateRange.length > 0,
    'dateRange should be a non-empty string'
  );
});

test('does not throw with valid inputs', () => {
  generate_form106('oxycodone5mg', 5, [{ n: 1, gap: -3 }, { n: 2, gap: -2 }]);
  assert(true, 'generate_form106 should not throw');
});

// ══════════════════════════════════════════
// TOOL — flag_pharmacist
// ══════════════════════════════════════════

console.log('\nTool: flag_pharmacist');

test('returns object with flagId, reason, priority, timestamp', () => {
  const r = flag_pharmacist('CS count discrepancy', 'high');
  assertExists(r.flagId,    'flagId');
  assertExists(r.reason,    'reason');
  assertExists(r.priority,  'priority');
  assertExists(r.timestamp, 'timestamp');
});

test('priority is one of: low, medium, high, critical', () => {
  const VALID = new Set(['low', 'medium', 'high', 'critical']);
  const r = flag_pharmacist('Ozempic below par', 'medium');
  assert(VALID.has(r.priority), `priority should be low/medium/high/critical, got ${r.priority}`);
});

test('flagId is unique across two calls', () => {
  const r1 = flag_pharmacist('Reason one', 'low');
  const r2 = flag_pharmacist('Reason two', 'high');
  assert(r1.flagId !== r2.flagId, `flagIds should be unique, both were ${r1.flagId}`);
});

test('timestamp is a number (Date.now())', () => {
  const before = Date.now();
  const r = flag_pharmacist('Diversion pattern', 'critical');
  assert(typeof r.timestamp === 'number',  'timestamp should be a number');
  assert(r.timestamp >= before,            'timestamp should be >= Date.now() at call time');
});

test('reason matches input', () => {
  const r = flag_pharmacist('Adderall 20mg discrepancy requires pharmacist sign-off', 'critical');
  assertEqual(r.reason, 'Adderall 20mg discrepancy requires pharmacist sign-off', 'reason');
});

// ══════════════════════════════════════════
// TOOL — generate_shift_report
// ══════════════════════════════════════════

console.log('\nTool: generate_shift_report');

test('returns object with scriptsFilled, agentFlags, openFollowups, csStatus, inventoryAlerts, recommendations', () => {
  const r = generate_shift_report();
  assert(r.scriptsFilled !== undefined, 'scriptsFilled should exist');
  assert(r.agentFlags    !== undefined, 'agentFlags should exist');
  assertArray(r.openFollowups,          'openFollowups');
  assertArray(r.csStatus,               'csStatus');
  assertArray(r.inventoryAlerts,        'inventoryAlerts');
  assertArray(r.recommendations,        'recommendations');
});

test('scriptsFilled matches PHARMACY_STATE.scriptsFilled', () => {
  const r = generate_shift_report();
  assertEqual(r.scriptsFilled, PHARMACY_STATE.scriptsFilled, 'scriptsFilled');
});

test('openFollowups is an array', () => {
  assertArray(generate_shift_report().openFollowups, 'openFollowups');
});

test('recommendations is an array', () => {
  assertArray(generate_shift_report().recommendations, 'recommendations');
});

test('does not throw', () => {
  generate_shift_report();
  assert(true, 'generate_shift_report should not throw');
});

// ══════════════════════════════════════════
// STATE SNAPSHOT
// ══════════════════════════════════════════

console.log('\nState Snapshot');

test('buildStateSnapshot returns object with shiftMinutes, controlledSubstances, inventory, followUps, recentEvents', () => {
  const snap = buildStateSnapshot();
  assert(snap.shiftMinutes !== undefined,    'shiftMinutes should exist');
  assertExists(snap.controlledSubstances,    'controlledSubstances');
  assertExists(snap.inventory,               'inventory');
  assertArray(snap.followUps,                'followUps');
  assertArray(snap.recentEvents,             'recentEvents');
});

test('shiftMinutes matches PHARMACY_STATE.shiftMinutes', () => {
  const snap = buildStateSnapshot();
  assertEqual(snap.shiftMinutes, PHARMACY_STATE.shiftMinutes, 'shiftMinutes');
});

test('all fields are present and non-null', () => {
  const snap = buildStateSnapshot();
  ['shiftMinutes', 'controlledSubstances', 'inventory', 'followUps', 'recentEvents'].forEach(field => {
    assert(
      snap[field] !== null && snap[field] !== undefined,
      `${field} should be present and non-null`
    );
  });
});

// ══════════════════════════════════════════
// NCPDP REJECT CODES
// ══════════════════════════════════════════

console.log('\nNCPDP Reject Codes');

[75, 70, 76, 79, 88].forEach(code => {
  test(`code ${code} returns valid response with non-empty meaning and fix`, () => {
    const r = decode_reject(code, 'oxycodone5mg');
    assert(
      typeof r.meaning === 'string' && r.meaning.length > 0,
      `code ${code} meaning should be a non-empty string`
    );
    assert(
      typeof r.fix === 'string' && r.fix.length > 0,
      `code ${code} fix should be a non-empty string`
    );
  });
});

test("unknown code 'XX' returns fallback", () => {
  const r = decode_reject('XX', 'metformin500mg');
  assertExists(r.meaning, 'fallback meaning should exist');
  assertExists(r.fix,     'fallback fix should exist');
});

// ══════════════════════════════════════════
// CONTROLLED SUBSTANCE LOGIC
// ══════════════════════════════════════════

console.log('\nControlled Substance Logic');

test('single discrepancy returns action: escalate (not diversion)', () => {
  const r = trace_discrepancy('oxycodone5mg', 4);
  assertEqual(r.action, 'escalate', 'single discrepancy should return escalate, not diversion');
});

test('discrepancies array on oxycodone5mg is initially empty', () => {
  const cs = PHARMACY_STATE.controlledSubstances.oxycodone5mg;
  assertArray(cs.discrepancies, 'discrepancies');
  assertEqual(cs.discrepancies.length, 0, 'oxycodone5mg discrepancies should be initially empty');
});

test('trace_discrepancy with gap 0 does not flag as diversion', () => {
  const r = trace_discrepancy('oxycodone5mg', 0);
  assert(r.action !== 'diversion', 'gap=0 should not flag as diversion');
  assertEqual(r.action, 'resolve', 'gap=0 should return resolve');
});

test('generate_form106 narrative mentions DEA or Form 106', () => {
  const r = generate_form106('oxycodone5mg', 7);
  assert(
    r.narrative.includes('DEA') || r.narrative.includes('Form 106'),
    `narrative should mention DEA or Form 106, got: "${r.narrative.slice(0, 80)}..."`
  );
});

test('generate_form106 quantityMissing equals gap argument', () => {
  const r = generate_form106('oxycodone5mg', 5);
  assertEqual(r.quantityMissing, 5, 'quantityMissing should equal gap argument');
});

// ══════════════════════════════════════════
// PATIENT MODE
// ══════════════════════════════════════════

console.log('\nPatient Mode');

test('patient_intake exists as a function', () => {
  assert(typeof patient_intake === 'function', 'patient_intake should be a function');
});

test('calling with step VERIFY_IDENTITY returns requiresInput: true', () => {
  const r = patient_intake('VERIFY_IDENTITY');
  assertEqual(r.requiresInput, true, 'VERIFY_IDENTITY should return requiresInput: true');
});

test('calling with step COMPLETE returns requiresInput: false', () => {
  const before = PHARMACY_STATE.checkedIn;
  const r = patient_intake('COMPLETE');
  PHARMACY_STATE.checkedIn = before; // restore so increment test below is clean
  assertEqual(r.requiresInput, false, 'COMPLETE should return requiresInput: false');
});

test('valid date of birth passes verification', () => {
  const r = patient_intake('VERIFY_IDENTITY', { lastName: 'Smith', dob: '01/15/1980' });
  assert(!r.error,      'valid DOB should pass without error');
  assertEqual(r.verified, true, 'verified should be true for valid DOB');
});

test('invalid date of birth fails verification with an error message', () => {
  const r = patient_intake('VERIFY_IDENTITY', { lastName: 'Smith', dob: 'invalid-date' });
  assertExists(r.error, 'invalid DOB should return an error message');
});

test('PHARMACY_STATE.checkedIn increments after a complete intake sequence', () => {
  const before = PHARMACY_STATE.checkedIn;
  patient_intake('COMPLETE');
  assertEqual(PHARMACY_STATE.checkedIn, before + 1, 'checkedIn should increment after COMPLETE');
});

// ══════════════════════════════════════════
// INVENTORY LOGIC
// ══════════════════════════════════════════

console.log('\nInventory Logic');

test('drug below par returns reorder recommendation', () => {
  const saved = PHARMACY_STATE.inventory.metformin500mg;
  PHARMACY_STATE.inventory.metformin500mg = 50; // par is 120
  const r = check_inventory('metformin500mg');
  PHARMACY_STATE.inventory.metformin500mg = saved;
  assert(
    r.recommendation.toLowerCase().includes('reorder') ||
    r.recommendation.toLowerCase().includes('critical'),
    `below-par drug should return reorder recommendation, got: "${r.recommendation}"`
  );
});

test('drug with shortage returns extended lead time mention in recommendation', () => {
  const saved = PHARMACY_STATE.inventory.ozempic05mg;
  PHARMACY_STATE.inventory.ozempic05mg = 5; // par is 10
  const r = check_inventory('ozempic05mg');
  PHARMACY_STATE.inventory.ozempic05mg = saved;
  assert(
    r.recommendation.toLowerCase().includes('lead time') ||
    r.recommendation.toLowerCase().includes('shortage'),
    `shortage drug recommendation should mention lead time or shortage, got: "${r.recommendation}"`
  );
});

test('drug at 0 returns status: critical', () => {
  const saved = PHARMACY_STATE.inventory.amoxicillin500mg;
  PHARMACY_STATE.inventory.amoxicillin500mg = 0;
  const r = check_inventory('amoxicillin500mg');
  PHARMACY_STATE.inventory.amoxicillin500mg = saved;
  assertEqual(r.status, 'critical', 'drug at 0 should return status: critical');
});

test('pct for metformin500mg (340/400) equals 85', () => {
  const r = check_inventory('metformin500mg'); // current=340, max=400
  assertEqual(r.pct, 85, 'pct for metformin500mg (340/400)');
});

test('pct never exceeds 100', () => {
  const saved = PHARMACY_STATE.inventory.metformin500mg;
  PHARMACY_STATE.inventory.metformin500mg = 9999;
  const r = check_inventory('metformin500mg');
  PHARMACY_STATE.inventory.metformin500mg = saved;
  assert(r.pct <= 100, `pct should never exceed 100, got ${r.pct}`);
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(40));
console.log('  Remi Test Suite');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('═'.repeat(40) + '\n');

if (failed > 0) process.exit(1);
