'use strict';

// ─── REFERENCE DATA ──────────────────────────────────────────────────────────

const DRUG_NAMES = {
  oxycodone5mg:    'Oxycodone 5mg',
  hydrocodone10mg: 'Hydrocodone 10mg',
  adderall20mg:    'Adderall 20mg',
  xanax05mg:       'Xanax 0.5mg',
  metformin500mg:  'Metformin 500mg',
  ozempic05mg:     'Ozempic 0.5mg',
  lipitor20mg:     'Lipitor 20mg',
  amoxicillin500mg:'Amoxicillin 500mg'
};

// Opening counts for CS drugs (used as max reference in check_inventory)
const CS_START = {
  oxycodone5mg:    142,
  hydrocodone10mg:  88,
  adderall20mg:     54,
  xanax05mg:       203
};

// Max stock for standard inventory drugs
const INV_MAX = {
  metformin500mg:   400,
  ozempic05mg:       30,
  lipitor20mg:      150,
  amoxicillin500mg: 320
};

// Reorder-at thresholds (par levels)
const PAR_LEVELS = {
  metformin500mg:   120,
  ozempic05mg:       10,
  lipitor20mg:       50,
  amoxicillin500mg: 100,
  oxycodone5mg:      60,
  hydrocodone10mg:   40,
  adderall20mg:      25,
  xanax05mg:         80
};

// ─── PHARMACY STATE ──────────────────────────────────────────────────────────

const PHARMACY_STATE = {
  shiftMinutes: 0,
  running: false,
  scriptsFilled: 0,
  agentFlags: 0,
  diversionDetected: false,
  checkedIn: 0,
  controlledSubstances: {
    oxycodone5mg:    { expected: 142, actual: 142, fills: [], discrepancies: [] },
    hydrocodone10mg: { expected: 88,  actual: 88,  fills: [], discrepancies: [] },
    adderall20mg:    { expected: 54,  actual: 54,  fills: [], discrepancies: [] },
    xanax05mg:       { expected: 203, actual: 203, fills: [], discrepancies: [] }
  },
  inventory: {
    metformin500mg:   340,
    ozempic05mg:        6,
    lipitor20mg:      120,
    amoxicillin500mg: 280
  },
  followUps: [],
  events: []
};

// ─── SCRIPTED EVENTS ─────────────────────────────────────────────────────────

const EVENTS = [
  { at: 5,   type: 'fill',           drug: 'metformin500mg',   qty: 60, pt: 'Chen M.' },
  { at: 12,  type: 'fill',           drug: 'lipitor20mg',      qty: 30, pt: 'Williams K.' },
  { at: 18,  type: 'fill',           drug: 'oxycodone5mg',     qty: 20, pt: 'Thompson R.' },
  { at: 25,  type: 'reject',         drug: 'ozempic05mg',      code: 75, pt: 'Diaz V.' },
  { at: 31,  type: 'fill',           drug: 'amoxicillin500mg', qty: 21, pt: 'Martinez L.' },
  { at: 38,  type: 'fill',           drug: 'oxycodone5mg',     qty: 15, pt: 'Patel S.' },
  { at: 45,  type: 'fill',           drug: 'xanax05mg',        qty: 30, pt: 'Brown C.' },
  { at: 52,  type: 'fill',           drug: 'metformin500mg',   qty: 90, pt: 'Garcia J.' },
  { at: 58,  type: 'shortage',       drug: 'ozempic05mg' },
  { at: 65,  type: 'fill',           drug: 'oxycodone5mg',     qty: 20, pt: 'Davis E.' },
  { at: 72,  type: 'fill',           drug: 'hydrocodone10mg',  qty: 30, pt: 'Wilson N.' },
  { at: 78,  type: 'fill',           drug: 'lipitor20mg',      qty: 30, pt: 'Anderson P.' },
  { at: 85,  type: 'fill',           drug: 'adderall20mg',     qty: 30, pt: 'Taylor B.' },
  { at: 88,  type: 'discrepancy',    drug: 'oxycodone5mg',     gap: -4, n: 1 },
  { at: 95,  type: 'fill',           drug: 'amoxicillin500mg', qty: 28, pt: 'Thomas R.' },
  { at: 102, type: 'fill',           drug: 'ozempic05mg',      qty: 1,  pt: 'Jackson M.' },
  { at: 108, type: 'reject',         drug: 'adderall20mg',     code: 70, pt: 'Reed T.' },
  { at: 115, type: 'fill',           drug: 'oxycodone5mg',     qty: 20, pt: 'Harris L.' },
  { at: 120, type: 'patient_pickup', drug: 'oxycodone5mg',     pt: 'Morris A.' },
  { at: 122, type: 'discrepancy',    drug: 'oxycodone5mg',     gap: -3, n: 2 },
  { at: 130, type: 'diversion',      drug: 'oxycodone5mg' },
  { at: 135, type: 'shift_report' }
];
EVENTS.sort((a, b) => a.at - b.at);

// ─── TIME HELPERS ─────────────────────────────────────────────────────────────

// Converts shift-elapsed minutes to a 24-hour wall-clock string (HH:MM).
// Shift anchor is 09:00, so shiftTimeStr(0) === '09:00'.
function shiftTimeStr(minutes) {
  const total = 9 * 60 + minutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── TOOL: trace_discrepancy ─────────────────────────────────────────────────

function trace_discrepancy(drug, gap) {
  const absGap = Math.abs(gap);
  // Confidence decreases as gap grows: each unit of gap costs 10% confidence,
  // floored at 0.1 so the result stays in [0.1, 1] even for very large gaps.
  const confidence = Math.max(0.1, 1 - absGap * 0.1);
  const action = absGap === 0 ? 'resolve' : 'escalate';
  const drugName = DRUG_NAMES[drug] || drug;
  const cs = PHARMACY_STATE.controlledSubstances[drug];

  const steps = [
    `Retrieve opening count for ${drugName}: ${cs ? cs.expected : '—'}`,
    `Review fill transaction ledger: ${cs ? cs.fills.length : 0} recorded fills`,
    `Compute expected on-hand after fills: ${cs ? cs.expected : '—'}`,
    absGap > 0
      ? `Count gap of ${absGap} unit${absGap !== 1 ? 's' : ''} confirmed — ${action}`
      : `Count fully reconciled — no discrepancy found`
  ];

  return {
    steps,
    explanation: absGap === 0
      ? `${drugName} count is fully reconciled. No action required.`
      : `${drugName} shows a discrepancy of ${absGap} unit${absGap !== 1 ? 's' : ''}. ` +
        `Notify pharmacist and review the fill ledger for this shift.`,
    confidence,
    action
  };
}

// ─── TOOL: check_inventory ───────────────────────────────────────────────────

function check_inventory(drug) {
  const isCS = drug in PHARMACY_STATE.controlledSubstances;
  const cs   = PHARMACY_STATE.controlledSubstances[drug];
  const current = isCS ? cs.actual : (PHARMACY_STATE.inventory[drug] ?? 0);
  const max     = isCS ? CS_START[drug] : (INV_MAX[drug] ?? 100);
  const par     = PAR_LEVELS[drug] ?? 0;
  const pct     = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const shortage = drug === 'ozempic05mg';

  let status;
  if (current === 0)              status = 'critical';
  else if (current <= par * 0.5) status = 'low';
  else if (current <= par)       status = 'warn';
  else                           status = 'good';

  let recommendation;
  if (current === 0) {
    recommendation =
      `CRITICAL: ${DRUG_NAMES[drug] || drug} is out of stock. Contact wholesaler immediately.`;
  } else if (current <= par) {
    recommendation =
      `Reorder ${DRUG_NAMES[drug] || drug} — stock at or below par (${par}).` +
      (shortage ? ' FDA shortage active: expect extended lead times.' : '');
  } else {
    recommendation =
      `${DRUG_NAMES[drug] || drug} stock is adequate (${current} units, ${pct}% of max).`;
  }

  return { current, par, max, pct, status, shortage, recommendation };
}

// ─── TOOL: decode_reject ─────────────────────────────────────────────────────

const REJECT_CODE_MAP = {
  70: {
    meaning:      'DAW code mismatch — product/service not covered as submitted',
    likelyCause:  'Claim submitted with DAW-1 (brand medically necessary) but plan requires DAW-0 (generic allowed)',
    fix:          'Rebill as DAW-0 or obtain a written DAW-1 brand-necessary override from the prescriber',
    patientScript:'Your insurance requires the generic version. We\'re reprocessing — this should only take a moment.',
    goodrx:       'Yes — GoodRx generic pricing available while the override is processed'
  },
  75: {
    meaning:      'refill too soon — prescription submitted before the plan\'s refill window has opened',
    likelyCause:  'Patient\'s last fill date on file with the PBM is too recent; the refill window has not elapsed',
    fix:          'Request a vacation override from the PBM or initiate a prior authorization. Offer GoodRx cash pricing as a bridge.',
    patientScript:'Your insurance won\'t cover a refill quite yet. I can check a discounted cash price through GoodRx, or we can submit an exception.',
    goodrx:       'Yes — offer GoodRx as a bridge option while the override is pending'
  },
  76: {
    meaning:      'Plan quantity limit exceeded or step-therapy prior authorization required',
    likelyCause:  'Fill quantity exceeds the plan\'s per-fill limit, or step-therapy criteria have not been met; prior authorization is needed',
    fix:          'Verify fill quantity against plan limits; submit a quantity-limit override or prior authorization request to the PBM',
    patientScript:'Your insurance needs a special approval for this medication. Your prescriber may need to submit documentation — the pharmacist will follow up.',
    goodrx:       'No — prior authorization is required regardless of payment method'
  },
  79: {
    meaning:      'Refill too soon for a controlled substance — early refill not permitted under plan rules or state law',
    likelyCause:  'Controlled substance refill submitted before the mandatory waiting period; plans restrict early refills on Schedule II–IV drugs',
    fix:          'Verify the last fill date and applicable state regulations. Do not dispense — escalate to pharmacist for review before proceeding.',
    patientScript:'I\'m not able to process this controlled substance refill yet. The pharmacist will review and explain the next steps.',
    goodrx:       'No — controlled substance regulations apply regardless of payment method'
  },
  88: {
    meaning:      'DUR reject — drug utilization review conflict flagged by the PBM',
    likelyCause:  'Potential drug-drug interaction, duplicate therapy, or dose exceeds plan maximum for this drug class',
    fix:          'Review for interaction or duplicate therapy; a pharmacist DUR override with the appropriate level-of-effort code may be required',
    patientScript:'Your insurance flagged a potential concern with this medication combination. Our pharmacist will review and follow up with you shortly.',
    goodrx:       'Possibly — depending on the DUR outcome; pharmacist must review before dispensing'
  }
};

function decode_reject(code, drug) {
  const entry = REJECT_CODE_MAP[code];
  if (!entry) {
    return {
      meaning:      'Unrecognized NCPDP reject code — manual review required',
      likelyCause:  'This code is not in the standard reference; it may be a PBM-specific proprietary code',
      fix:          'Escalate to pharmacist for manual review and contact the PBM help desk directly',
      patientScript:'There\'s a billing issue with this claim. Let me get the pharmacist to assist you right away.',
      goodrx:       'Check GoodRx as a cash-pay fallback while the billing issue is being resolved'
    };
  }
  return { ...entry };
}

// ─── TOOL: add_followup ──────────────────────────────────────────────────────

let _followupCounter = 0;

function add_followup(patient, reason, remindInMinutes = 0) {
  const id = `fu-${++_followupCounter}-${Date.now()}`;
  const remindAt = PHARMACY_STATE.shiftMinutes + (remindInMinutes || 0);
  const entry = { id, patient, reason, remindAt, overdue: false, status: 'open' };
  PHARMACY_STATE.followUps.push(entry);
  return { id, patient, reason, remindAt };
}

// ─── TOOL: generate_form106 ──────────────────────────────────────────────────

function generate_form106(drug, totalGap, discrepancies = []) {
  const drugName = DRUG_NAMES[drug] || drug;
  const dateRange = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  return {
    drugInfo:         `${drugName} — Schedule CII controlled substance`,
    quantityMissing:  totalGap,
    dateRange,
    narrative:
      `DEA Form 106 — Report of Theft or Significant Loss of Controlled Substances. ` +
      `Drug: ${drugName}. ` +
      `${discrepancies.length || 'Multiple'} unexplained count ` +
      `discrepanc${discrepancies.length === 1 ? 'y' : 'ies'} totaling ` +
      `${totalGap} units unaccounted for this shift. ` +
      `Pattern is consistent with possible diversion. ` +
      `File DEA Form 106 with the DEA Diversion Control Division and notify ` +
      `the pharmacist-in-charge and DEA registrant immediately.`
  };
}

// ─── TOOL: flag_pharmacist ────────────────────────────────────────────────────

let _flagCounter = 0;

function flag_pharmacist(reason, priority = 'medium', context = '') {
  const flagId = `flag-${++_flagCounter}-${Date.now()}`;
  const timestamp = Date.now();
  PHARMACY_STATE.agentFlags++;
  return { flagId, reason, priority, timestamp };
}

// ─── TOOL: generate_shift_report ─────────────────────────────────────────────

function generate_shift_report() {
  const csStatus = Object.entries(PHARMACY_STATE.controlledSubstances).map(([key, cs]) => ({
    drug:   DRUG_NAMES[key] || key,
    expected: cs.expected,
    actual:   cs.actual,
    gap:      cs.actual - cs.expected,
    status:   cs.discrepancies.length > 0 ? 'flagged' : 'reconciled'
  }));

  const inventoryAlerts = Object.entries(PHARMACY_STATE.inventory)
    .filter(([key, count]) => count <= (PAR_LEVELS[key] || 0))
    .map(([key, count]) => ({
      drug:     DRUG_NAMES[key] || key,
      current:  count,
      par:      PAR_LEVELS[key] || 0,
      shortage: key === 'ozempic05mg'
    }));

  const openFollowups = PHARMACY_STATE.followUps
    .filter(f => (f.status || 'open') !== 'completed');

  const recommendations = [];
  if (PHARMACY_STATE.diversionDetected) {
    recommendations.push('File DEA Form 106 — diversion pattern confirmed. Notify pharmacist-in-charge immediately.');
  }
  if (inventoryAlerts.length > 0) {
    recommendations.push(`Reorder: ${inventoryAlerts.map(a => a.drug).join(', ')}`);
  }
  if (openFollowups.length > 0) {
    recommendations.push(
      `${openFollowups.length} open follow-up${openFollowups.length !== 1 ? 's' : ''} require attention`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('No critical items — shift handoff clear');
  }

  return {
    scriptsFilled:    PHARMACY_STATE.scriptsFilled,
    agentFlags:       PHARMACY_STATE.agentFlags,
    openFollowups,
    csStatus,
    inventoryAlerts,
    recommendations
  };
}

// ─── STATE SNAPSHOT ───────────────────────────────────────────────────────────

function buildStateSnapshot() {
  return {
    shiftMinutes:         PHARMACY_STATE.shiftMinutes,
    controlledSubstances: PHARMACY_STATE.controlledSubstances,
    inventory:            PHARMACY_STATE.inventory,
    followUps:            PHARMACY_STATE.followUps,
    recentEvents:         EVENTS.filter(e => e.at <= PHARMACY_STATE.shiftMinutes).slice(-10)
  };
}

// ─── PATIENT INTAKE ───────────────────────────────────────────────────────────

function _isValidDob(dob) {
  const parts = (dob || '').trim().split('/');
  if (parts.length !== 3) return false;
  const [m, d, y] = parts.map(Number);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return false;
  if (m < 1 || m > 12)   return false;
  if (d < 1 || d > 31)   return false;
  if (y < 1900 || y > new Date().getFullYear()) return false;
  return true;
}

function patient_intake(step, input = {}, context = {}) {
  switch (step) {
    case 'WELCOME':
      return { requiresInput: true, prompt: 'Welcome! Are you here to pick up a prescription?' };

    case 'VERIFY_IDENTITY':
      if (!input.lastName && !input.dob) {
        return { requiresInput: true, prompt: 'Please provide your last name and date of birth.', error: null };
      }
      if (input.dob && !_isValidDob(input.dob)) {
        return {
          requiresInput: true,
          prompt: 'Please enter a valid date of birth in MM/DD/YYYY format.',
          error: 'Invalid date of birth format — expected MM/DD/YYYY'
        };
      }
      return { requiresInput: false, verified: true, patient: input.lastName || 'Unknown' };

    case 'FOUND':
      return { requiresInput: false, drug: context.drug || 'Prescription', copay: context.copay || 0 };

    case 'COPAY':
      return { requiresInput: true, prompt: 'Your copay is ready. How would you like to pay?' };

    case 'COUNSELING':
      return { requiresInput: true, prompt: 'Would you like to speak with the pharmacist about this medication today?' };

    case 'COMPLETE':
      PHARMACY_STATE.checkedIn++;
      return {
        requiresInput: false,
        complete: true,
        message: 'Thank you! Your prescription is ready. Have a great day!'
      };

    default:
      return { requiresInput: false, error: `Unknown intake step: ${step}` };
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
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
};
