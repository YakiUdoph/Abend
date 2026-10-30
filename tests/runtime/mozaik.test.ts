import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeState, defineRuntime, supportedModels } from "@mozaik-ai/core";
import { createEvidenceSource, type EvidencePacket } from "../../src/domain/evidence.js";
import { createFictionalEvidencePacket } from "../../src/fixtures/fictional-evidence.js";
import { DeterministicInvestigatorRunner } from "../../src/runtime/deterministic-runner.js";
import { createInvestigation } from "../../src/runtime/investigation.js";
import { SafeInferenceRunner, classifyProviderError } from "../../src/runtime/provider-runner.js";
import { ZERO_COST_MODEL, checkZeroCostGeminiReadiness } from "../../src/runtime/zero-cost.js";
import type { InferenceRunner } from "@mozaik-ai/core";

test("installed Mozaik runtime initializes exactly once", () => {
  class EmptyState extends RuntimeState {}
  const api = defineRuntime<EmptyState>();
  api.initializeRuntime({
    state: new EmptyState(),
    inferenceRunnerConfig: { runner: new DeterministicInvestigatorRunner() },
  });
  assert.throws(
    () =>
      api.initializeRuntime({
        state: new EmptyState(),
        inferenceRunnerConfig: { runner: new DeterministicInvestigatorRunner() },
      }),
    /Runtime already initialized/,
  );
});

test("runtime initializes and publishes participant lifecycle events", async () => {
  const investigation = createInvestigation(createFictionalEvidencePacket());
  const result = await investigation.run();
  assert.equal(result.nativeEvents.some((event) => event.type === "participant.joined"), true);
  assert.equal(result.agentWindows.length, 2);
});

test("acceptance N: two genuine Mozaik loops have distinct IDs and overlapping windows", async () => {
  const investigation = createInvestigation(createFictionalEvidencePacket(), {
    delaysMs: { agreement: 50, payment: 30 },
  });
  const result = await investigation.run();
  assert.equal(result.overlap.observed, true);
  assert.equal(result.overlap.distinctLoopIds, true);
  assert.notEqual(result.agentWindows[0]?.agentId, result.agentWindows[1]?.agentId);
  assert.equal(result.agentWindows.every((window) => window.status === "COMPLETED"), true);
});

test("acceptance O: cross-agent findings cause an unresolved reconciliation without applying payment", async () => {
  const result = await createInvestigation(createFictionalEvidencePacket()).run();
  assert.equal(result.agreements.length, 1);
  assert.equal(result.payments.length, 1);
  assert.equal(result.agreements[0]?.expenseLabel, "accommodation");
  assert.equal(result.agreements[0]?.citations.some((citation) => /taxi/i.test(citation.text)), false);
  assert.equal(result.payments[0]?.transferState, "INITIATED");
  assert.equal(result.payments[0]?.status, "UNRESOLVED");
  assert.deepEqual(
    result.obligations.map(({ debtor, creditor, amountMinor, currency }) => ({
      debtor,
      creditor,
      amountMinor,
      currency,
    })),
    [
      { debtor: "Bea", creditor: "Alex", amountMinor: "10000", currency: "EUR" },
      { debtor: "Chen", creditor: "Alex", amountMinor: "10000", currency: "EUR" },
    ],
  );
  assert.equal(result.reconciliations[0]?.outcome, "UNRESOLVED");
  assert.equal(result.reconciliations[0]?.reason, "AMBIGUOUS_PURPOSE");
  assert.equal(result.reconciliations[0]?.appliedMinor, "0");
  assert.equal(result.reconciliations[0]?.citations.length, 3);
  const sequence = result.nativeEvents.map((event) => event.type);
  assert.equal(sequence.includes("agreement.finding"), true);
  assert.equal(sequence.includes("payment.finding"), true);
  assert.equal(sequence.includes("reconciliation.updated"), true);
  const finalRevision = result.nativeEvents
    .filter((event) => event.type === "reconciliation.updated")
    .at(-1)?.details;
  assert.equal(finalRevision?.agreementIds.length, 1);
  assert.equal(finalRevision?.paymentIds.length, 1);
  assert.equal(finalRevision?.resultIds.length, 1);
});

test("completion order does not change the deterministic final result", async () => {
  const agreementFirst = await createInvestigation(createFictionalEvidencePacket(), {
    delaysMs: { agreement: 5, payment: 40 },
  }).run();
  const paymentFirst = await createInvestigation(createFictionalEvidencePacket(), {
    delaysMs: { agreement: 40, payment: 5 },
  }).run();
  assert.deepEqual(agreementFirst.reconciliations, paymentFirst.reconciliations);
  assert.deepEqual(agreementFirst.obligations, paymentFirst.obligations);
});

test("duplicate findings are idempotent", async () => {
  const result = await createInvestigation(createFictionalEvidencePacket(), {
    duplicateFindingsRole: "payment",
  }).run();
  assert.equal(result.payments.length, 1);
  assert.equal(result.duplicateFindingEvents, 1);
  assert.equal(result.reconciliations.length, 1);
});

test("acceptance J: irrelevant messages yield no findings or financial result", async () => {
  const packet: EvidencePacket = {
    id: "missing-evidence",
    label: "FICTIONAL TEST DATA",
    sources: [createEvidenceSource("empty.txt", "Alex: Nice weather today.")],
  };
  const result = await createInvestigation(packet).run();
  assert.equal(result.agreements.length, 0);
  assert.equal(result.payments.length, 0);
  assert.equal(result.reconciliations.length, 0);
});

test("invalid source citations are rejected deterministically", async () => {
  const result = await createInvestigation(createFictionalEvidencePacket(), {
    corruptCitationRole: "payment",
  }).run();
  const paymentWindow = result.agentWindows.find((window) => window.role === "payment");
  assert.equal(paymentWindow?.status, "FAILED");
  assert.equal(paymentWindow?.errorCode, "INVALID_AGENT_OUTPUT");
  assert.equal(result.payments.length, 0);
  assert.equal(paymentWindow?.diagnostic?.category, "MODEL_OUTPUT");
  if (paymentWindow?.diagnostic?.category === "MODEL_OUTPUT") {
    assert.equal(paymentWindow.diagnostic.validationCode, "CITATION_DOES_NOT_RESOLVE");
    assert.equal(paymentWindow.diagnostic.path, "$.findings[0].citations[0]");
  }
});

test("agent failure is isolated and reported", async () => {
  const result = await createInvestigation(createFictionalEvidencePacket(), {
    failRole: "agreement",
  }).run();
  const agreementWindow = result.agentWindows.find((window) => window.role === "agreement");
  const paymentWindow = result.agentWindows.find((window) => window.role === "payment");
  assert.equal(agreementWindow?.status, "FAILED");
  assert.equal(agreementWindow?.errorCode, "AGREEMENT_DETERMINISTIC_FAILURE");
  assert.equal(paymentWindow?.status, "COMPLETED");
});

test("provider rejection is converted to an honest isolated failure", async () => {
  const rejectingRunner: InferenceRunner = {
    async run() { throw new Error("secret-bearing provider error"); },
    async *stream() { throw new Error("secret-bearing provider error"); },
  };
  const result = await createInvestigation(createFictionalEvidencePacket(), {
    model: "gpt-5.4-mini",
    inferenceRunner: new SafeInferenceRunner(rejectingRunner),
  }).run();
  assert.equal(result.agentWindows.every(({ status }) => status === "FAILED"), true);
  assert.equal(result.agentWindows.every(({ errorCode }) => errorCode === "PROVIDER_REQUEST_FAILED"), true);
  assert.equal(result.agreements.length, 0);
  assert.equal(result.payments.length, 0);
  assert.equal(JSON.stringify(result).includes("secret-bearing"), false);
});

test("provider diagnostics classify safe status and retry metadata without retaining secrets", () => {
  const rateLimit = classifyProviderError(
    Object.assign(new Error("RESOURCE_EXHAUSTED api-key=do-not-retain"), { status: 429 }),
    ZERO_COST_MODEL,
  );
  assert.deepEqual(rateLimit, {
    category: "RATE_LIMIT",
    model: ZERO_COST_MODEL,
    retryable: true,
    rateLimited: true,
    httpStatus: 429,
  });
  assert.equal(JSON.stringify(rateLimit).includes("do-not-retain"), false);
  assert.equal(classifyProviderError(Object.assign(new Error("responseSchema invalid"), { status: 400 }), ZERO_COST_MODEL).category, "SCHEMA_REJECTED");
  assert.equal(classifyProviderError(Object.assign(new Error("invalid key"), { status: 401 }), ZERO_COST_MODEL).category, "AUTHENTICATION");
  assert.equal(classifyProviderError(Object.assign(new Error(JSON.stringify({ error: { status: "UNAVAILABLE", message: "private detail" } })), { status: 503 }), ZERO_COST_MODEL).providerCode, "UNAVAILABLE");
});

test("zero-cost Gemini path is installed, structured, and hard-gated", () => {
  const model = supportedModels.find(({ specification }) => specification.name === ZERO_COST_MODEL);
  assert.equal(model?.specification.provider, "google");
  assert.equal(model?.specification.supportsStructuredOutput, true);
  assert.deepEqual(checkZeroCostGeminiReadiness({}), {
    ready: false,
    missing: ["GEMINI_API_KEY", "ABEND_GEMINI_FREE_TIER_CONFIRMED=1"],
    reason: "No request is allowed until a Gemini API key exists and its AI Studio project is manually verified as Free Tier with billing disabled.",
  });
  assert.deepEqual(checkZeroCostGeminiReadiness({ GEMINI_API_KEY: "test-only", ABEND_GEMINI_FREE_TIER_CONFIRMED: "0" }), {
    ready: false,
    missing: ["ABEND_GEMINI_FREE_TIER_CONFIRMED=1"],
    reason: "No request is allowed until a Gemini API key exists and its AI Studio project is manually verified as Free Tier with billing disabled.",
  });
  assert.deepEqual(checkZeroCostGeminiReadiness({ GEMINI_API_KEY: "test-only", ABEND_GEMINI_FREE_TIER_CONFIRMED: "1" }), { ready: true });
});

test("timeout marks a slow agent and ignores its late answer", async () => {
  const investigation = createInvestigation(createFictionalEvidencePacket(), {
    delaysMs: { agreement: 80, payment: 5 },
    timeoutMs: 15,
  });
  const result = await investigation.run();
  const agreementWindow = result.agentWindows.find((window) => window.role === "agreement");
  assert.equal(agreementWindow?.status, "TIMED_OUT");
  assert.equal(agreementWindow?.errorCode, "AGENT_TIMEOUT");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(investigation.snapshot().agreements.length, 0);
});

test("human confirmation links and applies a payment through a real runtime event", async () => {
  const investigation = createInvestigation(createFictionalEvidencePacket());
  const before = await investigation.run();
  assert.equal(before.reconciliations[0]?.outcome, "UNRESOLVED");
  const paymentId = before.payments[0]?.id;
  const agreementId = before.agreements[0]?.id;
  assert.ok(paymentId);
  assert.ok(agreementId);
  const after = investigation.confirmPayment(paymentId, agreementId);
  assert.equal(after.payments[0]?.status, "USER_CONFIRMED");
  assert.equal(after.reconciliations[0]?.outcome, "SUPPORTED");
  assert.equal(after.reconciliations[0]?.reason, "PAYMENT_RECEIVED");
  assert.equal(after.reconciliations[0]?.appliedMinor, "4000");
});
