# ABEND Architecture

Status: **IMPLEMENTED FOR THE TEXT-FIRST MVP; PROVIDER-BACKED EXTRACTION NOT VERIFIED**
Purpose: implemented architecture and remaining-boundary documentation. Historical future-tense passages describe the design that guided the current system.

## Architecture principles

1. Evidence is immutable; interpretations are versioned.
2. LLM output is an untrusted proposal until schema-validated.
3. Financial arithmetic is deterministic and currency-separated.
4. Every material finding has provenance.
5. Human review changes structured facts, then triggers deterministic recalculation.
6. Mozaik concurrency and collaboration are runtime behavior, not UI theater.
7. Uploaded content is data, never instructions.

## Proposed boundaries

```text
Browser
  -> ingestion API -> immutable sources/spans
  -> investigation runtime (Mozaik)
       |-> Agreement Investigator ----\
       |-> Payment Investigator -------+-> typed evidence events + shared state
       |-> Reconciliation Investigator /          |
       |-> Human participant <--------------------/
  -> schema validation -> reconciliation engine -> findings/balances
  -> review API -> confirmed overrides -> recomputation
  -> presentation API -> evidence view / friendly draft / trace view
```

Suggested implementation is a single TypeScript repository with a web application, server-only Mozaik runtime, deterministic domain modules, and tests. Exact framework selection is deferred until the runtime spike proves package compatibility.

## Verified Mozaik surface; runtime still NOT TESTED locally

Current official documentation and the published npm page describe `@mozaik-ai/core` 4.0.6 on 2026-10-30. Pin the exact version proven during Phase 1; do not use `latest` in the submitted lockfile.

- `defineRuntime<State>()` returns `initializeRuntime`, `resolveRuntime`, `resolveParticipant`, `join`, `leave`, `sendMessage`, `sendEvent`, and `runLoop`.
- These session functions are not top-level package exports.
- `initializeRuntime({ state, inferenceRunnerConfig? })` is called once.
- `createAgent({ name, capabilities, instruction, tools, handlers })` and `createHuman({ name, capabilities, handlers })` create participants.
- `SituationSpecification.isSatisfiedBy({ event, participant })` filters events; a handler processor applies reactions.
- `runLoop(agentId, message, inferenceInput, interceptionHandler?)` is fire-and-forget and creates a unique loop ID.
- Shared mutable coordination data belongs on a `RuntimeState` subclass.
- `sendEvent(event, senderId)` publishes semantic events; the sender must be joined.
- Situation processors are not awaited by event fan-out. Completion and failure observation therefore need explicit events/state and timeout handling.

Documentation is internally time-sensitive: an older indexed agent-loop page still says the first state is `context_update`, while the 4.0.4 changelog/current npm README say `message_received`. Phase 1 must inspect installed 4.0.6 types/source and test observed events before production code relies on names or payload shapes.

## Participants and meaningful collaboration

### Agreement Investigator

Starts from the same immutable evidence packet as the Payment Investigator. Produces typed `agreement.candidate` events with participants, expense scope, split rule, status, confidence rationale and citations.

### Payment Investigator

Runs concurrently with Agreement Investigator. Produces typed `payment.candidate` events with sender, possible recipient, amount, currency, payment state, possible obligation reference and citations.

### Reconciliation Investigator

Does not merely wait for a fixed handoff. It subscribes to candidate and conflict events, compares emerging agreement/payment candidates, requests clarification through typed events, and records discrepancy findings. It may react as soon as either stream arrives and revise its view when the other arrives.

### Human participant

Receives review requests, submits confirmations/corrections, and can govern risky transitions. Human responses are explicit events with actor and timestamp; they never overwrite original evidence.

### Proposed collaboration proof

- One human/start event causes both initial investigator loops to start without awaiting either.
- Distinct loop-start events overlap before both loops complete.
- Each investigator publishes domain events carrying real citations.
- The reconciliation investigator consumes events from both producer IDs and writes a combined discrepancy or match record to shared runtime state.
- At least one test delays each investigator in turn, proving no assumed completion order.
- Trace evidence comes from observed Mozaik events and stored domain events, never generated placeholders.

## Domain data contracts

```ts
type FindingStatus =
  | "DOCUMENTED_CLAIM"
  | "USER_CONFIRMED"
  | "INDEPENDENTLY_VERIFIED"
  | "CONFLICTING"
  | "UNRESOLVED";

type Money = { minor: bigint; currency: string; exponent: number };
type Citation = {
  sourceId: string;
  start: number;
  end: number;
  excerptHash: string;
};

type Agreement = {
  id: string;
  expenseRefs: string[];
  participants: string[];
  split: { kind: "equal" | "exact" | "ratio"; values?: Record<string, bigint> };
  status: FindingStatus;
  citations: Citation[];
};

type PaymentClaim = {
  id: string;
  senderId?: string;
  recipientId?: string;
  amount: Money;
  state: "CLAIMED" | "INITIATED" | "RECEIVED" | "UNKNOWN";
  obligationId?: string;
  status: FindingStatus;
  citations: Citation[];
};
```

All LLM-facing contracts use JSON-safe decimal strings for minor units and are converted to `bigint` only after strict validation. Persistence must serialize integers losslessly.

## Reconciliation engine

Pure domain functions should:

1. validate participants, currencies, amounts and citations;
2. materialize supported shares from agreements;
3. detect exact and fuzzy duplicate candidates without silently deleting them;
4. match eligible repayments to obligations by parties, currency, amount/date/reference evidence;
5. apply only confirmed policy-eligible records;
6. return per-currency gross obligations, applied repayments, unresolved records and net suggestions;
7. provide an explanation graph from every balance term back to source spans or human decisions.

Two projections are required:

- **Documented projection:** includes only what supplied evidence supports under the conservative policy.
- **Confirmed projection:** also includes explicit human decisions, visibly labeled.

## Source ingestion and prompt-injection defense

- Normalize line endings and create stable numbered spans before any model call.
- Bound size, file type and encoding; reject malformed or oversized input honestly.
- Wrap evidence in a data envelope and instruct agents that embedded directives are quotations, not commands.
- Do not expose secrets, network tools, filesystem tools or payment tools to investigators.
- Require structured output, allowlisted status values and citations resolving to real spans.
- Reject or quarantine findings with missing/invalid citations, unknown participants, invented source IDs or impossible amounts.
- Escape all evidence when rendering to prevent XSS.
- Minimize retention and add deletion controls before handling real user data.

## Failure and observability model

Run state: `CREATED -> INVESTIGATING -> NEEDS_REVIEW | RECONCILED | FAILED`.

- Provider timeout/failure marks only the affected investigator and preserves inputs/results already received.
- A run-level deadline prevents indefinite waiting; incomplete work becomes `UNRESOLVED`.
- Every domain event has run ID, event ID, producer participant ID, occurred-at time, schema version and redacted payload.
- Store raw authentic runtime metadata separately from user-facing explanations.
- Never expose prompts, API keys or full sensitive source text in public traces.
- The verification view distinguishes Mozaik-native events from Abend domain events.

## Security review

Primary risks and controls:

- **Prompt injection:** treat uploads as untrusted data; restricted tools; validate citations and output.
- **Hallucinated finance facts:** reject uncited findings; deterministic engine; review gates.
- **Cross-run data leakage:** per-run state, authorization on every read, no global mutable evidence store.
- **Money precision/currency confusion:** integer minor units; explicit codes/exponents; no implicit FX.
- **False payment certainty:** explicit payment states; receipt confirmation required.
- **PII leakage in traces:** server-side redaction and private-by-default verification artifacts.
- **Tampered evidence:** immutable source hashes and versioned review decisions.
- **Denial/cost abuse:** upload, token, concurrency and time limits.
- **Duplicate events/races:** idempotency keys, append-only event records and deterministic reducers.

## Deployment boundary

The web host must support the selected server runtime and the lifecycle required by concurrent Mozaik loops. This is **UNKNOWN** until Phase 1/2. If serverless lifetime conflicts with fire-and-forget execution, use a durable worker/service rather than claiming concurrency from prematurely terminated requests.

