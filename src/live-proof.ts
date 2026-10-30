import { supportedModels } from "@mozaik-ai/core";
import { createFictionalEvidencePacket } from "./fixtures/fictional-evidence.js";
import { createInvestigation } from "./runtime/investigation.js";
import { BundledProviderInferenceRunner, SafeInferenceRunner } from "./runtime/provider-runner.js";
import {
  ZERO_COST_MODEL,
  ZERO_COST_PROVIDER,
  checkZeroCostGeminiReadiness,
} from "./runtime/zero-cost.js";

const readiness = checkZeroCostGeminiReadiness();
const installedModel = supportedModels.find(
  ({ specification }) => specification.name === ZERO_COST_MODEL,
);

if (!installedModel?.specification.supportsStructuredOutput) {
  console.error(JSON.stringify({
    status: "BLOCKED",
    provider: ZERO_COST_PROVIDER,
    model: ZERO_COST_MODEL,
    reason: "The installed Mozaik SDK does not expose this model with structured output.",
  }, null, 2));
  process.exitCode = 2;
} else if (!readiness.ready) {
  console.error(JSON.stringify({
    status: "BLOCKED",
    provider: ZERO_COST_PROVIDER,
    model: ZERO_COST_MODEL,
    requiredConfiguration: readiness.missing,
    reason: readiness.reason,
    privacy: "Use fictional data only: Gemini unpaid-service content may be used to improve Google products and may be human reviewed.",
  }, null, 2));
  process.exitCode = 2;
} else {
  const startedAt = new Date().toISOString();
  const investigation = createInvestigation(createFictionalEvidencePacket(), {
    model: ZERO_COST_MODEL,
    timeoutMs: 60_000,
    inferenceRunner: new SafeInferenceRunner(new BundledProviderInferenceRunner()),
  });
  const result = await investigation.run();
  const completedAt = new Date().toISOString();
  const proof = {
    status: result.agentWindows.every(({ status }) => status === "COMPLETED") ? "PASS" : "FAIL",
    provider: ZERO_COST_PROVIDER,
    model: ZERO_COST_MODEL,
    costGuard: "Free Tier manually confirmed; billing disabled",
    startedAt,
    completedAt,
    participantIds: investigation.participantIds,
    agentWindows: result.agentWindows,
    overlap: result.overlap,
    validatedFindingCounts: {
      agreements: result.agreements.length,
      payments: result.payments.length,
      rejected: result.rejectedFindings.length,
    },
    rejectedFindingDiagnostics: result.agentWindows
      .filter(({ diagnostic }) => diagnostic?.category === "MODEL_OUTPUT")
      .map(({ role, diagnostic }) => ({ role, diagnostic })),
    reconciliationEvents: result.nativeEvents.filter(({ type }) => type === "reconciliation.updated"),
    reconciliationCount: result.reconciliations.length,
  };
  console.log(JSON.stringify(proof, null, 2));
  if (proof.status !== "PASS" || !proof.overlap.observed || !proof.overlap.distinctLoopIds) {
    process.exitCode = 1;
  }
}
