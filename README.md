# Remi

An agentic AI assistant for the retail pharmacy counter. Remi operates in two modes — **Tech Mode** for pharmacy staff and **Patient Mode** for patients at pickup — running an autonomous monitoring loop that detects issues, investigates discrepancies, and handles routine patient interactions without being prompted.

---

## Table of Contents

- [Overview](#overview)
- [Motivation](#motivation)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Roadmap](#roadmap)
- [Author](#author)

---

## Overview

Remi is a desktop application built with Electron and powered by the Anthropic Claude API. It simulates a full pharmacy shift in accelerated time, firing clinical events that trigger a genuine agentic reasoning loop — Claude receives pharmacy state as context, selects from a defined tool set, executes multi-step investigations, and renders its chain of thought in real time.

The application runs as a native desktop window with a custom titlebar, application menu, and keyboard shortcuts. The source is a single `index.html` renderer with no frontend framework dependencies.

---

## Motivation

Retail pharmacy technicians are interrupted an average of once every four minutes. Each interruption carries clinical risk — a lost count on a controlled substance, a forgotten patient callback, an insurance rejection left unresolved.

Controlled substance discrepancy investigations are federally mandated and DEA-audited. In the majority of independent retail pharmacies, they are conducted manually using paper logs and memory. Enterprise solutions exist for hospital pharmacy environments. The independent retail segment lacks purpose-built tooling.

Remi addresses three specific failure points in the retail pharmacy workflow:

1. Controlled substance count discrepancies go uninvestigated until audit pressure forces a reconciliation.
2. Insurance rejection codes are decoded manually, with no standardized decision support for the technician.
3. Patient pickup interactions pull the technician out of active workflow for routine, highly structured exchanges that do not require clinical judgment.

---

## Features

### Tech Mode

**Autonomous Shift Monitoring**
Remi runs a continuous event loop over a simulated pharmacy shift. Events fire at defined shift intervals — fills, insurance rejections, inventory changes, controlled substance counts. Each event triggers an agentic decision loop without user input.

**Controlled Substance Discrepancy Investigation**
When a count mismatch is detected, Remi calls `trace_discrepancy()` as a Claude tool. Claude receives the full transaction history, reconstructs expected counts step by step, identifies the most plausible explanation, and flags unexplained gaps for pharmacist review.

**Diversion Pattern Detection**
When the same drug shows unexplained gaps across multiple count cycles within a shift, Remi escalates to a diversion assessment and generates DEA Form 106 documentation language. Single discrepancies and multi-cycle patterns are handled differently — the agent distinguishes between a logging error and a behavioral pattern.

**Insurance Reject Decoding**
NCPDP rejection codes trigger a `decode_reject()` tool call. Remi returns the plain-English meaning of the code, the most likely cause, the recommended resolution path, and a patient-facing script for the technician to use at the counter.

**Inventory Intelligence**
Fill events decrement inventory state in real time. Remi monitors stock levels against par thresholds and proactively flags items approaching reorder points. FDA shortage designations are tracked separately — when a shortage drug runs low, Remi extends the urgency assessment to account for extended lead times and active patient impact.

**Follow-up Queue Management**
Remi maintains a persistent queue of open patient follow-ups across the shift. Items age in real time and surface automatically when overdue. End-of-shift handoff report includes all unresolved queue items with recommended next actions.

**Drug Interaction Checker**
Dedicated interaction checking via OpenFDA label data and Claude reasoning. Returns severity classification (contraindicated, major, moderate, minor), mechanism, and clinical management recommendation for any drug pair. Disclosed in the UI as clinical decision support, not a replacement for a certified interaction database.

**Drug Information Tooltips**
Hovering any drug name in the application surfaces a tooltip with drug class, schedule, standard dosing range, black box warnings, and known interactions pulled from the OpenFDA API. Results are cached per session to avoid redundant network requests.

**Remi's Reasoning Panel**
Every autonomous agent action renders its chain of thought in the center panel, one line at a time. This is Claude's actual output from each tool-use call — not pre-written strings — streamed into the UI as it arrives.

**Free-form Command Bar**
Technicians can query Remi at any point during the shift. All queries are answered with full pharmacy state injected into context.

---

### Patient Mode

**Identity Verification**
Collects patient name and date of birth before surfacing prescription details.

**Prescription Lookup**
Surfaces active prescriptions ready for pickup — drug name, quantity, prescriber, fill status.

**Copay Explanation**
Presents the copay with insurance context. Surfaces an explanation when the copay is higher than expected and offers a GoodRx cash-pay comparison automatically when the cash price is lower.

**OBRA '90 Counseling Offer**
Handles the federally mandated pharmacist counseling offer conversationally and documents the offer and patient response automatically. When a patient accepts or raises a question, Remi queues the interaction for the pharmacist with full context.

**Digital Signature Capture**
Collects pickup acknowledgment and logs timestamp, drug, quantity, and patient confirmation to shift state.

**Patient Check-in Tracking**
Every completed intake is logged in the Patients tab with full intake records. The Shift Stats panel shows a live checked-in counter. Tech Mode surfaces a real-time notification when a patient initiates intake in Patient Mode.

**Cross-Mode State Awareness**
Patient Mode operates on the same state object as Tech Mode. If a patient presents to pick up a drug carrying an active discrepancy flag, Remi surfaces a silent alert to the technician without interrupting the patient interaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      PHARMACY_STATE                          │
│    Single global object. Both modes read and write to it.   │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────▼─────────────┐
          │     Simulation Engine      │
          │  Fires events at defined   │
          │  shift minute intervals    │
          └─────────────┬─────────────┘
                        │ event fires
          ┌─────────────▼─────────────┐
          │    agentDecisionLoop()     │
          │                           │
          │  1. Build state snapshot  │
          │  2. Call Claude API       │
          │     with tool definitions │
          │  3. Claude selects tool   │
          │  4. Execute tool          │
          │  5. Return result to      │
          │     Claude                │
          │  6. Render reasoning      │
          │  7. Update state + UI     │
          │  8. Log to shift record   │
          └─────────────┬─────────────┘
                        │
          ┌─────────────▼─────────────┐
          │        Tool Layer          │
          │                           │
          │  trace_discrepancy()      │
          │  check_inventory()        │
          │  decode_reject()          │
          │  flag_pharmacist()        │
          │  generate_form106()       │
          │  add_followup()           │
          │  patient_intake()         │
          │  generate_shift_report()  │
          └─────────────┬─────────────┘
                        │
          ┌─────────────▼─────────────┐
          │          UI Layer          │
          │                           │
          │  Tech Mode (6 sections)   │
          │  Patient Mode             │
          │  Reasoning Panel          │
          │  Live Feed                │
          │  State Board              │
          └───────────────────────────┘
```

For full system documentation see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Desktop | Electron | Native window, application menu, keyboard shortcuts, dock icon |
| Frontend | Vanilla HTML/CSS/JS | Zero framework dependencies. No build step for the renderer. |
| AI | Anthropic Claude claude-sonnet-4-6 | Tool-use support required for genuine multi-step agentic behavior |
| Drug Data | OpenFDA API | Free, public, no API key required. Real drug label and interaction data. |
| Fonts | Space Grotesk, JetBrains Mono | UI legibility and clinical data readability respectively |
| Simulation | Custom JS state machine | Deterministic event scheduling with configurable time acceleration |
| Storage | localStorage | API key only. No patient data persisted. |
| Packaging | electron-builder | Produces signed-ready .dmg for macOS, .exe for Windows |

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com)

### Development

```bash
git clone https://github.com/anamahmedshamsi12/remi-rx.git
cd remi-rx
npm install
npm start
```

### Build

```bash
npm run build
```

Produces a packaged application in `dist/`. On macOS: `Remi-1.0.0-arm64.dmg`.

Note: the build is unsigned. On macOS, first launch requires right-click → Open → Open anyway to bypass Gatekeeper. This is expected behavior for applications without an Apple Developer ID.

### API Key

On first launch, click **API Key** in the top bar and paste your Anthropic API key. Stored in `localStorage` under `remi_api_key`. Only ever transmitted to `api.anthropic.com`.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd/Ctrl+N | New shift |
| Cmd/Ctrl+P | Toggle Patient Mode |
| Cmd/Ctrl+R | Generate shift report |
| Cmd/Ctrl+, | Settings |
| Escape | Return to Tech Mode |

---

## Project Structure

```
remi-rx/
├── main.js                 # Electron main process
├── preload.js              # Context bridge
├── package.json
├── index.html              # Full application renderer
├── README.md
├── assets/
│   └── icon.png            # Application icon (1024×1024)
├── tests/
│   └── remi.test.js        # Test suite — node tests/remi.test.js
└── docs/
    ├── ARCHITECTURE.md     # System design document
    ├── DOMAIN.md           # Pharmacy domain knowledge reference
    └── DEMO.md             # Demo walkthrough
```

### Running Tests

```bash
node tests/remi.test.js
```

No external test framework required.

---

## Design Decisions

**Electron over browser deployment**
A desktop application is the correct form factor for pharmacy counter software. Pharmacies install software — they do not navigate to URLs. Electron provides a native window, application menu, dock presence, and keyboard shortcuts that match the expectation of installed clinical tooling.

**Single renderer file**
The entire frontend lives in `index.html`. This keeps the deployment surface minimal and makes the codebase readable in one pass. The AI reasoning layer is the architectural complexity — the delivery mechanism should be invisible.

**Genuine tool-use over scripted responses**
The reasoning panel renders Claude's actual output from each tool-use API call. Scripted responses would be faster to build and visually indistinguishable, but would not constitute genuine agentic behavior. The distinction matters for correctness — a scripted system cannot handle inputs it was not scripted for.

**Pre-scripted simulation over live PMS integration**
Remi does not integrate with a live pharmacy management system. The simulation engine fires deterministic events that represent realistic shift scenarios. This allows the agentic reasoning layer to be evaluated independently of data integration complexity.

**Shared state object across modes**
Tech Mode and Patient Mode read and write to a single `PHARMACY_STATE` object. This enables cross-mode awareness — Patient Mode surfaces discrepancy flags on drugs being picked up without any synchronization layer.

**OpenFDA for drug data**
Free, public, no API key, maintained by the US government. Appropriate for a portfolio project. A production implementation would use a certified clinical database such as Lexicomp or Micromedex, disclosed in the UI.

---

## Roadmap

**V2 — Data Integration**
- PioneerRx and Datascan PMS integration via API
- Real transaction history replacing simulated fills
- Live inventory sync from wholesaler feeds (Cardinal Health, McKesson)

**V2 — Communication Layer**
- Outbound fax to prescriber offices via SRFax API
- Patient SMS notifications via Twilio
- Prescriber callback queue with automated follow-up scheduling

**V3 — Hardware**
- Dedicated counter device: Raspberry Pi 4, 8-inch touchscreen, integrated mic and speaker
- Wake word activation for hands-free technician interaction
- Patient-facing display with proximity detection for automatic mode switching
- Local processing for PHI to reduce network dependency

---

## Author
