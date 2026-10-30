import assert from "node:assert/strict";
import test from "node:test";
import type { AgreementFinding, PaymentFinding } from "../../src/domain/findings.js";
import {
  allocateEqualShares,
  reconcileLedger,
  type ExpenseClaim,
  type HumanDecision,
} from "../../src/domain/reconciliation.js";
import { ingestText } from "../../src/domain/ingestion.js";
import { extractAgreements, extractPayments } from "../../src/domain/extractors.js";
import { createFictionalEvidencePacket } from "../../src/fixtures/fictional-evidence.js";
import { createInvestigation } from "../../src/runtime/investigation.js";

const at = "2026-10-30T13:00:00.000Z";

function base() {
  const packet = createFictionalEvidencePacket();
  const agreement = extractAgreements(packet)[0];
  const payment = extractPayments(packet)[0];
  assert.ok(agreement);
  assert.ok(payment);
  return { packet, agreement, payment };
}

function decision(
  id: string,
  kind: HumanDecision["kind"],
  target: { paymentId?: string; agreementId?: string },
): HumanDecision {
  return { id, kind, actor: "fictional-reviewer", occurredAt: at, ...target };
}

function confirmedPaymentDecisions(paymentId: string, agreementId: string): HumanDecision[] {
  return [
    decision("link", "LINK_PAYMENT_TO_AGREEMENT", { paymentId, agreementId }),
    decision("receipt", "CONFIRM_PAYMENT_RECEIPT", { paymentId }),
  ];
}

test("acceptance A: documented equal three-person split conserves exact shares and citations", () => {
  const { packet, agreement } = base();
  const ledger = reconcileLedger({ packet, agreements: [agreement], payments: [] });
  assert.deepEqual(ledger.shares[agreement.id]?.map(({ amountMinor }) => amountMinor), ["10000", "10000", "10000"]);
  assert.equal(ledger.obligations.reduce((sum, item) => sum + BigInt(item.originalMinor), 0n), 20000n);
  assert.equal(ledger.obligations.every(({ citations }) => citations.length === 2), true);
});

test("acceptance C: linked but unconfirmed partial repayment is not applied", () => {
  const { packet, agreement, payment } = base();
  const ledger = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: [decision("link", "LINK_PAYMENT_TO_AGREEMENT", { paymentId: payment.id, agreementId: agreement.id })],
  });
  assert.equal(ledger.paymentApplications[0]?.reason, "PAYMENT_NOT_CONFIRMED");
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "0");
  assert.equal(ledger.obligations.find(({ debtor }) => debtor === "Bea")?.outstandingMinor, "10000");
});

test("acceptance C: confirmed and linked partial repayment reduces only the eligible obligation", () => {
  const { packet, agreement, payment } = base();
  const ledger = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: confirmedPaymentDecisions(payment.id, agreement.id),
  });
  assert.equal(ledger.paymentApplications[0]?.status, "APPLIED");
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "4000");
  assert.equal(ledger.obligations.find(({ debtor }) => debtor === "Bea")?.outstandingMinor, "6000");
  assert.equal(ledger.obligations.find(({ debtor }) => debtor === "Chen")?.outstandingMinor, "10000");
});

test("acceptance F: taxi expense without a sharing agreement remains unresolved and excluded", () => {
  const { packet, agreement } = base();
  const taxiSpan = packet.sources[0]?.spans.find(({ text }) => text.includes("EUR 36 for a taxi"));
  assert.ok(taxiSpan);
  const taxi: ExpenseClaim = {
    id: "taxi-expense",
    label: "taxi",
    payer: "Chen",
    amountMinor: "3600",
    currency: "EUR",
    status: "DOCUMENTED_CLAIM",
    citations: [taxiSpan],
  };
  const ledger = reconcileLedger({ packet, agreements: [agreement], payments: [], expenses: [taxi] });
  assert.equal(ledger.unresolved.some(({ id, reason }) => id === "unresolved:expense:taxi-expense" && reason === "MISSING_SHARING_AGREEMENT"), true);
  assert.equal(ledger.obligations.some(({ creditor }) => creditor === "Chen"), false);
});

test("acceptance H: record claiming receipt is not confirmation and stays unapplied", () => {
  const { packet, agreement, payment } = base();
  const claimedReceived: PaymentFinding = { ...payment, purpose: "accommodation", transferState: "RECEIVED", status: "DOCUMENTED_CLAIM" };
  const ledger = reconcileLedger({ packet, agreements: [agreement], payments: [claimedReceived] });
  assert.equal(ledger.paymentApplications[0]?.reason, "PAYMENT_NOT_CONFIRMED");
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "0");
});

test("acceptance K: currencies remain in separate ledgers and cross-currency payment is not applied", () => {
  const { packet: original, agreement, payment } = base();
  const packet = { ...original, currencies: ["EUR", "USD"] };
  const usdAgreement: AgreementFinding = { ...agreement, id: "usd-agreement", amountMinor: "6000", currency: "USD" };
  const usdPayment: PaymentFinding = { ...payment, id: "usd-payment", amountMinor: "1000", currency: "USD" };
  const ledger = reconcileLedger({
    packet,
    agreements: [agreement, usdAgreement],
    payments: [usdPayment],
    decisions: [
      decision("bad-link", "LINK_PAYMENT_TO_AGREEMENT", { paymentId: usdPayment.id, agreementId: agreement.id }),
      decision("usd-receipt", "CONFIRM_PAYMENT_RECEIPT", { paymentId: usdPayment.id }),
    ],
  });
  assert.equal(ledger.paymentApplications[0]?.reason, "CURRENCY_MISMATCH");
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "0");
  assert.deepEqual([...new Set(ledger.balances.map(({ currency }) => currency))], ["EUR", "USD"]);
});

test("duplicate payment records are never applied twice", () => {
  const { packet, agreement, payment } = base();
  const duplicate = { ...payment, id: "duplicate-payment" };
  const ledger = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [payment, duplicate],
    decisions: [
      ...confirmedPaymentDecisions(payment.id, agreement.id),
      decision("duplicate-link", "LINK_PAYMENT_TO_AGREEMENT", { paymentId: duplicate.id, agreementId: agreement.id }),
      decision("duplicate-receipt", "CONFIRM_PAYMENT_RECEIPT", { paymentId: duplicate.id }),
    ],
  });
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "4000");
  assert.equal(ledger.paymentApplications[1]?.reason, "DUPLICATE_PAYMENT");
  assert.equal(ledger.paymentApplications[1]?.appliedMinor, "0");
  assert.equal(ledger.obligations.find(({ debtor }) => debtor === "Bea")?.outstandingMinor, "6000");
});

test("remainder allocation is deterministic and conserves every minor unit", () => {
  const { agreement } = base();
  const remainderAgreement: AgreementFinding = { ...agreement, id: "remainder", amountMinor: "10001" };
  const shares = allocateEqualShares(remainderAgreement);
  assert.deepEqual(shares.map(({ amountMinor, remainderMinor }) => ({ amountMinor, remainderMinor })), [
    { amountMinor: "3334", remainderMinor: "1" },
    { amountMinor: "3334", remainderMinor: "1" },
    { amountMinor: "3333", remainderMinor: "0" },
  ]);
  assert.equal(shares.reduce((sum, share) => sum + BigInt(share.amountMinor), 0n), 10001n);
});

test("overpayment is capped and excess remains unresolved", () => {
  const { packet: original, agreement, payment } = base();
  const packet = { ...original, currencies: ["EUR"] };
  const overpayment: PaymentFinding = { ...payment, id: "overpayment", amountMinor: "15000" };
  const ledger = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [overpayment],
    decisions: confirmedPaymentDecisions(overpayment.id, agreement.id),
  });
  assert.equal(ledger.paymentApplications[0]?.reason, "OVERPAYMENT");
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "10000");
  assert.equal(ledger.paymentApplications[0]?.unresolvedMinor, "5000");
  assert.equal(ledger.obligations.find(({ debtor }) => debtor === "Bea")?.outstandingMinor, "0");
});

test("conflicting human payment decisions are rejected without replacing the audit trail", () => {
  const { packet, agreement, payment } = base();
  assert.throws(() => reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: [
      decision("confirm", "CONFIRM_PAYMENT_RECEIPT", { paymentId: payment.id }),
      decision("reject", "REJECT_PAYMENT_CLAIM", { paymentId: payment.id }),
    ],
  }), /CONTRADICTORY_DECISION:reject/);
  assert.throws(() => reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: [{ ...decision("unauthorized", "CONFIRM_PAYMENT_RECEIPT", { paymentId: payment.id }), kind: "ADMIN_OVERRIDE" as HumanDecision["kind"] }],
  }), /INVALID_DECISION_KIND:unauthorized/);
});

test("split confirmation and unresolved decisions are auditable and mutually exclusive", () => {
  const { packet, agreement } = base();
  const unresolved = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [],
    decisions: [decision("unresolved-split", "MARK_SPLIT_UNRESOLVED", { agreementId: agreement.id })],
  });
  assert.equal(unresolved.obligations.length, 0);
  assert.equal(unresolved.unresolved[0]?.reason, "SPLIT_NOT_SUPPORTED");
  const confirmed = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [],
    decisions: [decision("confirm-split", "CONFIRM_EVIDENCE_SUPPORTED_SPLIT", { agreementId: agreement.id })],
  });
  assert.equal(confirmed.agreements[0]?.status, "USER_CONFIRMED");
  assert.equal(confirmed.decisionEffects[0]?.targetId, agreement.id);
  assert.throws(() => reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [],
    decisions: [
      decision("confirm-split", "CONFIRM_EVIDENCE_SUPPORTED_SPLIT", { agreementId: agreement.id }),
      decision("undo-with-conflict", "MARK_SPLIT_UNRESOLVED", { agreementId: agreement.id }),
    ],
  }), /CONTRADICTORY_DECISION/);
});

test("rejected payment claim is retained but never changes balances", () => {
  const { packet, agreement, payment } = base();
  const ledger = reconcileLedger({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: [decision("reject", "REJECT_PAYMENT_CLAIM", { paymentId: payment.id })],
  });
  assert.equal(ledger.paymentApplications[0]?.status, "REJECTED");
  assert.equal(ledger.paymentApplications[0]?.appliedMinor, "0");
  assert.equal(ledger.unresolved.some(({ reason }) => reason === "PAYMENT_REJECTED"), true);
});

test("missing evidence and invalid citations fail before arithmetic", () => {
  const { packet, agreement } = base();
  assert.throws(() => reconcileLedger({ packet, agreements: [{ ...agreement, citations: [] }], payments: [] }), /NON_EMPTY_ARRAY_REQUIRED/);
  const invalid = structuredClone(agreement);
  if (invalid.citations[0]) invalid.citations[0].sourceId = "invented-source";
  assert.throws(() => reconcileLedger({ packet, agreements: [invalid], payments: [] }), /CITATION_DOES_NOT_RESOLVE/);
});

test("prompt-injection text remains data and cannot create obligations or received payments", async () => {
  const result = await createInvestigation(createFictionalEvidencePacket()).run();
  assert.equal(result.agreements.length, 1);
  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0]?.transferState, "INITIATED");
  assert.equal(result.obligations.length, 2);
  assert.equal(result.paymentApplications[0]?.appliedMinor, "0");
});

test("failed and timed-out investigators preserve partial deterministic state", async () => {
  const failed = await createInvestigation(createFictionalEvidencePacket(), { failRole: "agreement" }).run();
  assert.equal(failed.payments.length, 1);
  assert.equal(failed.obligations.length, 0);
  const investigation = createInvestigation(createFictionalEvidencePacket(), { delaysMs: { agreement: 80, payment: 5 }, timeoutMs: 15 });
  const timedOut = await investigation.run();
  assert.equal(timedOut.agentWindows.find(({ role }) => role === "agreement")?.status, "TIMED_OUT");
  assert.equal(timedOut.payments.length, 1);
  assert.equal(timedOut.obligations.length, 0);
});
