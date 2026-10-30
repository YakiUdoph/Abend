# ABEND Experience and Interface Design

Status: **SHIPPED AND BROWSER-VERIFIED FOR THE STRUCTURED TEXT-FIRST MVP**

## Design intent

Abend is a calm resolution workspace, not a forensic crime board and not a generic AI dashboard. The interface emphasizes supported balances, uncertainty, and respectful review. Technical runtime evidence is available to judges and advanced users without dominating the ordinary-user journey.

Tone is neutral, humane, and specific. Copy avoids accusation, artificial certainty, and language such as “caught,” “lied,” “fraud,” or “guilty.”

## Shipped journey

### 1. Empty-by-default workspace

The main path starts with blank participant and record fields. It never silently injects the fictional fixture. Users can:

- enter comma-separated participant names;
- select EUR, USD, GBP, or JPY;
- add, edit, and remove expense records;
- enter payer, total, label, and exact participant shares;
- add, edit, and remove repayment claims; and
- enter an optional bounded conversation excerpt.

**Load fictional sample** is an explicit secondary action with a visible **FICTIONAL TEST DATA** notice.

### 2. Investigation

Submitting valid records moves the journey from Records to Investigate. The loading state says only that the request is running; it does not display a fake percentage or artificial delay.

The result shows separate Agreement and Payment investigator cards with authentic participant IDs, loop IDs, and statuses. A concise overlap message reports whether distinct genuine loops overlapped according to runtime events.

### 3. Evidence-backed findings

The submitted immutable packet is displayed before interpretation. Expense, payment, and optional conversation sources show numbered spans and stable citation targets.

Finding cards distinguish agreement facts, payment claims, and unresolved/excluded items. Citation controls move keyboard focus to the exact supporting span. User-entered content is rendered as text, never injected as HTML.

### 4. Human review

Each repayment is reviewed independently. Depending on current decision state, the interface can offer:

- link the repayment to a compatible expense agreement;
- confirm receipt;
- reject the repayment claim;
- reverse the confirmation; or
- reverse the rejection.

Decision history remains visible with decision kind, authentic decision ID, and timestamp. Reversal adds history instead of erasing the prior action. API failures appear beside the review controls and preserve the existing result.

### 5. Financial projections

Two projection cards make policy visible:

- **From the evidence** shows the conservative result before review-dependent payment effects.
- **After confirmations** includes active valid human decisions.

Each balance preserves currency codes and expands into calculation terms with inclusion status, reason, evidence references, and relevant decision references. Unsupported expenses and unconfirmed repayments remain visible without silently affecting totals.

### 6. Friendly summary

The product drafts an editable, non-accusatory summary derived from the structured result. The user can copy it; Abend never sends messages.

### 7. Runtime verification

After a run completes, the Verification control opens a secondary dialog containing:

- run mode and run ID;
- participant identities;
- authentic sanitized native/domain event types;
- producer identities, timestamps, and loop IDs when present; and
- no prompts, secrets, invented traces, or raw technical payload dump.

This view proves Mozaik execution while keeping the primary product understandable to a nontechnical user.

### 8. New investigation and deletion

**Start new investigation** sends a capability-protected delete request for the active server run, clears browser state, and returns to one blank expense record. Runs also expire in server memory after 30 minutes.

## Visual system

- `public/abend-logo.png` is the official Abend logo and the sole source for the header mark, README branding, favicon derivatives, Apple touch icon, and social-sharing image. The source artwork is never redrawn, stretched, cropped, or replaced by generated imagery.
- Warm paper background and near-black typography keep the product serious without feeling punitive.
- Deep emerald signals trust and active structure; amber highlights focus and review without implying guilt.
- Serif display headings give the product an editorial, human quality.
- Monospace is reserved for evidence spans, amounts, identities, and event metadata.
- Thin borders, open spacing, and restrained motion keep dense evidence readable.
- Status is communicated with text and structure, never color alone.

The wordmark and tagline remain consistent: **ABEND. Settle the numbers. Keep the friendship.**

## Copy rules

Use:

- “The record says this transfer was initiated.”
- “Receipt still needs confirmation.”
- “This expense is excluded because no sharing agreement is available.”
- “After confirmations.”
- “What was this repayment for, and was it received?”

Do not use:

- “This definitely happened” for a supplied claim.
- “They owe you” without a projection/status qualifier.
- “AI verified” when deterministic processing or extraction occurred.
- “Payment complete” from an initiated or claimed transfer.
- “Secure” without naming the concrete boundary.

## Responsive behavior

The same complete workflow is available on desktop, tablet, and mobile. Browser verification exercises 1280 px, 768 px, and 390 px widths.

- Multi-column layouts collapse to one column.
- Record controls wrap rather than overflow.
- Evidence excerpts and runtime IDs wrap safely.
- Money retains its currency code and is not clipped.
- Dialogs remain within the viewport.
- The browser journey asserts no horizontal document overflow at all three widths.

## Accessibility

- A keyboard-visible skip link targets the workspace.
- Form controls use visible labels and native inputs/selects.
- Dynamic errors and copy feedback use live status/alert semantics.
- All visible buttons have accessible names.
- Citation links move focus to their evidence target.
- Review actions are native keyboard-operable buttons.
- Reduced-motion preferences remove nonessential transition duration.
- Decision state is expressed in text rather than color alone.

T009's headless Chrome journey verified the skip link, reduced motion, button names, citation focus, anchors, and responsive overflow behavior. This is focused automated accessibility coverage, not a claim of a formal WCAG audit.

## Demonstration story

For a judge-facing demonstration, prefer new clearly fictional structured records rather than relying only on the bundled sample:

1. enter participants and an exact unequal split;
2. add an initiated repayment;
3. investigate and show distinct overlapping agents;
4. open a source citation;
5. link and confirm the repayment, then show the changed projection;
6. reverse or reject the claim to demonstrate auditable uncertainty;
7. copy the friendly summary; and
8. open the verification dialog to show authentic cross-agent events.

The bundled Alex/Bea/Chen fixture remains useful for repeatable tests and is always labeled fictional. Both paths use the same validation, investigation, reconciliation, review, and rendering code.

## Deferred interface concepts

The shipped interface intentionally has no file uploader, OCR/PDF controls, inbox connection, bank connection, account settings, cross-device history, automatic messaging, or provider-backed free-form chat. These must not appear as enabled controls until their underlying capabilities and safety boundaries are implemented and verified.
