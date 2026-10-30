import { createFictionalEvidencePacket } from "./fixtures/fictional-evidence.js";
import { createInvestigation } from "./runtime/investigation.js";

const investigation = createInvestigation(createFictionalEvidencePacket(), {
  delaysMs: { agreement: 45, payment: 20 },
  timeoutMs: 500,
});
const result = await investigation.run();
const paymentId = result.payments[0]?.id;
const agreementId = result.agreements[0]?.id;
if (!paymentId || !agreementId) throw new Error("Deterministic proof did not produce the required findings");
const reviewed = investigation.confirmPayment(paymentId, agreementId);

const proof = {
  proofType: "REAL_MOZAIK_LOOPS_WITH_DETERMINISTIC_INFERENCE_RUNNER",
  liveModelProvider: "NOT_TESTED",
  participantIds: investigation.participantIds,
  agentWindows: result.agentWindows,
  overlap: result.overlap,
  domainEventSequence: reviewed.nativeEvents
    .filter((event) =>
      ["agreement.finding", "payment.finding", "human.decision", "reconciliation.updated"].includes(event.type),
    )
    .map((event) => ({
      type: event.type,
      producerId: event.producerId,
      occurredAt: event.occurredAt,
      ...(event.details ? { details: event.details } : {}),
    })),
  beforeReview: {
    obligations: result.obligations,
    paymentApplications: result.paymentApplications,
    reconciliations: result.reconciliations,
    balances: result.balances,
    projection: result.projections.fromEvidence,
  },
  afterReview: {
    decisions: reviewed.decisions,
    decisionEffects: reviewed.decisionEffects,
    obligations: reviewed.obligations,
    paymentApplications: reviewed.paymentApplications,
    reconciliations: reviewed.reconciliations,
    balances: reviewed.balances,
    projection: reviewed.projections.afterConfirmations,
  },
};

console.log(JSON.stringify(proof, null, 2));
if (!result.overlap.observed || !result.overlap.distinctLoopIds) process.exitCode = 1;
