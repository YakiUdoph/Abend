# ABEND Product Requirements Document

Status: **ORIGINAL PRODUCT VISION PLUS VERIFIED SHIPPED SCOPE**
Prepared: 2026-10-30 (Atlantic/Cape_Verde)  
Competition track: **VERIFIED — Freestyle**

This document preserves the original proposal as historical context. Sections labeled “original” describe the build target written before implementation; the current release table below is authoritative for what shipped.

## Product definition

**Abend** is an evidence-based shared-expense and repayment reconciliation application.

**Tagline:** “Settle the numbers. Keep the friendship.”

**One sentence:** Abend helps people work out who owes whom by examining conversations, receipts, and repayment records, then showing the calculation and supporting evidence.

The former AMEND contract-change concept is retired. It must not influence implementation.

## Current release scope

| Scope | Current status |
| --- | --- |
| Empty-by-default structured participant, currency, expense, exact-share, and repayment entry | **SHIPPED / VERIFIED** |
| Optional bounded conversation excerpt preserved as evidence | **SHIPPED / VERIFIED**; not interpreted as arbitrary natural language |
| Immutable source spans, hashes, citations, and finding validation | **SHIPPED / VERIFIED** |
| Concurrent Agreement and Payment Mozaik investigators with shared-state reconciliation | **SHIPPED / VERIFIED** |
| Deterministic per-currency balances and evidence-only/after-confirmation projections | **SHIPPED / VERIFIED** |
| Payment linking, confirmation, rejection, reversal, and audited decisions | **SHIPPED / VERIFIED** |
| Friendly editable summary and authentic runtime verification view | **SHIPPED / VERIFIED** |
| Free-form conversation/receipt extraction through an external model | **BLOCKED / NOT AVAILABLE** |
| OCR, PDF/image extraction, and text-file upload | **DEFERRED / NOT AVAILABLE** |
| Durable storage, accounts, authenticated identity, and cross-device recovery | **DEFERRED / NOT AVAILABLE** |
| Bank connection, bank settlement verification, payment initiation, debt collection, and automatic messaging | **EXCLUDED** |

## Shipped user journeys

1. **Create a record:** enter participants, one explicit currency, at least one expense, its payer, and exact shares.
2. **Add repayment evidence:** optionally enter repayment claims and a bounded supporting excerpt.
3. **Investigate:** submit the immutable packet to distinct concurrent Agreement and Payment investigators.
4. **Review:** inspect validated findings, citations, unresolved claims, and both projections.
5. **Decide:** link and confirm a repayment, reject it, or reverse an earlier decision.
6. **Settle:** inspect recomputed balances and copy an editable respectful summary.
7. **Verify:** open the secondary technical view for authentic sanitized runtime events and loop identities.

## Problem and product hypothesis

Friends, roommates, travel groups, and informal teams can agree on an expense in a conversation, keep proof elsewhere, make partial repayments, and later remember the arrangement differently. A mathematically valid ledger can still be wrong if its assumptions are unsupported.

**PROPOSED differentiation:** reconstruct a disputed balance from evidence that already exists, instead of requiring a complete shared ledger to have been maintained in advance.

This is a hypothesis, not a claim of global originality. Official product pages show that existing products already cover important adjacent capabilities:

| Product | Officially documented capabilities | Boundary relevant to Abend |
| --- | --- | --- |
| Splitwise | Group balances, recorded repayments, equal/exact/percentage/share/itemized splits, receipt scanning, itemization, transaction import and currency conversion | Strong ledger and receipt workflow; no claim is made about undocumented retrospective dispute investigation |
| tricount | Shared transaction list, custom splits, transfers, repayment requests, receipt photos, multi-currency and suggested repayments | Strong collaborative ledger; product copy assumes expenses are added to a tricount |
| Settle Up | Group expense/IOU tracking, complex splits, income, receipt photos, currencies, exchange rates and debt minimization | Strong ledger and settlement optimizer; no unsupported claim is made about conversation reconstruction |
| Expensify | SmartScan extracts receipt data, matches applicable card transactions, supports reports, chat and review/audit workflows | Strong expense-management and receipt-verification features, primarily oriented toward individual/business expense operations |
| Chat-first tools (for example Wisspy, Snap-Expenses, HippoSplit and SplitPop) | Natural-language or messaging-based entry, receipt parsing, review and deterministic/backend calculations are variously documented | Confirms that chat/AI entry is not unique; Abend must demonstrate retrospective, multi-source, evidence-cited reconciliation |

Research sources and retrieval date are maintained in `RULES.md`.

## Target users and jobs

- A trip organizer resolving an incomplete group balance.
- Roommates checking whether a shared bill and later transfer were counted correctly.
- Friends clarifying an unequal or conditional split recorded only in messages.
- An informal team reviewing expenses without granting bank or inbox access.

Core job: “Given this bounded packet of evidence, show the balances it supports, the assumptions it does not support, and what the group needs to clarify.”

## Original proposed MVP scope

The pre-build MVP proposal required the following. Items not listed as shipped above remain historical goals rather than current capabilities:

1. Accept pasted conversation text and text-based expense/repayment records.
2. Accept file upload for text; image/PDF extraction is a secondary stretch goal.
3. Identify participants and preserve stable aliases.
4. Extract claimed expenses without treating claims as truth.
5. Extract documented sharing agreements, including participant scope and split method.
6. Extract repayment evidence and distinguish initiation from receipt/confirmation.
7. Match repayments to obligations with an explainable confidence/status.
8. detect duplicates, contradictions, irrelevant content and prompt injection attempts.
9. Calculate supported balances deterministically per currency.
10. Separate documented, confirmed, conflicting and unresolved information.
11. Let a person confirm, correct or reject material facts.
12. Recalculate from the revised structured record, not by asking an LLM to redo arithmetic.
13. Draft a respectful settlement or clarification message.
14. Expose authentic Mozaik runtime evidence in a secondary verification view.

The MVP must not include bank connections, payment initiation, debt collection, unrestricted message scanning, automatic accusation, or silent currency conversion.

## Original proposed user journey

1. **Add the conversation.** Paste bounded text; explain that uploaded content is untrusted evidence.
2. **Add payment records.** Paste transaction descriptions or add structured records.
3. **Work it out.** Start the concurrent investigation.
4. **Review what Abend found.** Inspect claims, evidence excerpts and uncertainties.
5. **Confirm anything unclear.** Correct participants, agreements, duplicates and payment status.
6. **See supported balances.** Keep separate balances for documented-only and user-confirmed states.
7. **Draft a friendly message.** Generate a non-accusatory summary with unresolved questions.

## Evidence model

Every material finding must cite one or more immutable source spans. A source span contains `sourceId`, source type, location/line range, a short excerpt or content hash, and participant attribution when known.

Allowed finding statuses:

- `DOCUMENTED_CLAIM`: asserted by supplied material but not independently validated.
- `USER_CONFIRMED`: explicitly accepted or corrected during review.
- `INDEPENDENTLY_VERIFIED`: supported by an authorized external verification source; not expected in the text-first MVP unless a real verifier is added.
- `CONFLICTING`: incompatible evidence exists.
- `UNRESOLVED`: evidence is insufficient or ambiguous.

The UI may say “transfer screenshot says sent,” but may not say “payment received” without recipient confirmation or an authorized independent verification. `INDEPENDENTLY_VERIFIED` must never be inferred from an LLM’s confidence.

## Deterministic financial rules

- Store amounts as signed integer minor units plus ISO 4217 currency code and recorded currency exponent.
- Never use binary floating-point values for balances.
- Validate that allocated shares sum exactly to the expense amount; use a documented remainder rule when indivisible minor units occur.
- Do not create an obligation without a supported agreement or an explicit user confirmation.
- Keep ledgers separate by currency. Convert only with a user-approved rate carrying source, timestamp, base, quote and rounding policy.
- Apply repayments only once and only to compatible participant/currency obligations.
- Preserve both gross obligations and net settlement suggestions so simplification never hides provenance.
- A duplicate candidate is excluded only after deterministic identity/rule evidence or human confirmation; otherwise it remains unresolved.

## Primary fictional fixture

The test fixture is visibly labeled **FICTIONAL TEST DATA** and contains Alex, Bea and Chen:

- A conversation documents that a EUR 300 accommodation charge paid by Alex is shared equally by all three.
- Evidence claims Bea made a EUR 40 partial repayment to Alex; its status must reflect exactly what the fixture proves.
- A EUR 36 taxi charge paid by Chen appears, but no sharing agreement is documented.

Expected behavior is derived by the engine, never hardcoded:

- The accommodation produces EUR 100 shares: Bea and Chen each owe Alex EUR 100 before repayments.
- If the fixture supports or the user confirms Bea-to-Alex receipt, Bea’s outstanding accommodation obligation becomes EUR 60; otherwise the EUR 40 remains unresolved and both views are shown.
- The taxi is excluded from confirmed obligations until an agreement is documented or confirmed.
- The explanation cites source spans and asks a polite taxi/repayment clarification.

## Verified success and acceptance

The release acceptance requirements were:

- The text-first flow works end to end on the fictional fixture.
- Two investigators genuinely overlap in execution on Mozaik and a third investigator reacts to their published evidence.
- A reproducible trace shows participant identities, distinct loop IDs, timestamps, typed collaboration events and shared-state effects.
- Every included financial term has evidence or explicit confirmation.
- Arithmetic tests cover equal/unequal splits, partial repayment, duplicates and currencies.
- Adversarial tests cover prompt injection and fabricated findings.
- Model/API failure leaves source data intact and produces a recoverable, honest state.
- A user correction causes deterministic recalculation.
- The repository instructions let a judge run and inspect the project.

## Non-goals and claims policy

- Abend is not a payment processor, bank-data verifier, legal adjudicator, fraud detector or debt collector.
- A supported balance is not a legal conclusion.
- No claim of uniqueness, market leadership, successful build, passing tests or production readiness is permitted without evidence.
- Preparation documents do not satisfy product acceptance.

