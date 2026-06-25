# Remi — Architecture

## Overview

Remi is a single-page, single-file (`index.html`) AI assistant for a retail pharmacy counter. It runs in two modes on one device: **Tech Mode**, where it autonomously watches a simulated shift and uses the Claude API with real tool-use to investigate and react to events, and **Patient Mode**, a kiosk-style pickup flow for patients that shares the same underlying state. There is no backend, build step, or framework — everything lives in client-side HTML/CSS/JS, calling the Anthropic API directly from the browser.

Tech Mode is structured as installed software, not a single screen: a persistent sidebar switches between the live Dashboard and six operational views (Dispensing, Inventory, Follow-ups, Interactions, Reports, Settings). `index.html` also optionally runs inside an Electron shell (`main.js`/`preload.js`) for a native desktop window — but it is never *required*; the same file still opens and fully works in a plain browser tab.

## System Components

| Component | What it does | Reads | Writes |
|---|---|---|---|
| **Simulation Engine** (`events`, `advanceMinute()`, `scheduleTick()`) | Fires a scripted timeline of shift events (fills, rejects, shortages, discrepancies, a diversion reveal) at simulated-shift minutes, at a speed the user controls (1×/2×/4×). | `state.shiftMinutes`, `state.speed`, `state.fired` | `state.shiftMinutes`, `state.fired`, triggers event handlers |
| **Event Handlers** (`handleFill`, `handleReject`, `handleShortage`, `handleDiscrepancy`, `handleDiversion`, `generateHandoffReport`) | Update shift bookkeeping (counts, stats, feed cards) for a fired event, then — for anything that's actually a decision point — call `runAgentTurn()`. | `state` | `state` (counts, stats, logs); calls `runAgentTurn()` |
| **Agentic Tool-Use Engine** (`runAgentTurn()`, `streamClaudeTurn()`, `TOOLS`, `TOOL_IMPL`) | The real decision-maker. Sends an event + state snapshot to Claude with tool definitions; Claude decides what to investigate and concludes with a recommendation. See "Agentic Loop" below. | `state` (via tool calls), `pharmacyStateSnapshot()` | `state` (via `flag_pharmacist`), reasoning panel DOM |
| **Live Shift Feed** (`pushFeedCard()`) | Left-hand panel: an instant, factual log of "what happened" — independent of whether Claude reacted. | `state` | feed panel DOM |
| **Reasoning Panel** (`runAgentTurn()`, `streamClaudeTurn()`, `escapeHtml()`) | Center panel: Claude's actual streamed reasoning, tool calls, and conclusions for each event — and, separately, command-bar Q&A via `askRemi()`. | — | reasoning panel DOM |
| **State Board** (`renderStateBoard()`, `flashStat()`) | Right-hand panel: live shift stats, controlled-substance counts/status, inventory bars, follow-up queue. | `state` | state board DOM |
| **EKG Strip** (`drawEkg()`, `ekgWave()`, `pulseEkg()`) | Purely decorative animated heartbeat that pulses on every shift event. | `ekgAmp`, `ekgX` | canvas |
| **Command Bar** (`askRemi()`, `buildSystemPrompt()`, `submitCommand()`) | Free-form Q&A to Claude, single-turn, no tool-use — separate from the agentic engine by design (see Design Decisions). | `state` (for context) | reasoning panel DOM |
| **API Key Modal** (`getApiKey()`, `openKeyModal()`, `closeKeyModal()`) | Lets the user paste an Anthropic API key, persisted in `localStorage`. Without it, both `runAgentTurn()` and `askRemi()` short-circuit and prompt for one. | `localStorage` | `localStorage` |
| **Patient Mode** (`renderPatientStep()`, `patientData`, `pickupDrugPool`) | Kiosk-style pickup flow: identity verification, prescription lookup, copay explanation, OBRA '90 counseling offer, signature/confirmation. | `state`, `patientData` | `state`, `patientData`, patient-mode DOM |
| **Cross-Mode Link** (`checkCrossModeAndProceed()`, `flashCrossModeAlert()`, `seedInteractionCheck()`) | The link between Patient Mode and Tech Mode: redirects a pickup to "team member needed" if the drug has an active CS flag/diversion alert, and seeds the Interactions view's chip list with whatever the patient just picked up. | `state.csFlags`, `state.diversionDetected` | patient-mode DOM, `state.followupList`, `interactionDrugs` |
| **Sidebar / View Switching** (`switchView()`, `#sidebar`) | Persistent left rail (48px, hover-expands to 220px) that toggles which `.view` is visible in the content area. Dashboard is always-live; the other six views rebuild from `state` on every switch. | — | DOM `.active` classes |
| **Dispensing View** (`renderDispensingView()`, `dispensingTimeline()`, `exportDispensingCsv()`) | Full CS log as a merged, time-sorted timeline of fills + count-cycle discrepancies (not fills with gaps attributed to them — see its doc comment for why), with filters and CSV export. | `state.csLog`, `state.oxyDiscrepancies` | view DOM, downloads a `.csv` file |
| **Inventory View** (`renderInventoryView()`, `stockStatus()`, `PAR_LEVELS`) | Full 8-drug grid with par/max reference and inline-editable current-stock inputs; auto-generates a reorder list for anything at/below par. | `state.inv`, `state.cs`, `state.lastUpdated` | `state.inv`/`state.cs`/`state.lastUpdated` (on inline edit), view DOM |
| **Follow-ups View** (`renderFollowupsView()`) | Full follow-up queue with add/complete/defer/escalate actions and overdue/today/all filters — a fuller version of the state board's compact widget. | `state.followupList` | `state.followupList`, `state.followups` |
| **Interactions View** (`checkInteractions()`, `renderInteractionMatrix()`, `seedInteractionCheck()`) | Dedicated drug-drug interaction checker: a single structured-JSON Claude call grounded with best-effort OpenFDA label context per drug. See "Design Decisions" for why this is honest about not being a real interaction database. | `fetchDrugInfo()` results | `#interaction-results` DOM |
| **Reports View** (`renderReportsView()`, `generateAuditPackage()`) | Deterministic compliance view — shift summary, discrepancy log, and Form 106 drafts (reusing `TOOL_IMPL.generate_form106` directly) compiled straight from `state`, no live API call required. Exports via `window.print()`. | `state`, `getAppSettings()` | triggers the browser print dialog |
| **Settings View** (`getAppSettings()`, `saveAppSettings()`, `renderSettingsView()`) | Pharmacy/pharmacist/tech name, shift start time, API key management (incl. a live "Test Connection" call), and notification toggles — persisted to `localStorage` independently of shift state, so Reset Shift never wipes it. | `localStorage` | `localStorage`, `remi_api_key`, native window title |
| **Drug Tooltip Engine** (`fetchDrugInfo()`, `drugSpan()`, `wrapDrugNames()`, `showTooltipFor()`) | Wraps drug names app-wide in `.drug-ref` spans and shows a hover card with OpenFDA label data (class, route, boxed warning, interactions/dosing excerpts), 300ms delay, viewport-aware positioning. A `MutationObserver` on the reasoning panel retroactively wraps drug names Claude streams in. | OpenFDA `drug/label.json`, `drugInfoCache` | tooltip DOM, `drugInfoCache` |
| **Electron Shell** (`main.js`, `preload.js`) | Optional native window: native traffic lights on macOS (`titleBarStyle:'hiddenInset'`), frameless + custom controls elsewhere, a real application menu (whose accelerators do what in-page `keydown` listeners can't — see Design Decisions), and window-state persistence to a JSON file. | window bounds file, menu clicks | native window, sends `menu:action` IPC events |

## State Management

Everything lives in one global object, `state` (declared near the top of the `<script>` block). Selected fields:

| Field | Type | Meaning |
|---|---|---|
| `shiftMinutes` | number | Minutes elapsed since shift start (09:00). |
| `running`, `paused`, `speed` | bool, bool, number | Simulation clock controls. |
| `inv` / `invStart` | object | Current / starting standard-inventory counts (`met`, `ozm`, `lip`, `amx`). |
| `cs` / `csStart` | object | Current / starting controlled-substance counts (`oxy`, `hydro`, `add`, `xan`). |
| `oxyExpected` | number | What oxycodone's count *should* be — the only CS drug the scripted timeline ever introduces a real discrepancy for. See `expectedCount()`. |
| `oxyDiscrepancies` | array | `{ gap, at, n }` entries — oxycodone's discrepancy history, read by `trace_discrepancy` and `generate_form106`. |
| `csLog` | array | `{ drug, pt, qty, atMin, runningCount }` — full fill-by-fill ledger for every CS fill, read by `trace_discrepancy`. |
| `scripts`, `flags`, `rejects`, `followups` | number | Shift stat counters shown on the state board. |
| `diversionDetected` | bool | Set by the scripted diversion event; read by the cross-mode link and `conclusionColorFor()`. |
| `csFlags` / `csCritical` | object | Per-drug status (`due` / `ok` / `flag`) and critical flag, keyed by drug. |
| `fired` | Set | Dedupe key for the simulation loop so an event can't fire twice. |
| `followupList` | array | `{ name, reason, startMin, overdue, status? }` — the pharmacist follow-up queue, written by scripted seed data, `flag_pharmacist`, and the Follow-ups view's add/complete/defer/escalate actions. `status` (`'open'`\|`'completed'`\|`'escalated'`) is absent on older entries and treated as `'open'` rather than backfilled. |
| `lastUpdated` | object | `drugKey -> shiftMinutes` of last count change, read by the Inventory view's "Last Updated" column. |

`drugNames` and `invMax` are constant lookup tables alongside `state`, not part of it.

## Agentic Loop

This is the core of the "is it really agentic" answer. For every shift event that warrants a decision, the flow is:

1. **Event fires** (`handleEvent()` in `advanceMinute()`'s scripted timeline, or the shift-end timeout).
2. **Handler updates bookkeeping** (counts, stats, feed card), then calls `runAgentTurn({ icon, trigger, userPrompt })`. `userPrompt` embeds the event description plus a fresh `pharmacyStateSnapshot()` — deliberately a *summary*, not the full ledger, so Claude has a reason to call a tool rather than already having everything.
3. **`runAgentTurn()` loop** (capped at 5 turns): calls `streamClaudeTurn(messages, body)`.
   - `streamClaudeTurn()` opens a streamed `POST /v1/messages` request with the `tools` array attached, and parses the Server-Sent Event stream live: text deltas are written into the DOM token-by-token (so the reasoning panel visibly "types"), and `tool_use` blocks are reconstructed from incremental JSON fragments.
   - If Claude's turn includes one or more `tool_use` blocks: the preceding text (Claude's own "> ..." commentary) is left on screen, a `⚙ calling toolName({...})` line is rendered for each tool call, `TOOL_IMPL[name](input)` is executed against `state`, and the result is sent back as a `tool_result` message. The loop continues.
   - If Claude's turn has no tool calls: that text is its final conclusion. The intermediate streamed lines from *that* turn are removed and replaced with one styled `.r-conclusion` bubble (color picked by `conclusionColorFor()`); lines from earlier turns stay as the visible investigation trail.
4. **Loop ends** when Claude stops calling tools, the 5-turn cap is hit, or an error occurs — errors render directly in the panel rather than failing silently.

Every request, tool selection, tool result, and conclusion is also logged to the browser console as `[Remi] ...` so the decision flow can be inspected live in devtools.

## Tool Definitions

| Tool | Inputs | Reads | Writes | Side effects |
|---|---|---|---|---|
| `trace_discrepancy` | `{ drug }` | `state.csStart`, `state.cs`, `state.oxyDiscrepancies`, `state.csLog` | — | none (pure read) |
| `check_inventory` | `{ drug }` | `state.cs` or `state.inv`, `state.csFlags` | — | none (pure read) |
| `decode_reject` | `{ code, drug }` | `REJECT_CODES` lookup table | — | none (pure read) |
| `flag_pharmacist` | `{ reason, severity }` | — | `state.followupList`, `state.followups` | calls `renderStateBoard()` — the only tool with an immediately visible UI side effect |
| `generate_form106` | `{ drug }` | `state.oxyDiscrepancies` | — | none (pure read); returns a recommendation, not a decision |
| `add_followup` | `{ patientName, reason }` | — | `state.followupList` (via `push`), `state.followups` | routine queue item — calls `renderStateBoard()`; distinct from `flag_pharmacist`'s `unshift` escalation path |
| `generate_shift_report` | `{}` | `state.cs`, `state.inv`, `state.oxyDiscrepancies`, `state.followupList` | — | none (pure read); the whole-shift equivalent of calling `trace_discrepancy`/`check_inventory` per drug |

The `drug` parameter on every tool is constrained with a JSON Schema `enum` of `Object.keys(drugNames)` rather than a free string, so Claude can't pass a value `TOOL_IMPL` wouldn't recognize.

## Mode Switching

Tech Mode and Patient Mode are two sibling `<div>`s (`#tech-mode`, `#patient-mode`) toggled by CSS classes (`.swapped` / `.active`) on a single button click — there is no routing, no separate state per mode. Both read and write the same global `state` object, which is what makes the cross-mode alert possible: `checkCrossModeAndProceed()` (called during the Patient Mode pickup flow) checks `state.csFlags` and `state.diversionDetected`, fields that Tech Mode's agent loop set possibly minutes earlier and on a different visible screen.

## API Integration

Two independent call paths, both direct browser→Anthropic (no proxy):

- **Agentic path** (`runAgentTurn` → `streamClaudeTurn`): `stream: true`, `tools: TOOLS` attached, multi-turn, system prompt from `buildAgentSystemPrompt()`.
- **Command-bar path** (`askRemi`): single non-streamed call, no `tools`, system prompt from `buildSystemPrompt()`.

Both require headers `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true` — the last one is what permits calling the Messages API from a browser context at all. The key itself comes from `localStorage` (`remi_api_key`), set via the 🔑 API Key modal; a missing or rejected key reopens that modal automatically from either path.

## Desktop Shell (Electron)

`main.js` creates the native window and is the only place Node APIs are used. `preload.js` exposes a deliberately small `window.remiAPI` surface (`isElectron`, `platform`, `setTitle`, `minimizeWindow`/`maximizeWindow`/`closeWindow`, `onMenuAction`) via `contextBridge` — the renderer never gets raw `require` or `process`.

Every Electron-aware line in `index.html` is gated behind `if(window.remiAPI)` (see `initElectronIntegration()`), so the file keeps working unmodified when opened directly in a browser tab with no Electron underneath it.

- **Titlebar**: macOS uses `titleBarStyle:'hiddenInset'`, which keeps the real native traffic lights and lets the in-page `.topbar` (set to `-webkit-app-region:drag`, with every button/input opted back out via `no-drag`) act as the drag handle. Windows/Linux go fully frameless and render custom minimize/maximize/close buttons (`#win-controls`) wired to IPC.
- **Menu accelerators exist specifically because the renderer can't intercept them.** Cmd/Ctrl+N, +P, and +T are reserved by browsers/OS below the level of a page's `keydown` listener — routing them through `Menu` items in `main.js` and forwarding via `webContents.send('menu:action', ...)` is the only robust way to support them. Escape and Cmd/Ctrl+`,` aren't reserved, so those are plain `keydown` listeners in `index.html` and work identically with or without Electron.
- **Window state** is a plain JSON file in `app.getPath('userData')`, not a dependency like `electron-store` — persisting `{width, height, x, y}` doesn't justify pulling in a package.

## Design Decisions

- **Why two separate Claude call paths instead of one.** The command bar answers arbitrary free-form questions where low latency matters more than tool-grounded accuracy; the agentic loop investigates specific shift events where grounding in real tool data matters more than speed. Unifying them would force every quick question through a multi-turn tool loop, or strip tools from event investigation — both worse trade-offs than keeping the paths separate.
- **Why a lean state snapshot instead of dumping the full ledger into every prompt.** If `pharmacyStateSnapshot()` already contained the full transaction history, Claude would have no reason to call `trace_discrepancy()` — the tool would be decorative. Keeping the snapshot to summary counts and statuses is what makes tool use load-bearing rather than theater.
- **Why streaming instead of a single JSON response.** A non-streamed call would only let the reasoning panel render after the *entire* turn (including any tool call) completed, producing a frozen-then-dumped block of text. Streaming lets the panel show Claude "thinking" token by token, which is the actual point of the reasoning panel.
- **Why the conclusion color is inferred from keywords rather than a structured field.** Asking Claude to also emit a separate severity enum risks that field disagreeing with the free-text conclusion it wrote. Scanning the conclusion's own words for `CRITICAL`/`ESCALATE`/etc. guarantees the displayed color always matches what the tech actually reads.
- **Why the scripted timeline still decides *that* a diversion moment happens.** The "this is now a pattern" beat is a fixed dramatic point in the demo, not something extracted from raw events by Claude. What's real is everything downstream: Claude independently traces the history, decides whether to draft Form 106 language, and decides whether/how to escalate — see `handleDiversion()`'s comment for the exact boundary.
- **Why no backend.** Built for hackathon judging: anyone can open `index.html` directly with no install step. The cost is that the Anthropic API key lives in the browser's `localStorage` rather than behind a server — acceptable for a demo where each judge supplies their own key, not for a production deployment serving real patients.
- **Why Electron is additive, never required.** The hackathon's portability pitch ("judges can open `index.html` directly, no install step") and the desktop-software feel the sidebar/views are going for aren't actually in tension — `main.js` just loads the same `index.html` into a native window. Every Electron-only behavior is feature-detected (`if(window.remiAPI)`), so the plain-browser path never regresses.
- **Why the Interactions view is honest about what's real.** OpenFDA has no structured drug-drug interaction matrix endpoint. `checkInteractions()` pulls each drug's own FDA label `drug_interactions` text (often unrelated to the *other* drug in the pair) as grounding context, and the actual severity/mechanism/management synthesis is Claude's clinical-knowledge reasoning — the disclaimer rendered with every result says exactly that, rather than presenting it as a database lookup it isn't.
- **Why the Dispensing view never attributes a discrepancy's gap to a specific fill row.** A discrepancy means a count cycle found a gap with *no* transaction-level explanation (see `trace_discrepancy`'s description) — pretending a particular fill caused it would misrepresent the one fact that makes the diversion storyline work. `dispensingTimeline()` shows fills and count-cycle discrepancies as separate row kinds instead.
- **Why the EKG strip is still by default.** It originally scrolled continuously regardless of shift activity, which read as background noise rather than signal. It now renders one flat frame at rest and only animates for ~1.4s right after `pulseEkg()` fires from a real event — motion means something happened, instead of meaning nothing.
