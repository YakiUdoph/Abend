# Abend

**Settle the numbers. Keep the friendship.**

Abend is an evidence-based shared-expense and repayment reconciliation application. It processes new structured records while keeping unsupported assumptions outside the balance.

## Working product

The local workspace starts empty. A user can add, edit, or remove:

- participant names and one explicit currency per investigation;
- shared expenses, payer, and exact per-participant shares;
- repayments with sender, recipient, purpose, amount, and claimed status;
- a bounded supporting conversation excerpt.

An optional **Load fictional sample** control is clearly labeled. No sample values are silently injected.

Selecting **Investigate records** creates immutable evidence spans and launches distinct Agreement and Payment investigators through genuine `@mozaik-ai/core` `runLoop` calls. Their validated findings enter shared runtime state through semantic events. The deterministic reconciliation participant reacts to both streams and computes currency-separated balances with integer minor units.

Repayments are not applied merely because a record says `RECEIVED`. A reviewer must link purpose and confirm receipt through versioned runtime decisions. The UI shows conservative and after-confirmation projections, evidence citations, a friendly summary, and sanitized authentic runtime metadata.

Conversation excerpts are preserved as evidence but are not presented as generally understood natural language. External-model extraction is not part of the core workflow.

## Architecture

```text
Browser workspace
  -> bounded Node API + per-run capability token
  -> immutable EvidencePacket
  -> Agreement runLoop ----\
  -> Payment runLoop -------+-> semantic events + shared RuntimeState
  -> reconciliation reactor/
  -> deterministic bigint ledger
  -> versioned human decisions and dual projections
```

Key modules:

- `src/domain/workspace.ts`: server-side submission validation and structured evidence creation.
- `src/runtime/investigation.ts`: Mozaik participants, concurrent loops, events, shared state, and review events.
- `src/domain/reconciliation.ts`: authoritative exact-share, repayment, duplicate, and balance arithmetic.
- `src/domain/projections.ts`: evidence-only and after-confirmation explanations.
- `src/server/app.ts`: bounded API, in-memory run isolation, rate limit, and static assets.
- `src/web/client.ts`: editable workspace and server-result rendering; it contains no financial ledger.

## Install and run

Requirements: Node.js 20–24, npm, and Chrome or Edge for the browser test.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Open the printed `ABEND_SERVER_URL`, enter records, and select **Investigate records**. No provider key is needed or used.

Verification commands:

```powershell
npm.cmd run proof
npm.cmd run test:browser
git diff --check
```

The latest T008 local run recorded 53 passing automated tests and a passing Chrome journey on a new USD scenario. Exact IDs, timestamps, and overlap measurements are generated on each run; see `PROGRESS.md` for the latest recorded evidence.

## Security and privacy boundaries

- Request size, participants, names, records, currencies, amounts, shares, statuses, and conversation length are validated server-side.
- Investigation starts are rate-limited. Review mutations require an unguessable per-run capability token.
- Evidence is rendered through DOM text nodes under a same-origin Content Security Policy.
- Investigators receive no shell, filesystem, bank, payment, secret, or broad-network tools.
- Raw conversations are not logged by application code.
- Runs exist only in one server process. There is no durable persistence, user account authentication, or cross-device recovery.
- Abend does not connect to banks, initiate payments, collect debts, send messages, or perform implicit currency conversion.

## Inference honesty

The core product uses a deterministic inference runner inside genuine Mozaik agent loops to validate the bounded structured-record grammar. It is not described as LLM inference. Earlier controlled Gemini requests returned HTTP 500/503 before model output, so successful provider-backed extraction remains unverified and unavailable.

## Release status

The repository has a Render blueprint, but T008 is not claimed as deployed or pushed until those external actions and public smoke tests actually occur. The hackathon entry has not been submitted.

Still unavailable:

- free-form natural-language extraction, OCR, or PDF/image extraction;
- ratio or receipt-itemized split entry (exact unequal shares are supported);
- durable storage, authenticated identities, retention/deletion controls, and multi-device sessions;
- successful live-model inference, production deployment verification, and submission receipt.

The public repository is [YakiUdoph/Abend](https://github.com/YakiUdoph/Abend). Official competition requirements and current limitations are tracked in `RULES.md`, `TASKS.md`, and `PROGRESS.md`.
