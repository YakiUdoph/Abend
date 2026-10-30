# ABEND Build Plan

Status: **T001–T005 recorded PASS; T006 external release PARTIAL; T008 real-input local implementation and verification PASS, committed; push/deployment NOT STARTED**

The order is deliberate. A phase advances only when its acceptance criteria and evidence exist. File paths below are proposed and may be refined after Phase 1, but changes must preserve separation between evidence extraction and arithmetic.

## Phase 1 — Verify SDK and establish a real Mozaik runtime

**T001 status: UNIT/SDK INTEGRATION PASS (2026-10-30).** Pinned `@mozaik-ai/core` 4.0.6 was installed and its declarations/runtime bundle inspected. Tests verify initialize-once behavior, participant lifecycle delivery, real `runLoop` execution, native loop events, generated loop IDs, and shared `RuntimeState`. The inference runner is deterministic and local; provider and Mozaik Cloud integration remain NOT TESTED.

- **Objective:** initialize pinned `@mozaik-ai/core`, join one human and one agent, observe real lifecycle/events with a deterministic mock inference runner before using a paid provider.
- **Dependencies:** kickoff/brief recheck; Node/npm; package registry; exact SDK version; repository allowed to begin substantive work.
- **Files:** `package.json`, lockfile, `tsconfig.json`, `src/runtime/mozaik.ts`, `tests/runtime/smoke.test.ts`, later `README.md`.
- **Tests:** package/type import; initialize-once; join/send event; one loop completion/failure; observed event-name snapshot.
- **Acceptance:** installed types and observed behavior agree with the adapter; version is pinned; no stale assumed API remains.
- **Evidence:** lockfile, test output, sanitized raw event log, source/type references.

## Phase 2 — Prove two concurrent investigators

**T001 status: UNIT/SDK INTEGRATION PASS (2026-10-30).** Agreement and Payment are distinct Mozaik agents with distinct IDs and independent real `runLoop` calls. Controlled delayed inference proves overlapping native event windows and distinct SDK-generated loop IDs in both completion orders.

- **Objective:** start Agreement and Payment investigator loops from one run event without awaiting either.
- **Dependencies:** Phase 1 adapter and controllable mock runner.
- **Files:** `src/runtime/state.ts`, `src/agents/agreement.ts`, `src/agents/payment.ts`, `tests/runtime/concurrency.test.ts`.
- **Tests:** delayed loops in both completion orders; overlap assertion from real start/end events; separate loop IDs.
- **Acceptance:** both starts occur before either completion under a controlled test; neither is a renamed sequential step.
- **Evidence:** machine-checkable timestamps/event order and real loop IDs.

## Phase 3 — Prove meaningful event-driven collaboration

**T001 status: UNIT/SDK INTEGRATION PASS (2026-10-30).** Validated findings are published as semantic events with the originating agent ID. A non-LLM deterministic reconciliation participant consumes both event types, updates shared state idempotently, preserves citations, and emits `reconciliation.updated`. Tests cover both arrival orders and duplicates. This participant does not perform financial interpretation with an LLM.

- **Objective:** publish typed candidate events and have the Reconciliation Investigator combine/challenge findings through shared state.
- **Dependencies:** Phase 2 concurrency.
- **Files:** `src/agents/reconciliation.ts`, `src/runtime/events.ts`, `src/runtime/state.ts`, `tests/runtime/collaboration.test.ts`.
- **Tests:** consumes both producer IDs; reacts to arrival in either order; conflict event revises shared state; duplicate event is idempotent.
- **Acceptance:** a combined output causally depends on real outputs from both investigators and is not a fixed final-stage prompt.
- **Evidence:** event graph, shared-state revisions and assertions.

## Phase 4 — Implement text-based evidence ingestion

**T002 status: UNIT PASS / LIVE PROVIDER BLOCKED (2026-10-30).** General pasted/byte text ingestion now enforces fatal UTF-8 decoding, bounded source/packet sizes, empty-input rejection, CRLF/NFC normalization, stable content-addressed source/packet IDs, exact line spans, SHA-256 hashes, evidence types, canonical aliases, and explicit currencies. No OCR/PDF or persistence was added. A server transport remains NOT STARTED.

- **Objective:** convert pasted conversation and record text into immutable, bounded, numbered sources/spans.
- **Dependencies:** domain schemas; privacy limits.
- **Files:** `src/domain/source.ts`, `src/server/ingest.ts`, `src/security/content.ts`, `tests/ingestion/*.test.ts`.
- **Tests:** valid text, irrelevant messages, Unicode/line endings, empty/malformed/oversized input, stable hashes, injection text retained as data.
- **Acceptance:** identical normalized input yields stable spans; invalid input is rejected without partial findings.
- **Evidence:** fixtures, hashes and executed tests.

## Phase 5 — Implement structured agreement and payment extraction

- **Objective:** agents emit schema-valid candidates with participants, statuses and real citations.
- **T002/T002B status:** UNIT/SDK INTEGRATION PASS. **T002C/T002D live provider status:** BLOCKED (2026-10-30). Agreement and Payment use role-specific Mozaik structured-output schemas, no tools, and runtime validation. The bundled native `gemini-3.5-flash` endpoint is officially Free Tier eligible and the live command is hard-gated on the key plus billing-disabled confirmation. The final, single T002D recovery run reached Gemini: both investigators returned retryable HTTP 503 `UNAVAILABLE`, not rate-limit, authentication, billing, missing-model, or schema-rejection responses. Their genuine Mozaik windows overlapped by 3,401 ms and used distinct loop IDs, but no model output, validated finding, or reconciliation event existed. Per the stop rule, no more provider requests or debugging are authorized; the deterministic runner remains the build fallback.
- **Dependencies:** Phases 3–4; provider or deterministic fixture runner; strict schemas.
- **Files:** `src/domain/findings.ts`, agent tools/prompts, `src/validation/findings.ts`, `tests/extraction/*.test.ts`.
- **Tests:** equal split, unequal split, partial repayment, ambiguous recipient, conflicting claim, unverified screenshot, irrelevant text, prompt injection, invented citation rejection, model/API failure.
- **Acceptance:** no candidate enters shared state without valid source spans; payment initiation is not upgraded to receipt.
- **Evidence:** redacted structured outputs, validation failures and executed tests.

## Phase 6 — Implement deterministic reconciliation

**T003 status: UNIT/SDK INTEGRATION PASS (2026-10-30).** The evidence-validated deterministic ledger now models participants, expenses, agreements, obligations, payment claims/applications, unresolved disputes, decisions, effects, balances and results. It uses `bigint` integer minor units, deterministic equal-split remainders, explicit currency exponents, separate ledgers, confirmation plus obligation-link rules, duplicate suppression, overpayment caps and auditable review decisions. The existing Mozaik reconciliation reactor consumes both investigator event streams through this engine. Acceptance cases A, C, F, H and K pass; B, D, E, G and I–Q are not all complete as end-to-end acceptance cases.

- **Objective:** calculate obligations, repayments, duplicates and net suggestions in integer minor units per currency.
- **Dependencies:** validated records and a written rounding policy.
- **Files:** `src/domain/money.ts`, `src/domain/shares.ts`, `src/domain/matching.ts`, `src/domain/reconcile.ts`, `tests/domain/*.test.ts`.
- **Tests:** correct equal split; documented unequal split; partial repayment; duplicate receipt; ambiguous recipient; missing agreement; multiple currencies; rounding; overflow/invalid precision; property tests for conservation.
- **Acceptance:** totals conserve money, no float arithmetic exists, unsupported taxi-like expense is excluded, and currencies never mix implicitly.
- **Evidence:** executed unit/property tests and calculation breakdowns.

## Phase 7 — Implement citations and uncertainty handling

**T004 status: UNIT/SDK INTEGRATION PASS (2026-10-30).** One validated ledger input now produces immutable `FROM_EVIDENCE` and recomputed `AFTER_CONFIRMATIONS` projections. UI-ready amount terms carry integer amount/currency, participant roles, inclusion status, a reason, resolvable citations, balance effects and relevant decision references. Statuses distinguish `CONFIRMED`, `UNCONFIRMED`, `DISPUTED`, `EXCLUDED` and `UNRESOLVED`. Every displayed balance is checked against its included term effects. Acceptance cases G, I and Q pass in focused deterministic tests; this is not a completed browser flow or successful live-model extraction.

- **Objective:** generate explanation graphs and documented/confirmed projections with status-safe language.
- **Dependencies:** Phases 4–6.
- **Files:** `src/domain/explain.ts`, `src/domain/projection.ts`, `tests/domain/evidence.test.ts`.
- **Tests:** every balance term resolves to evidence/decision; conflicting and unresolved items excluded; no fabricated finding survives; screenshot wording remains qualified.
- **Acceptance:** deleting any cited source invalidates dependent findings; every displayed total expands to its terms.
- **Evidence:** graph snapshots plus validation tests.

## Phase 8 — Implement human review and recalculation

**Current status: PARTIAL.** T003/T004 implement and test validated in-session decisions, deterministic recomputation, decision provenance and reversal without mutating evidence. T005 adds working local API/browser review actions. Persistent storage, authenticated actors and stale-version handling across persisted sessions remain NOT STARTED.

- **Objective:** accept auditable corrections/confirmations and recompute without mutating source evidence.
- **Dependencies:** versioned findings and deterministic engine.
- **Files:** `src/domain/review.ts`, `src/server/review.ts`, runtime human participant, `tests/review/*.test.ts`.
- **Tests:** correction changes result; reversal restores prior projection; stale decision rejected; concurrency/idempotency; missing agreement confirmation.
- **Acceptance:** decision actor/time/reason and before/after result are recorded; arithmetic is rerun deterministically.
- **Evidence:** decision event and result diff.

## Phase 9 — Build the premium frontend

**T005 status: LOCAL BROWSER PASS (2026-10-30).** A framework-free TypeScript client and local Node API implement the documented fictional journey over the existing ingestion, Mozaik runtime, reconciliation, review and projection contracts. Chrome executed the actual evidence → investigation → findings → review → recalculation → citation → verification path. The interface distinguishes demonstration mode from blocked live inference, accepts no private/arbitrary input, renders authentic runtime metadata, and provides responsive/accessible empty, loading, error and partial-result behavior. Production deployment remains NOT STARTED.

- **Objective:** implement the journey and verification view in `DESIGN.md`.
- **Dependencies:** stable APIs from Phases 4–8.
- **Files:** chosen app routes/components/styles, accessibility and browser tests.
- **Tests:** keyboard/screen-reader semantics, responsive layouts, statuses not color-only, honest failure/partial states, no fake trace/progress, evidence navigation.
- **Acceptance:** fixture completes the seven-step journey on mobile and desktop; all displayed events come from persisted run data.
- **Evidence:** executed Chrome journey, fresh ignored screenshot, accessibility assertions and authentic runtime IDs/timestamps recorded in `PROGRESS.md`.

## Phase 10 — Test adversarial and failure cases

**T006 status: PARTIAL PASS (2026-10-30).** Cases A and C–Q have focused automated coverage and the complete suite passes from an isolated clean checkout. Case B remains unsupported because the current validated agreement contract only permits documented equal splits; the release does not infer or simulate unequal terms. The primary fictional browser journey, concurrency proof, security scan and accessibility smoke checks pass.

- **Objective:** execute the complete acceptance matrix and fix unsafe failure behavior.
- **Dependencies:** integrated application.
- **Files:** `tests/acceptance/*.test.ts`, fictional fixtures, test configuration.
- **Tests:** A–Q matrix below plus authorization, XSS, duplicate events, timeout and retry.
- **Acceptance:** required tests pass from a clean checkout; failures are retained honestly; no fixture-specific logic.
- **Evidence:** timestamped CI/local reports with commit SHA.

## Phase 11 — Deploy and record the authentic demonstration

**T006 status: PREPARED / NOT DEPLOYED (2026-10-30).** A production build, `/health` route and free Render blueprint are present. Render fits the single-process in-memory demonstration while active, but free-service restarts discard sessions. No authenticated Render CLI/API session is available, so no production URL or public-host smoke result is claimed.

- **Objective:** deploy the working app and capture the genuine fixture flow and runtime evidence.
- **Dependencies:** Phase 10; safe hosting; secrets; privacy/redaction; organizer rules recheck.
- **Files:** deployment config, `README.md`, sanitized demo assets only if needed.
- **Tests:** production smoke, clean-session run, deep links, redaction, runtime duration.
- **Acceptance:** judges can access/run it; demo results are produced live through normal logic; trace IDs correspond to the recorded run.
- **Evidence:** deployment URL, commit SHA, run/trace export and recording.

## Phase 12 — Audit submission requirements and submit

**T006 status: PARTIAL / NOT SUBMITTED (2026-10-30).** `YakiUdoph/Abend` is public, the verified release commit is published, and local `origin` matches it. Public rules and the Freestyle brief were rechecked. The authenticated organizer dashboard, private announcements and submission form are unavailable in this environment; no receipt is claimed.

- **Objective:** complete Freestyle submission before the current 20:00 CET deadline.
- **Dependencies:** account/registration; public repo; final official dashboard/Discord/email check.
- **Files:** final `README.md`, repository settings and submission form (external).
- **Tests:** clean clone/install/run; link permissions; required fields; concurrency explanation; secret/license scan.
- **Acceptance:** receipt/confirmation from the real submission system; submitted commit is accessible and reproducible.
- **Evidence:** submission confirmation and final SHA. Never fabricate either.

## T008 — Mozaik-first real-input product

**Local implementation status: PASS (2026-10-30). External release status: NOT STARTED.**

- The normal browser path starts empty and accepts bounded participants, currency, expenses, payer, exact shares, repayments/statuses, and optional conversation evidence.
- Agreement and Payment receive the submitted immutable packet through distinct real Mozaik loops; runtime events and shared state drive deterministic reconciliation.
- Exact unequal shares are validated to sum to the expense and now satisfy acceptance case B.
- Per-run capability tokens protect review mutations; request limits and investigation rate limits are enforced.
- Three non-fixture scenarios cover unequal USD shares, pending EUR repayment review, and duplicate GBP repayments.
- `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run proof`, `npm.cmd run test:browser`, and `git diff --check` pass in the working tree. The recorded automated count is 53 passed, 0 failed.
- This T008 commit records the verified implementation; the final report uses `git rev-parse HEAD` for its immutable identifier. Push, Render deployment, public smoke test, and hackathon submission were not yet performed. T008 explicitly forbids submission at this stage.

## Required acceptance matrix

T008 superseding status: **A–Q PASS in focused automated coverage; B now passes for exact unequal shares. These are not seventeen browser journeys.**

Release status: **A and C–Q PASS in focused automated coverage; B NOT IMPLEMENTED; the matrix is not represented as seventeen browser journeys.**

| ID | Case | Arithmetic assertion | Evidence/safety assertion |
| --- | --- | --- | --- |
| A | Documented equal split | exact conserved shares | agreement citation required |
| B | Documented unequal split | exact shares correct and conserved | structured split terms cited |
| C | Partial repayment | only eligible amount reduces obligation | sender, recipient and status supported |
| D | Duplicate receipt | no silent double count | duplicate rationale/correction visible |
| E | Ambiguous repayment recipient | not applied | unresolved with candidate citations |
| F | Missing sharing agreement | expense excluded | missing agreement explained |
| G | Conflicting payment claims | conservative projection unchanged | both claims shown as conflicting |
| H | Unverified payment screenshot | initiated claim not received payment | certainty wording enforced |
| I | Human correction | recomputed result correct | decision audit trail present |
| J | Irrelevant messages | totals unchanged | irrelevant spans yield no finding |
| K | Multiple currencies | separate balances | no implicit FX |
| L | Missing/malformed input | no calculation | actionable validation error |
| M | Model/API failure | prior deterministic state intact | failed/partial state honest and retryable |
| N | Concurrent execution | not applicable | real loop overlap and distinct IDs |
| O | Cross-agent collaboration | combined record consistent | consumes real events from both agents |
| P | Prompt injection | totals unaffected by directive | content treated as data; no tool escalation |
| Q | No fabricated findings | every included term valid | unknown source/citation rejected |

## Exact next implementation task

**T006 continuation — authenticated external release steps.** Deploy the committed Render blueprint from the public repository, run a public clean-session smoke test, and submit through the authenticated organizer dashboard. Record the real deployment URL and submission receipt only after those external steps succeed. Case B remains an explicit product limitation unless the validated domain contract is deliberately expanded and tested.

