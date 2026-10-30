import assert from "node:assert/strict";
import test from "node:test";
import { resolveCitation } from "../../src/domain/evidence.js";
import { extractAgreements, extractPayments } from "../../src/domain/extractors.js";
import type { AgreementFinding, PaymentFinding } from "../../src/domain/findings.js";
import { buildFinancialViews } from "../../src/domain/projections.js";
import type { ExpenseClaim, HumanDecision } from "../../src/domain/reconciliation.js";
import { createFictionalEvidencePacket } from "../../src/fixtures/fictional-evidence.js";

const occurredAt = "2026-10-30T14:00:00.000Z";

function fixture() {
  const packet = createFictionalEvidencePacket();
  const agreement = extractAgreements(packet)[0];
  const payment = extractPayments(packet)[0];
  const taxiCitation = packet.sources[0]?.spans.find(({ text }) => text.includes("EUR 36 for a taxi"));
  assert.ok(agreement);
  assert.ok(payment);
  assert.ok(taxiCitation);
  const taxi: ExpenseClaim = {
    id: "taxi-expense",
    label: "taxi",
    payer: "Chen",
    amountMinor: "3600",
    currency: "EUR",
    status: "DOCUMENTED_CLAIM",
    citations: [taxiCitation],
  };
  return { packet, agreement, payment, taxi };
}

function decision(
  id: string,
  kind: HumanDecision["kind"],
  target: Pick<HumanDecision, "paymentId" | "agreementId" | "reversesDecisionId">,
): HumanDecision {
  return { id, kind, actor: "fictional-reviewer", occurredAt, ...target };
}

function confirmations(paymentId: string, agreementId: string): HumanDecision[] {
  return [
    decision("link-payment", "LINK_PAYMENT_TO_AGREEMENT", { paymentId, agreementId }),
    decision("confirm-receipt", "CONFIRM_PAYMENT_RECEIPT", { paymentId }),
  ];
}

function balance(
  views: ReturnType<typeof buildFinancialViews>,
  projection: "fromEvidence" | "afterConfirmations",
  participant: string,
  currency = "EUR",
) {
  return views[projection].balances.find((candidate) => candidate.participant === participant && candidate.currency === currency);
}

test("acceptance I: one evidence ledger produces consistent before and recomputed after-confirmation views", () => {
  const { packet, agreement, payment, taxi } = fixture();
  const views = buildFinancialViews({
    packet,
    agreements: [agreement],
    payments: [payment],
    expenses: [taxi],
    decisions: confirmations(payment.id, agreement.id),
  });
  assert.equal(balance(views, "fromEvidence", "Bea")?.amountMinor, "-10000");
  assert.equal(balance(views, "afterConfirmations", "Bea")?.amountMinor, "-6000");
  assert.equal(balance(views, "fromEvidence", "Chen")?.amountMinor, "-10000");
  assert.equal(balance(views, "afterConfirmations", "Chen")?.amountMinor, "-10000");
  assert.equal(views.fromEvidence.terms.find(({ paymentId }) => paymentId === payment.id)?.status, "UNRESOLVED");
  assert.equal(views.afterConfirmations.terms.find(({ paymentId }) => paymentId === payment.id)?.status, "CONFIRMED");
});

test("acceptance I: applied payment and balance explanations retain active reviewer provenance", () => {
  const { packet, agreement, payment } = fixture();
  const views = buildFinancialViews({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: confirmations(payment.id, agreement.id),
  });
  const paymentTerm = views.afterConfirmations.terms.find(({ paymentId }) => paymentId === payment.id);
  assert.deepEqual(paymentTerm?.decisionReferences.map(({ decisionId, active }) => ({ decisionId, active })), [
    { decisionId: "link-payment", active: true },
    { decisionId: "confirm-receipt", active: true },
  ]);
  assert.deepEqual(balance(views, "afterConfirmations", "Bea")?.decisionReferences.map(({ decisionId }) => decisionId), [
    "link-payment",
    "confirm-receipt",
  ]);
  assert.deepEqual(balance(views, "afterConfirmations", "Chen")?.decisionReferences, []);
});

test("acceptance G: conflicting payment claims are both disputed and leave conservative balances unchanged", () => {
  const { packet, agreement, payment } = fixture();
  const conversationClaim = packet.sources[0]?.spans.find(({ text }) => text.includes("I sent Alex EUR 40"));
  assert.ok(conversationClaim);
  const first: PaymentFinding = { ...payment, id: "conflict-payment-record", purpose: "accommodation", status: "CONFLICTING" };
  const second: PaymentFinding = { ...payment, id: "conflict-conversation", purpose: "accommodation", status: "CONFLICTING", citations: [conversationClaim] };
  const views = buildFinancialViews({ packet, agreements: [agreement], payments: [first, second] });
  const disputed = views.fromEvidence.terms.filter(({ kind }) => kind === "PAYMENT");
  assert.equal(disputed.length, 2);
  assert.equal(disputed.every(({ status, disposition }) => status === "DISPUTED" && disposition === "EXCLUDED"), true);
  assert.equal(balance(views, "fromEvidence", "Bea")?.amountMinor, "-10000");
  assert.equal(balance(views, "afterConfirmations", "Bea")?.amountMinor, "-10000");
});

test("excluded expense and unconfirmed transfer remain visible without affecting balances", () => {
  const { packet, agreement, payment, taxi } = fixture();
  const views = buildFinancialViews({ packet, agreements: [agreement], payments: [payment], expenses: [taxi] });
  const taxiTerm = views.fromEvidence.terms.find(({ expenseId }) => expenseId === taxi.id);
  const paymentTerm = views.fromEvidence.terms.find(({ paymentId }) => paymentId === payment.id);
  assert.equal(taxiTerm?.status, "EXCLUDED");
  assert.equal(taxiTerm?.reason, "MISSING_SHARING_AGREEMENT");
  assert.deepEqual(taxiTerm?.participants, [{ role: "PAYER", participant: "Chen" }]);
  assert.deepEqual(taxiTerm?.decisionReferences, []);
  assert.equal(paymentTerm?.disposition, "EXCLUDED");
  assert.equal(paymentTerm?.balanceEffects.length, 0);
  assert.equal(balance(views, "fromEvidence", "Bea")?.amountMinor, "-10000");
});

test("acceptance Q: every included balance term resolves to immutable packet citations", () => {
  const { packet, agreement, payment } = fixture();
  const views = buildFinancialViews({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: confirmations(payment.id, agreement.id),
  });
  for (const projection of [views.fromEvidence, views.afterConfirmations]) {
    for (const term of projection.terms.filter(({ disposition }) => disposition === "INCLUDED")) {
      assert.ok(term.evidenceReferences.length > 0);
      assert.equal(term.evidenceReferences.every((citation) => Boolean(resolveCitation(packet, citation))), true);
    }
    for (const explained of projection.balances) {
      assert.ok(explained.termIds.length > 0);
      assert.ok(explained.evidenceReferences.length > 0);
    }
  }
});

test("acceptance Q: missing or invented evidence is rejected before a projection exists", () => {
  const { packet, agreement } = fixture();
  assert.throws(() => buildFinancialViews({ packet, agreements: [{ ...agreement, citations: [] }], payments: [] }), /NON_EMPTY_ARRAY_REQUIRED/);
  const fabricated = structuredClone(agreement);
  if (fabricated.citations[0]) fabricated.citations[0].sourceId = "fabricated-source";
  assert.throws(() => buildFinancialViews({ packet, agreements: [fabricated], payments: [] }), /CITATION_DOES_NOT_RESOLVE/);
});

test("duplicate and conflicting decisions cannot create an after-confirmation view", () => {
  const { packet, agreement, payment } = fixture();
  const duplicate = decision("same", "CONFIRM_PAYMENT_RECEIPT", { paymentId: payment.id });
  assert.throws(() => buildFinancialViews({ packet, agreements: [agreement], payments: [payment], decisions: [duplicate, duplicate] }), /DUPLICATE_DECISION/);
  assert.throws(() => buildFinancialViews({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: [
      decision("confirm", "CONFIRM_PAYMENT_RECEIPT", { paymentId: payment.id }),
      decision("reject", "REJECT_PAYMENT_CLAIM", { paymentId: payment.id }),
    ],
  }), /CONTRADICTORY_DECISION/);
});

test("decision reversal preserves history and deterministically restores the unconfirmed balance", () => {
  const { packet, agreement, payment } = fixture();
  const views = buildFinancialViews({
    packet,
    agreements: [agreement],
    payments: [payment],
    decisions: [
      ...confirmations(payment.id, agreement.id),
      decision("reverse-receipt", "REVERSE_DECISION", { reversesDecisionId: "confirm-receipt" }),
    ],
  });
  assert.equal(balance(views, "afterConfirmations", "Bea")?.amountMinor, "-10000");
  const paymentTerm = views.afterConfirmations.terms.find(({ paymentId }) => paymentId === payment.id);
  assert.equal(paymentTerm?.status, "UNCONFIRMED");
  assert.deepEqual(paymentTerm?.decisionReferences.map(({ decisionId, active }) => ({ decisionId, active })), [
    { decisionId: "link-payment", active: true },
    { decisionId: "confirm-receipt", active: false },
    { decisionId: "reverse-receipt", active: true },
  ]);
});

test("dual projections preserve currency separation and deterministic recalculation", () => {
  const { packet: original, agreement, payment } = fixture();
  const packet = { ...original, currencies: ["EUR", "USD"] };
  const usdAgreement: AgreementFinding = { ...agreement, id: "usd-agreement", currency: "USD", amountMinor: "6000" };
  const usdPayment: PaymentFinding = { ...payment, id: "usd-payment", currency: "USD", amountMinor: "1000" };
  const input = {
    packet,
    agreements: [agreement, usdAgreement],
    payments: [usdPayment],
    decisions: confirmations(usdPayment.id, usdAgreement.id),
  };
  const first = buildFinancialViews(input);
  const second = buildFinancialViews(input);
  assert.deepEqual(first, second);
  assert.deepEqual([...new Set(first.afterConfirmations.balances.map(({ currency }) => currency))], ["EUR", "USD"]);
  for (const explained of first.afterConfirmations.balances) {
    assert.equal(explained.termIds.every((termId) => first.afterConfirmations.terms.find(({ id }) => id === termId)?.currency === explained.currency), true);
  }
});
