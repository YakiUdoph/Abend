# ABEND Experience and Interface Design

Status: **PROPOSED / NOT IMPLEMENTED**

## Design intent

Abend should feel calm, exact and humane. It is a resolution workspace, not a forensic crime board and not a generic AI dashboard. The primary visual idea is a clean “supported balance” with an evidence trail that can be opened one term at a time.

Tone: neutral, respectful and specific. Avoid “caught,” “lied,” “fraud,” “guilty,” and artificial confidence.

## Information architecture

### 1. Add evidence

- Large conversation text area with optional `.txt` upload.
- Separate payment-record text area and structured add-record control.
- Plain privacy note and fictional-fixture shortcut clearly labeled test data.
- Primary action: **Work it out**.
- Image/PDF affordances remain absent or marked unavailable until genuinely implemented.

### 2. Investigation

- Honest activity state derived from real runtime events.
- Human-readable labels such as “Checking agreements” and “Checking repayments.”
- No fake progress percentages, invented agent dialogue or minimum-duration animation.
- Partial failure remains visible with retry guidance.

### 3. Review findings

Use a single ordered review queue:

- **Supported** — documented finding and linked evidence.
- **Needs your confirmation** — an explicit choice changes the result.
- **Conflicting** — show both records side by side without choosing silently.
- **Not included** — explain missing agreement, duplicate suspicion or irrelevant content.

Each card shows a concise proposition, money/people involved, status chip, evidence excerpt, source location and “correct this” action. Confidence is explanatory text, not a misleading precision percentage.

### 4. Balances

Lead with balances by currency; never merge currency columns without an approved rate.

Two clearly named tabs or stacked sections:

- **From the documents** — conservative projection.
- **After your confirmations** — includes reviewed facts and identifies each change.

Every amount expands into its arithmetic and citations. Unresolved transactions sit beside, not inside, the total. A “how this was calculated” panel shows shares, repayments and duplicate adjustments in minor-unit-safe formatted money.

### 5. Friendly message

Draft only from accepted structured results. Default form:

> I worked through the accommodation records. The documented split leaves [summary]. I found [uncertainty] and haven’t counted it yet. Could we confirm [question]? Once confirmed, the balance would be [conditional result].

The user must be able to edit/copy it. Abend does not send messages.

### 6. Verification view

A secondary route/drawer for judges and technical users:

- run ID and status;
- participant manifests/roles;
- real event timeline with producer IDs and loop IDs when emitted by Mozaik;
- overlap/concurrency evidence;
- domain collaboration events and shared-state revisions;
- redaction notice and downloadable sanitized JSON if implemented.

Never create trace rows client-side to make a run look complete.

## Visual system

- Warm off-white canvas, near-black text, restrained moss/teal for supported information, amber for unresolved, and muted red only for conflicts/errors.
- Editorial typography with tabular numerals for money.
- Generous whitespace, one strong column on mobile, two-column evidence/result layout on desktop.
- Hairline borders and subtle elevation; no glassmorphism, decorative chatbot bubbles or gratuitous charts.
- Motion only for state changes; respect `prefers-reduced-motion`.
- Minimum WCAG AA contrast, visible keyboard focus, semantic headings, labeled inputs and non-color status cues.

## Key copy rules

Say:

- “The conversation says…”
- “This record indicates a transfer was initiated.”
- “Not included because no sharing agreement was found.”
- “If you confirm this repayment was received…”

Do not say:

- “This definitely happened” for a claim.
- “They owe you” without the projection/status qualifier.
- “AI verified” when a model only extracted text.
- “Payment complete” from a sent/initiated screenshot.

## Responsive and accessible behavior

- Source excerpts wrap and can be reached from finding cards via anchors.
- Money never truncates; currency code remains visible.
- Review decisions are keyboard operable and reversible.
- Screen readers receive the status and the consequence of each decision.
- Before applying a correction, announce which balances will be recalculated.
- Empty, malformed, API-failure and partial-result states contain actionable recovery copy.

## Demo story

Use the three-person fictional fixture from `PRD.md`. The demo should visibly establish the accommodation agreement, show the partial repayment at its actual evidence status, exclude the unsupported taxi, accept one human decision, recalculate, open supporting evidence, and inspect the authentic Mozaik verification view.

The fixture must travel through the same ingestion, investigation, validation and calculation path as user data. No demo-specific result branch is allowed.

