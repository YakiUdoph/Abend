# Abend

**Settle the numbers. Keep the friendship.**

Abend is an evidence-based shared-expense and repayment reconciliation application. It helps friends, roommates and trip groups reconstruct a disputed balance from supplied conversations and payment records, while keeping unsupported assumptions out of the total.

This repository includes a complete local **fictional demonstration**. It does not accept private data, connect to banks, initiate payments or claim successful live-model extraction.

## The problem

A mathematically correct ledger can still be wrong when its assumptions are unsupported. An expense may appear in a conversation without an agreement to share it. A transfer record may say `initiated` without proving receipt. Abend keeps those distinctions visible, cites the relevant source spans and lets a reviewer make explicit, reversible decisions.

## What the demonstration does

The bundled `FICTIONAL TEST DATA` follows Alex, Bea and Chen:

1. Open and inspect the immutable conversation and payment-record spans.
2. Start two genuine Mozaik investigator loops with one action.
3. Review the documented accommodation agreement, initiated EUR 40 transfer and unsupported EUR 36 taxi.
4. Compare the conservative **From the evidence** projection with **After confirmations**.
5. Link the ambiguous transfer to the accommodation and separately confirm receipt.
6. Observe the deterministic recalculation: Bea changes from EUR 100 to EUR 60 outstanding; Chen remains at EUR 100; the taxi stays excluded.
7. Open exact evidence citations, inspect decision history, edit a friendly message and view sanitized authentic runtime events.

The browser never calculates balances independently or hardcodes the expected result. It renders projections returned by the existing deterministic domain engine.

## Why two concurrent agents matter

Agreement and Payment investigators examine the same immutable packet independently and at the same time. The Agreement investigator identifies supported sharing terms; the Payment investigator preserves the transfer's actual evidence status. Their validated findings enter shared runtime state as semantic events. A deterministic reconciliation participant reacts to both streams, revises the combined record as findings arrive and publishes reconciliation updates.

This separation prevents a single extraction step from quietly turning “sent” into “received” or inventing a split. The verification view exposes the actual participant IDs, SDK-generated loop IDs, timestamps, overlap window and shared-state events produced by each run.

## Architecture

```text
Browser (semantic HTML + compiled TypeScript client)
  -> local Node HTTP API
     -> immutable fictional EvidencePacket
     -> Mozaik Agreement loop -----\
     -> Mozaik Payment loop --------+-> validated events/shared state
     -> deterministic reconciler --/
     -> human review events
     -> bigint reconciliation + dual projections
  <- findings, citations, decisions, balances and sanitized runtime events
```

- `src/server/app.ts` serves the local interface and bounded demonstration API.
- `src/runtime/investigation.ts` owns Mozaik participants, loops, shared state and review events.
- `src/domain/reconciliation.ts` performs authoritative integer-minor-unit calculations.
- `src/domain/projections.ts` builds the two explanation-rich financial views from one evidence/decision history.
- `src/web/client.ts` renders server results and sends validated review actions; it contains no financial ledger.

## Install and run

Requirements: Node.js 20–24, npm and a current Chromium browser for the browser test. The recorded T006 run used Node.js 24.18.0 and Chrome 156.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Open the printed `ABEND_SERVER_URL` (normally `http://127.0.0.1:4173`), select **Open the fictional demonstration**, then select **Work it out**. No provider key is needed or used.

To reproduce the command-line concurrency/reconciliation proof:

```powershell
npm.cmd run proof
```

To execute the real headless-browser journey using an installed Chrome or Edge:

```powershell
npm.cmd run test:browser
```

If Chromium is installed outside the standard location, set `CHROME_PATH` for that command. Browser screenshots are written to ignored `.artifacts/` output.

## Genuine implementation status

Implemented and exercised:

- Bounded UTF-8 ingestion, stable hashes/IDs/spans, aliases, evidence types and explicit currencies.
- Pinned `@mozaik-ai/core` 4.0.6 with two distinct, genuinely overlapping investigator loops.
- Strict structured-output validation and citation resolution before findings reach shared state.
- Event-driven cross-agent reconciliation with order-independent and duplicate-safe behavior.
- Deterministic `bigint` obligations, confirmation-gated repayments, duplicate handling, overpayment caps and currency-separated balances.
- Immutable reviewer decisions, contradiction checks, reversal and deterministic recomputation.
- `FROM_EVIDENCE` and `AFTER_CONFIRMATIONS` projections with amount-level explanations and provenance.
- Responsive, keyboard-operable local interface with visible statuses, source navigation, empty/loading/error/partial-result handling, reduced-motion support and an authentic verification view.
- API integration tests and a Chrome browser journey through evidence, investigation, review, recalculation, citations and the authentic verification timeline.

## Execution-mode honesty

**Demonstration mode is available.** It uses clearly labeled fictional evidence and the deterministic Mozaik inference runner. The output still travels through normal ingestion, validation, shared state, reconciliation and review paths.

**Live investigation is unavailable.** The controlled Gemini attempts reached the provider but returned HTTP 500/503 before producing model output. Therefore no successful provider-backed extraction or validated live finding has been demonstrated. The interface does not accept arbitrary or private conversations and does not present live inference as working.

## Security and privacy boundaries

- `.env`, `.env.local`, generated output and browser artifacts are ignored by Git.
- Evidence is rendered through DOM text nodes under a strict same-origin Content Security Policy.
- Investigators have no filesystem, shell, payment, secret or broad network tools.
- Review requests are bounded and domain validation rejects unsupported or contradictory decisions.
- The local demo stores runs only in server memory. There is no persistence, authorization, retention/deletion service or authenticated reviewer identity.
- This is a reconciliation aid, not a bank verifier, legal conclusion, fraud detector or debt-collection system.

## Reconciliation guarantees

- Every material finding and displayed balance term resolves to immutable evidence or a relevant reviewer decision.
- Amounts use integer minor units with explicit currencies and exponents; binary floating point is not used for balances.
- An initiated or claimed transfer remains unapplied until receipt and obligation linkage satisfy policy.
- An expense without a supported sharing agreement stays visible but excluded.
- Currencies remain separate; there is no implicit FX conversion.
- Original evidence remains immutable when review decisions are appended or reversed.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run proof
npm.cmd run test:browser
git diff --check
```

See `PROGRESS.md` for the latest executed counts, authentic loop evidence and limitations.

## Public release and hosting

The public repository is [YakiUdoph/Abend](https://github.com/YakiUdoph/Abend). The repository is the canonical source for the fictional demonstration and its reproducibility evidence.

`render.yaml` describes a free Render web service with the production build, start command and `/health` check. Abend deliberately keeps each demonstration run in one server process; on Render's free service, a cold start or service restart clears those in-memory runs. A fresh demonstration can then be started normally. No hosting account or payment method is required by the application itself, and no secrets are required for demonstration mode.

The blueprint has been prepared and locally verified, but a production URL is not claimed until an authenticated Render deployment and public smoke test succeed.

## Submission summary

**Project:** Abend — Settle the numbers. Keep the friendship.

**Track:** Freestyle

**Description:** Abend is an evidence-based shared-expense and repayment reconciliation application. Two concurrent Mozaik investigators independently inspect a fictional conversation and payment record, publish citation-backed findings into shared state, and trigger deterministic integer-minor-unit reconciliation. A reviewer can resolve ambiguity through auditable decisions and compare the evidence-only result with the recomputed result after confirmations.

**Why the agents are genuinely concurrent:** one action launches separate Agreement and Payment `runLoop` calls without awaiting either. Tests and the browser verification view use native runtime events to require distinct SDK-generated loop IDs and overlapping start/completion windows. Reconciliation consumes semantic findings from both producers through shared state; it does not substitute a renamed sequential step or hardcoded final answer.

## Not yet available

- Successful live Gemini extraction.
- Arbitrary customer-data ingestion in the browser.
- Unequal, ratio or itemized split extraction.
- Persistent/auditable server storage, authenticated users and retention/deletion controls.
- OCR/PDF ingestion, banking, payment initiation, automatic sending or FX conversion.
- Production deployment and submission verification.
- Documented unequal, ratio or itemized splits (acceptance case B). Cases A and C–Q have focused automated coverage; the browser journey covers the core deterministic and concurrency path rather than every fixture.
