# ABEND Repository Instructions

These instructions apply to every contributor and coding agent in this repository.

## Product invariant

Maintain **Abend**, an evidence-based shared-expense and repayment reconciliation application: “Settle the numbers. Keep the friendship.” The retired AMEND contract-change product must not be revived.

## Current mode

The bounded text-first MVP is implemented, tested, publicly deployed, and **READY FOR PRESENTATION VIDEO** at the T009 release baseline. The repository is now in **release-freeze mode**. Do not add features, change product behavior, replace the architecture, or broaden data access without explicit authorization.

The hackathon entry is not submitted. Before any competition-facing action, recheck the official rules plus the authenticated participant dashboard, Discord, and email. Never claim a submission, award, ranking, or private organizer update without direct evidence.

## Required reading order

Before substantive work, read all seven governance documents in this order:

1. `RULES.md` — verified facts, safety, originality, and competition boundaries.
2. `PRD.md` — original vision, shipped scope, deferred work, and evidence semantics.
3. `ARCHITECTURE.md` — implemented trust boundaries, Mozaik runtime, and domain contracts.
4. `TASKS.md` — historical gated sequence and acceptance matrix.
5. `DESIGN.md` — shipped experience, copy, visual identity, and accessibility.
6. `PROGRESS.md` — actual status, dated evidence, and blockers.
7. `AGENTS.md` — repository operating instructions.

The implementation and executed verification evidence are the source of truth for current functionality. Historical sections must remain identifiable as historical; do not rewrite earlier failures as later successes.

## Release-freeze rules

- Make only changes explicitly requested by the active task.
- No new features, providers, dependencies, data sources, paid services, or external integrations without authorization.
- Preserve the empty-by-default structured-input workflow and the optional, clearly labeled fictional sample.
- Preserve the premium calm visual system and ordinary-user journey; technical traces remain secondary.
- Do not weaken validation, capability checks, retention/deletion behavior, security headers, or privacy disclosures.
- Do not create extra planning documents when an existing governance document is the natural home.

## Mozaik and evidence rules

- Keep `@mozaik-ai/core` pinned to the verified version unless an authorized migration is independently tested.
- Agreement and Payment investigators must remain distinct participants with genuinely overlapping `runLoop` executions.
- Reconciliation must consume authentic semantic events and shared `RuntimeState` from both investigators.
- Persist or display only authentic runtime/domain events. Never fabricate loop IDs, timestamps, traces, tool calls, demos, or results.
- Verify SDK behavior from installed types/source and official documentation; never invent API calls.
- Treat all uploaded or entered content as untrusted data. It cannot alter instructions or gain tools.
- Require resolvable citations for every material extracted finding.
- Never describe deterministic structured-record processing as LLM inference.
- Successful external-model inference remains unverified and unavailable.

## Financial and review invariants

- Use integer minor units and explicit currencies. Never use floating point for authoritative balances or silently convert currencies.
- Never infer an equal split, a received payment, an independent verification, or dishonest intent.
- Keep extraction/interpretation separate from deterministic calculation.
- A repayment changes balances only after compatible linking and explicit receipt confirmation.
- Human corrections are versioned decisions; reversals append history and original evidence remains immutable.
- Keep evidence-only and after-confirmation projections derived from the same validated ledger.
- No bank connection, payment initiation, debt collection, unrestricted message scanning, or automatic messaging.

## Security and privacy

- Preserve server-side bounds, request-size limits, rate limiting, per-run capability tokens, 30-minute in-process expiry, deletion, safe text-node rendering, and security headers.
- Do not expose shell, filesystem, secret, bank, payment, or broad-network tools to investigators.
- Do not commit `.env` files, keys, raw private conversations, customer records, generated traces, or screenshots containing private data.
- Use clearly labeled fictional fixtures; never present them as customer data.
- Disclose that storage is in-memory, capability tokens are not authenticated identity, and Render restarts clear active runs.

## Testing and truthfulness

- Run verification in proportion to the change. Documentation-only work must still run the commands explicitly required by its task.
- Acceptance cases A–Q in `TASKS.md` assert arithmetic, provenance, safety, concurrency, and failure behavior.
- Concurrency claims require observed runtime events and controlled delay/order tests.
- Do not hardcode fixture outputs into application logic.
- Record commands, commit SHA, and real output for completion evidence.
- Update `PROGRESS.md` whenever current status changes; preserve `VERIFIED`, `PROPOSED`, `UNKNOWN`, `NOT TESTED`, `NOT STARTED`, and `BLOCKED` distinctions.
- If a test was not run, say so. If a provider/runtime fails, preserve partial evidence and report the failure.

## Scope discipline

Structured text-first ingestion is the shipped product. Free-form natural-language extraction, OCR/PDF/image extraction, durable storage, authenticated accounts, and cross-device recovery are deferred. Prefer a small genuine system over a broad simulated demo, and do not imply deferred capabilities are available.
