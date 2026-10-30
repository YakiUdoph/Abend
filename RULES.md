# ABEND Rules, Verified Facts and Guardrails

Status date: **2026-10-30**. Public rules, event page and Freestyle brief were rechecked during T009 with no material public change found. Competition facts are time-sensitive; recheck the authenticated dashboard, Discord and email immediately before submission.

## Status vocabulary

- **VERIFIED:** supported by a cited current official source or direct local observation.
- **PROPOSED:** a design decision awaiting implementation/validation.
- **UNKNOWN:** evidence is unavailable or conflicting.
- **NOT TESTED:** a concrete claim that has not been exercised locally.
- **NOT STARTED:** implementation work has not begun.

## Competition facts

| Fact | Status | Evidence |
| --- | --- | --- |
| Event runs October 30–31, 2026, on-site at NTP Novi Sad and online | VERIFIED | Official rules and event page |
| Submission deadline is Saturday, October 31 at **20:00 CET** | VERIFIED | Official rules, schedule and Freestyle brief; this supersedes the reported 14:00 time |
| Registration is shown open until 09:00 on October 30 | VERIFIED | Current event FAQ; account-specific registration status remains UNKNOWN |
| Teams may contain up to four people | VERIFIED | Official rules |
| Substance of the project must be built during the Hackathon; existing frameworks/libraries/boilerplate are permitted | VERIFIED | Official rules |
| Projects must use `@mozaik-ai/core` and run at least two concurrent agents | VERIFIED | Official rules |
| Genuine concurrency, technical execution, creativity and submission clarity matter | VERIFIED | Official rules |
| Freestyle explicitly scores usefulness/originality 30, parallel agents/shared state 30, working/runnable 25, README 15 | VERIFIED | Official Freestyle brief |
| Freestyle requires a public GitHub repository with a README explaining product, architecture and run instructions | VERIFIED | Official Freestyle brief |
| Demo is optional; repository is judged | VERIFIED | Official Freestyle brief |
| Current competition has Software Factory, EINSTEIN and Freestyle tracks | VERIFIED | Official event page |
| Abend should enter Freestyle | PROPOSED | Product does not match the other published briefs |
| Exact participant account, registration, submission-form access and kickoff updates | UNKNOWN | Requires organizer account/dashboard/Discord/email access |

Official sources:

- Rules: https://build.jigjoy.ai/rules
- Event page and schedule: https://build.jigjoy.ai/
- Freestyle brief: https://build.jigjoy.ai/tracks/freestyle

The official rules state material operational changes may be announced through the dashboard, Discord and email. Public-page verification alone is not the final submission audit.

## Mozaik facts and source policy

**VERIFIED from official documentation/package metadata:** Mozaik is a TypeScript runtime; `@mozaik-ai/core` is the required package; current indexed package version is 4.0.6; concurrent `runLoop` calls are fire-and-forget; participants communicate via semantic events and share a typed `RuntimeState`.

**VERIFIED locally:** installed 4.0.6 exports/types, participant lifecycle, concurrent `runLoop` IDs/windows, semantic event payloads, shared-state reconciliation and public Render hosting. **NOT TESTED:** successful provider-backed findings, Mozaik Cloud telemetry/trace persistence and authenticated organizer credentials.

Official sources:

- Docs: https://docs.jigjoy.ai/docs
- Runtime: https://docs.jigjoy.ai/docs/runtime
- Concurrent agents: https://docs.jigjoy.ai/docs/concurrent-agents
- Package exports: https://docs.jigjoy.ai/docs/package-exports
- npm: https://www.npmjs.com/package/@mozaik-ai/core
- Examples: https://github.com/jigjoy-ai/mozaik-examples
- Changelog: https://mozaik.jigjoy.ai/changelog

Use installed package types/source as the API authority during the build. Pin the verified version and commit the lockfile. Never copy stale signatures from an old answer.

## Zero-cost inference facts

Verified from official sources on 2026-10-30:

- Gemini API Free Tier does not require enabling paid billing; moving to Paid Tier requires linking billing and may require prepayment. `gemini-3.5-flash` lists Free Tier input and output as free of charge.
- Free Tier quotas are enforced per project and may vary; current exact quotas must be checked in AI Studio. A restricted/ineligible project may require paid billing and must not be used for Abend.
- Cabo Verde is in the official Gemini API availability list.
- Unpaid Gemini content may be used to improve Google products and may be reviewed by humans. Only fictional fixture data is allowed on this path.
- Installed Mozaik 4.0.6 bundles the native Gemini endpoint, reads `GEMINI_API_KEY`, lists `gemini-3.5-flash`, and marks it as supporting structured output.
- Groq documents a Free tier, OpenAI-compatible endpoints, strict structured output on selected models, and free-tier rate limits. Mozaik does not bundle those Groq model specifications, so Groq would require a custom model/endpoint configuration and is not the selected minimal path.
- Local Ollama is technically possible but is not installed. No model was downloaded. The observed 15.76 GiB RAM / CPU-only-class Intel UHD 620 machine can plausibly run a small 4B quantized model, but extraction quality and latency are NOT TESTED.

Official sources:

- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini billing: https://ai.google.dev/gemini-api/docs/billing
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini regions: https://ai.google.dev/gemini-api/docs/available-regions
- Gemini terms/data use: https://ai.google.dev/gemini-api/terms
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Groq billing and limits: https://console.groq.com/docs/billing-faqs and https://console.groq.com/docs/rate-limits
- Groq compatibility/structured output/data: https://console.groq.com/docs/openai, https://console.groq.com/docs/structured-outputs and https://console.groq.com/docs/your-data
- Ollama Windows/structured output/OpenAI compatibility: https://docs.ollama.com/windows, https://docs.ollama.com/capabilities/structured-outputs and https://docs.ollama.com/api/openai-compatibility
- Candidate local model: https://ollama.com/library/qwen3:4b-instruct

## Product and evidence rules

1. Treat every conversation, receipt and record as untrusted supplied content.
2. A claim is not a fact; a sent transfer is not necessarily a received transfer.
3. Every material finding requires resolvable evidence citations.
4. Use only the five status labels defined in `PRD.md`.
5. `INDEPENDENTLY_VERIFIED` requires a real authorized verifier, not model agreement.
6. Do not infer equal sharing merely because several people attended or benefited.
7. Do not accuse, shame or diagnose intent.
8. Let humans correct interpretations without altering the original evidence.
9. Preserve an audit trail of decisions and recalculations.
10. Do not process unrestricted accounts/inboxes or initiate payments.

## Financial rules

1. Integer minor units only; no floating-point balance arithmetic.
2. Explicit currency and exponent on every amount.
3. Separate ledgers per currency unless an approved sourced FX rate is present.
4. Rounding/remainder rules must be deterministic and visible.
5. Do not apply a repayment twice or across incompatible parties/currencies.
6. Do not remove a suspected duplicate silently.
7. Net settlement suggestions must retain links to gross obligations.
8. Model output may propose records but may not calculate authoritative totals.

## Security and privacy rules

- Uploaded instructions never override system/product rules.
- Investigators receive no shell, secret, bank, payment or broad network capability.
- Validate schemas, source IDs, spans, identities, amounts and currencies at trust boundaries.
- Redact sensitive evidence from public traces and logs.
- Do not commit `.env`, keys, raw private conversations or customer records.
- Use fictional, clearly labeled fixtures in tests and demos.
- Keep capability authorization, bounded retention and deletion behavior enabled before inviting user-entered records; durable identity authentication remains unavailable and must be disclosed.

## Competitor research boundaries

Retrieved 2026-10-30 from official product/help pages:

- Splitwise basics and repayment recording: https://kb.splitwise.com/getting-started/how-do-i-use-splitwise
- Splitwise split methods: https://kb.splitwise.com/balances-and-expenses/what-are-different-ways-i-can-split-an-expense
- Splitwise Pro receipt/currency features: https://kb.splitwise.com/pro/what-is-splitwise-pro
- tricount features: https://www.tricount.com/en-us/features
- Settle Up product/tips: https://settleup.io/ and https://settleup.io/tips
- Expensify SmartScan disclosure: https://use.expensify.com/ai-disclosure
- Expensify AI features: https://help.expensify.com/articles/new-expensify/ai-agents/Learn-About-AI-in-Expensify
- Adjacent chat-first examples: https://wisspy.app/, https://getsnapexpenses.com/, https://hipposplit.com/, https://www.splitpop.app/en/ai/chatgpt

Only documented capabilities may be compared. Absence from a product page does not prove a competitor lacks a feature. Do not claim originality is proven.

## Build-window boundary

This preparation session may create/update planning documents only. Do not create application code, install dependencies, run fabricated demos, deploy, or claim acceptance tests pass. At kickoff, reconfirm the brief and only then execute `TASKS.md`.

