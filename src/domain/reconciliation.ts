import type { Citation, EvidencePacket } from "./evidence.js";
import { resolveCitation } from "./evidence.js";
import type { AgreementFinding, PaymentFinding } from "./findings.js";
import { validateFinding } from "./findings.js";
import { SUPPORTED_CURRENCY_EXPONENTS, type SupportedCurrency } from "./ingestion.js";

export type Participant = { id: string };
export type EvidenceReference = Citation;
export type Money = { amountMinor: string; currency: SupportedCurrency; exponent: number };

export type ExpenseClaim = {
  id: string;
  label: string;
  payer: string;
  amountMinor: string;
  currency: SupportedCurrency;
  status: "DOCUMENTED_CLAIM" | "USER_CONFIRMED" | "CONFLICTING" | "UNRESOLVED";
  citations: Citation[];
};

export type SharingAgreement = AgreementFinding;
export type PaymentClaim = PaymentFinding;
export type PaymentConfirmation = {
  paymentId: string;
  decisionId: string;
  actor: string;
  occurredAt: string;
};

export type HumanDecisionKind =
  | "CONFIRM_PAYMENT_RECEIPT"
  | "REJECT_PAYMENT_CLAIM"
  | "LINK_PAYMENT_TO_AGREEMENT"
  | "MARK_SPLIT_UNRESOLVED"
  | "CONFIRM_EVIDENCE_SUPPORTED_SPLIT"
  | "REVERSE_DECISION";

export type HumanDecision = {
  id: string;
  kind: HumanDecisionKind;
  actor: string;
  occurredAt: string;
  paymentId?: string;
  agreementId?: string;
  reversesDecisionId?: string;
};

export type DecisionEffect = {
  decisionId: string;
  kind: HumanDecisionKind;
  targetId: string;
  effect: string;
};

export type ShareAllocation = {
  participant: string;
  amountMinor: string;
  remainderMinor: "0" | "1";
};

export type Obligation = {
  id: string;
  debtor: string;
  creditor: string;
  amountMinor: string;
  originalMinor: string;
  appliedMinor: string;
  outstandingMinor: string;
  currency: string;
  exponent: number;
  agreementId: string;
  citations: Citation[];
};

export type PaymentApplication = {
  paymentId: string;
  agreementId?: string;
  obligationId?: string;
  status: "APPLIED" | "UNRESOLVED" | "REJECTED" | "DUPLICATE";
  reason:
    | "PAYMENT_RECEIVED"
    | "PAYMENT_NOT_CONFIRMED"
    | "AMBIGUOUS_PURPOSE"
    | "CURRENCY_MISMATCH"
    | "NO_MATCHING_OBLIGATION"
    | "DUPLICATE_PAYMENT"
    | "PAYMENT_REJECTED"
    | "OVERPAYMENT";
  claimedMinor: string;
  appliedMinor: string;
  unresolvedMinor: string;
  currency: string;
  citations: Citation[];
};

export type UnresolvedDispute = {
  id: string;
  kind: "EXPENSE" | "PAYMENT" | "SPLIT";
  reason: string;
  amountMinor: string;
  currency: string;
  citations: Citation[];
};

export type CurrencyBalance = {
  participant: string;
  currency: string;
  exponent: number;
  amountMinor: string;
};

export type ReconciliationResult = {
  id: string;
  agreementId: string;
  paymentId: string;
  outcome: "SUPPORTED" | "UNRESOLVED";
  reason: PaymentApplication["reason"];
  appliedMinor: string;
  currency: string;
  clarification?: string;
  citations: Citation[];
};

export type LedgerInput = {
  packet: EvidencePacket;
  agreements: AgreementFinding[];
  payments: PaymentFinding[];
  expenses?: ExpenseClaim[];
  decisions?: HumanDecision[];
};

export type ReconciliationLedger = {
  participants: Participant[];
  expenses: ExpenseClaim[];
  agreements: AgreementFinding[];
  payments: PaymentFinding[];
  shares: Record<string, ShareAllocation[]>;
  obligations: Obligation[];
  paymentApplications: PaymentApplication[];
  reconciliations: ReconciliationResult[];
  unresolved: UnresolvedDispute[];
  balances: CurrencyBalance[];
  decisions: HumanDecision[];
  decisionEffects: DecisionEffect[];
};

function requirePositiveMinor(value: string, path: string): bigint {
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) throw new Error(`INVALID_MINOR_UNIT_AMOUNT:${path}`);
  return BigInt(value);
}

function currencyExponent(currency: string): number {
  if (!(currency in SUPPORTED_CURRENCY_EXPONENTS)) throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
  return SUPPORTED_CURRENCY_EXPONENTS[currency as SupportedCurrency];
}

function validateExpense(packet: EvidencePacket, expense: ExpenseClaim): void {
  requirePositiveMinor(expense.amountMinor, `expense:${expense.id}`);
  currencyExponent(expense.currency);
  if (!(packet.currencies ?? []).includes(expense.currency)) throw new Error(`UNDECLARED_CURRENCY:${expense.currency}`);
  if (!(expense.payer in (packet.participantAliases ?? {}))) throw new Error(`UNKNOWN_PARTICIPANT:${expense.payer}`);
  if (expense.citations.length === 0) throw new Error(`MISSING_EVIDENCE:${expense.id}`);
  for (const citation of expense.citations) {
    if (!resolveCitation(packet, citation)) throw new Error(`INVALID_CITATION:${expense.id}`);
  }
}

// Equal-split rounding policy: allocate floor(total / participant count) to everyone,
// then allocate one remaining minor unit to each earliest participant in the
// evidence-supported agreement order until the remainder is exhausted.
export function allocateEqualShares(agreement: AgreementFinding): ShareAllocation[] {
  const amount = requirePositiveMinor(agreement.amountMinor, `agreement:${agreement.id}`);
  if (agreement.participants.length < 2) throw new Error(`INVALID_AGREEMENT_PARTICIPANTS:${agreement.id}`);
  const count = BigInt(agreement.participants.length);
  const base = amount / count;
  const remainder = Number(amount % count);
  return agreement.participants.map((participant, index) => {
    const extra = index < remainder ? 1n : 0n;
    return { participant, amountMinor: (base + extra).toString(), remainderMinor: extra === 1n ? "1" : "0" };
  });
}

export function calculateObligations(agreement: AgreementFinding): Obligation[] {
  if (agreement.status === "CONFLICTING" || agreement.status === "UNRESOLVED") return [];
  const exponent = currencyExponent(agreement.currency);
  return allocateEqualShares(agreement)
    .filter(({ participant }) => participant !== agreement.payer)
    .map(({ participant, amountMinor }) => ({
      id: `obligation:${agreement.id}:${participant}:${agreement.payer}:${agreement.currency}`,
      debtor: participant,
      creditor: agreement.payer,
      amountMinor,
      originalMinor: amountMinor,
      appliedMinor: "0",
      outstandingMinor: amountMinor,
      currency: agreement.currency,
      exponent,
      agreementId: agreement.id,
      citations: [...agreement.citations],
    }));
}

function applyDecisions(
  agreements: AgreementFinding[],
  payments: PaymentFinding[],
  decisions: HumanDecision[],
): { agreements: AgreementFinding[]; payments: PaymentFinding[]; effects: DecisionEffect[]; rejected: Set<string> } {
  const agreementById = new Map(agreements.map((item) => [item.id, structuredClone(item)]));
  const paymentById = new Map(payments.map((item) => [item.id, structuredClone(item)]));
  const effects: DecisionEffect[] = [];
  const rejected = new Set<string>();
  const confirmed = new Set<string>();
  const splitConfirmed = new Set<string>();
  const splitUnresolved = new Set<string>();
  const links = new Map<string, string>();
  const decisionIds = new Set<string>();
  const knownDecisions = new Map<string, HumanDecision>();
  const reversedDecisionIds = new Set<string>();

  for (const decision of decisions) {
    if (!decision.id || decisionIds.has(decision.id)) throw new Error(`DUPLICATE_DECISION:${decision.id}`);
    if (!decision.actor || !decision.occurredAt || Number.isNaN(Date.parse(decision.occurredAt))) throw new Error(`INVALID_DECISION_AUDIT:${decision.id}`);
    decisionIds.add(decision.id);
    if (decision.kind === "REVERSE_DECISION") {
      const targetId = decision.reversesDecisionId;
      const target = targetId ? knownDecisions.get(targetId) : undefined;
      if (!target || target.kind === "REVERSE_DECISION") throw new Error(`INVALID_REVERSAL:${decision.id}`);
      if (reversedDecisionIds.has(target.id)) throw new Error(`DUPLICATE_REVERSAL:${decision.id}`);
      reversedDecisionIds.add(target.id);
    }
    knownDecisions.set(decision.id, decision);
  }

  for (const decision of decisions) {
    if (decision.kind === "REVERSE_DECISION") {
      effects.push({ decisionId: decision.id, kind: decision.kind, targetId: decision.reversesDecisionId ?? "", effect: "prior decision reversed" });
      continue;
    }
    if (reversedDecisionIds.has(decision.id)) continue;
    const payment = decision.paymentId ? paymentById.get(decision.paymentId) : undefined;
    const agreement = decision.agreementId ? agreementById.get(decision.agreementId) : undefined;

    if (decision.kind === "CONFIRM_PAYMENT_RECEIPT") {
      if (!payment) throw new Error(`UNKNOWN_PAYMENT:${decision.paymentId ?? ""}`);
      if (rejected.has(payment.id)) throw new Error(`CONTRADICTORY_DECISION:${decision.id}`);
      confirmed.add(payment.id);
      payment.status = "USER_CONFIRMED";
      payment.transferState = "RECEIVED";
      effects.push({ decisionId: decision.id, kind: decision.kind, targetId: payment.id, effect: "receipt confirmed" });
    } else if (decision.kind === "REJECT_PAYMENT_CLAIM") {
      if (!payment) throw new Error(`UNKNOWN_PAYMENT:${decision.paymentId ?? ""}`);
      if (confirmed.has(payment.id)) throw new Error(`CONTRADICTORY_DECISION:${decision.id}`);
      rejected.add(payment.id);
      payment.status = "USER_CONFIRMED";
      payment.transferState = "REJECTED";
      effects.push({ decisionId: decision.id, kind: decision.kind, targetId: payment.id, effect: "claim rejected; no amount applied" });
    } else if (decision.kind === "LINK_PAYMENT_TO_AGREEMENT") {
      if (!payment) throw new Error(`UNKNOWN_PAYMENT:${decision.paymentId ?? ""}`);
      if (!agreement) throw new Error(`UNKNOWN_AGREEMENT:${decision.agreementId ?? ""}`);
      const prior = links.get(payment.id);
      if (prior && prior !== agreement.id) throw new Error(`CONTRADICTORY_DECISION:${decision.id}`);
      links.set(payment.id, agreement.id);
      payment.obligationId = agreement.id;
      effects.push({ decisionId: decision.id, kind: decision.kind, targetId: payment.id, effect: `linked to ${agreement.id}` });
    } else if (decision.kind === "MARK_SPLIT_UNRESOLVED") {
      if (!agreement) throw new Error(`UNKNOWN_AGREEMENT:${decision.agreementId ?? ""}`);
      if (splitConfirmed.has(agreement.id)) throw new Error(`CONTRADICTORY_DECISION:${decision.id}`);
      splitUnresolved.add(agreement.id);
      agreement.status = "UNRESOLVED";
      effects.push({ decisionId: decision.id, kind: decision.kind, targetId: agreement.id, effect: "split excluded as unresolved" });
    } else if (decision.kind === "CONFIRM_EVIDENCE_SUPPORTED_SPLIT") {
      if (!agreement) throw new Error(`UNKNOWN_AGREEMENT:${decision.agreementId ?? ""}`);
      if (splitUnresolved.has(agreement.id)) throw new Error(`CONTRADICTORY_DECISION:${decision.id}`);
      splitConfirmed.add(agreement.id);
      agreement.status = "USER_CONFIRMED";
      effects.push({ decisionId: decision.id, kind: decision.kind, targetId: agreement.id, effect: "evidence-supported split confirmed" });
    } else {
      throw new Error(`INVALID_DECISION_KIND:${decision.id}`);
    }
  }
  return { agreements: [...agreementById.values()], payments: [...paymentById.values()], effects, rejected };
}

function paymentFingerprint(payment: PaymentFinding): string {
  const citations = payment.citations.map(({ sourceId, start, end }) => `${sourceId}:${start}:${end}`).sort().join(",");
  return [payment.sender, payment.recipient, payment.amountMinor, payment.currency, citations].join("|");
}

function paymentClarification(payment: PaymentFinding, reason: PaymentApplication["reason"]): string {
  if (reason === "PAYMENT_NOT_CONFIRMED") return `Did ${payment.recipient} receive the ${payment.currency} ${formatMinor(payment.amountMinor, currencyExponent(payment.currency))} transfer from ${payment.sender}?`;
  if (reason === "CURRENCY_MISMATCH") return `Which same-currency obligation should this ${payment.currency} transfer be linked to?`;
  if (reason === "OVERPAYMENT") return "How should the amount above the supported obligation be treated?";
  return `What was the ${payment.currency} ${formatMinor(payment.amountMinor, currencyExponent(payment.currency))} transfer from ${payment.sender} to ${payment.recipient} for, and was it received?`;
}

export function reconcileLedger(input: LedgerInput): ReconciliationLedger {
  const decisions = input.decisions ?? [];
  input.agreements.forEach((finding, index) => validateFinding(input.packet, finding, `$.agreements[${index}]`));
  input.payments.forEach((finding, index) => validateFinding(input.packet, finding, `$.payments[${index}]`));
  for (const expense of input.expenses ?? []) validateExpense(input.packet, expense);

  const transformed = applyDecisions(input.agreements, input.payments, decisions);
  const activeAgreements = transformed.agreements.filter((agreement) => agreement.status !== "CONFLICTING" && agreement.status !== "UNRESOLVED");
  const shares = Object.fromEntries(activeAgreements.map((agreement) => [agreement.id, allocateEqualShares(agreement)]));
  const obligations = activeAgreements.flatMap(calculateObligations);
  const unresolved: UnresolvedDispute[] = [];

  for (const agreement of transformed.agreements.filter((item) => item.status === "CONFLICTING" || item.status === "UNRESOLVED")) {
    unresolved.push({ id: `unresolved:split:${agreement.id}`, kind: "SPLIT", reason: "SPLIT_NOT_SUPPORTED", amountMinor: agreement.amountMinor, currency: agreement.currency, citations: [...agreement.citations] });
  }
  for (const expense of input.expenses ?? []) {
    const matched = activeAgreements.some((agreement) => agreement.payer === expense.payer && agreement.currency === expense.currency && agreement.amountMinor === expense.amountMinor && agreement.expenseLabel.toLowerCase() === expense.label.toLowerCase());
    if (!matched) unresolved.push({ id: `unresolved:expense:${expense.id}`, kind: "EXPENSE", reason: "MISSING_SHARING_AGREEMENT", amountMinor: expense.amountMinor, currency: expense.currency, citations: [...expense.citations] });
  }

  const paymentApplications: PaymentApplication[] = [];
  const reconciliations: ReconciliationResult[] = [];
  const fingerprints = new Set<string>();
  const obligationById = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  for (const payment of transformed.payments) {
    const fingerprint = paymentFingerprint(payment);
    let application: PaymentApplication;
    const linkedAgreement = payment.obligationId
      ? activeAgreements.find((candidate) => candidate.id === payment.obligationId || calculateObligations(candidate).some(({ id }) => id === payment.obligationId))
      : undefined;
    const purposeAgreement = activeAgreements.find((candidate) => payment.purpose.toLowerCase().includes(candidate.expenseLabel.toLowerCase()));
    const partyAgreement = activeAgreements.find((candidate) => calculateObligations(candidate).some((obligation) => obligation.debtor === payment.sender && obligation.creditor === payment.recipient && obligation.currency === payment.currency));
    const agreement = linkedAgreement ?? purposeAgreement ?? partyAgreement;
    const purposeSupported = Boolean(linkedAgreement ?? purposeAgreement);

    if (fingerprints.has(fingerprint)) {
      application = { paymentId: payment.id, status: "DUPLICATE", reason: "DUPLICATE_PAYMENT", claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...payment.citations] };
    } else if (transformed.rejected.has(payment.id) || payment.transferState === "REJECTED") {
      application = { paymentId: payment.id, status: "REJECTED", reason: "PAYMENT_REJECTED", claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...payment.citations] };
    } else if (!agreement) {
      const incompatibleLink = payment.obligationId ? transformed.agreements.find((candidate) => candidate.id === payment.obligationId) : undefined;
      const reason = incompatibleLink && incompatibleLink.currency !== payment.currency ? "CURRENCY_MISMATCH" : "AMBIGUOUS_PURPOSE";
      application = { paymentId: payment.id, ...(incompatibleLink ? { agreementId: incompatibleLink.id } : {}), status: "UNRESOLVED", reason, claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...payment.citations] };
    } else if (agreement.currency !== payment.currency) {
      application = { paymentId: payment.id, agreementId: agreement.id, status: "UNRESOLVED", reason: "CURRENCY_MISMATCH", claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...agreement.citations, ...payment.citations] };
    } else if (!purposeSupported) {
      application = { paymentId: payment.id, agreementId: agreement.id, status: "UNRESOLVED", reason: "AMBIGUOUS_PURPOSE", claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...agreement.citations, ...payment.citations] };
    } else {
      const obligation = obligations.find((candidate) => candidate.agreementId === agreement.id && candidate.debtor === payment.sender && candidate.creditor === payment.recipient && candidate.currency === payment.currency);
      const receiptConfirmed = payment.status === "USER_CONFIRMED" || payment.status === "INDEPENDENTLY_VERIFIED";
      if (!obligation) {
        application = { paymentId: payment.id, agreementId: agreement.id, status: "UNRESOLVED", reason: "NO_MATCHING_OBLIGATION", claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...agreement.citations, ...payment.citations] };
      } else if (!receiptConfirmed) {
        application = { paymentId: payment.id, agreementId: agreement.id, obligationId: obligation.id, status: "UNRESOLVED", reason: "PAYMENT_NOT_CONFIRMED", claimedMinor: payment.amountMinor, appliedMinor: "0", unresolvedMinor: payment.amountMinor, currency: payment.currency, citations: [...agreement.citations, ...payment.citations] };
      } else {
        const outstanding = BigInt(obligation.outstandingMinor);
        const claimed = BigInt(payment.amountMinor);
        const applied = claimed < outstanding ? claimed : outstanding;
        const excess = claimed - applied;
        obligation.appliedMinor = (BigInt(obligation.appliedMinor) + applied).toString();
        obligation.outstandingMinor = (outstanding - applied).toString();
        obligation.amountMinor = obligation.outstandingMinor;
        obligationById.set(obligation.id, obligation);
        application = { paymentId: payment.id, agreementId: agreement.id, obligationId: obligation.id, status: excess === 0n ? "APPLIED" : "UNRESOLVED", reason: excess === 0n ? "PAYMENT_RECEIVED" : "OVERPAYMENT", claimedMinor: payment.amountMinor, appliedMinor: applied.toString(), unresolvedMinor: excess.toString(), currency: payment.currency, citations: [...agreement.citations, ...payment.citations] };
      }
    }
    fingerprints.add(fingerprint);
    paymentApplications.push(application);
    if (application.status === "UNRESOLVED" || application.status === "DUPLICATE" || application.status === "REJECTED") unresolved.push({ id: `unresolved:payment:${payment.id}`, kind: "PAYMENT", reason: application.reason, amountMinor: application.unresolvedMinor, currency: payment.currency, citations: [...application.citations] });
    if (application.agreementId) {
      reconciliations.push({
        id: `reconciliation:${application.agreementId}:${payment.id}`,
        agreementId: application.agreementId,
        paymentId: payment.id,
        outcome: application.status === "APPLIED" ? "SUPPORTED" : "UNRESOLVED",
        reason: application.reason,
        appliedMinor: application.appliedMinor,
        currency: payment.currency,
        ...(application.status === "APPLIED" ? {} : { clarification: paymentClarification(payment, application.reason) }),
        citations: [...application.citations],
      });
    }
  }

  const balanceMap = new Map<string, bigint>();
  for (const obligation of obligationById.values()) {
    const outstanding = BigInt(obligation.outstandingMinor);
    const debtorKey = `${obligation.currency}|${obligation.debtor}`;
    const creditorKey = `${obligation.currency}|${obligation.creditor}`;
    balanceMap.set(debtorKey, (balanceMap.get(debtorKey) ?? 0n) - outstanding);
    balanceMap.set(creditorKey, (balanceMap.get(creditorKey) ?? 0n) + outstanding);
  }
  const balances = [...balanceMap.entries()].map(([key, amount]) => {
    const [currency = "", participant = ""] = key.split("|");
    return { participant, currency, exponent: currencyExponent(currency), amountMinor: amount.toString() };
  }).sort((a, b) => a.currency.localeCompare(b.currency) || a.participant.localeCompare(b.participant));

  return {
    participants: Object.keys(input.packet.participantAliases ?? {}).map((id) => ({ id })),
    expenses: (input.expenses ?? []).map((expense) => structuredClone(expense)),
    agreements: transformed.agreements,
    payments: transformed.payments,
    shares,
    obligations: [...obligationById.values()],
    paymentApplications,
    reconciliations,
    unresolved,
    balances,
    decisions: decisions.map((decision) => ({ ...decision })),
    decisionEffects: transformed.effects,
  };
}

// Compatibility helper retained for the runtime's pair-level event contract.
export function reconcilePair(agreement: AgreementFinding, payment: PaymentFinding): ReconciliationResult | undefined {
  const obligation = calculateObligations(agreement).find((candidate) => candidate.debtor === payment.sender && candidate.creditor === payment.recipient && candidate.currency === payment.currency);
  if (!obligation) return undefined;
  const purposeMatches = payment.obligationId === agreement.id || payment.purpose.toLowerCase().includes(agreement.expenseLabel.toLowerCase());
  const received = payment.status === "USER_CONFIRMED" || payment.status === "INDEPENDENTLY_VERIFIED";
  const reason: PaymentApplication["reason"] = !purposeMatches ? "AMBIGUOUS_PURPOSE" : received ? "PAYMENT_RECEIVED" : "PAYMENT_NOT_CONFIRMED";
  const applied = purposeMatches && received ? (BigInt(payment.amountMinor) < BigInt(obligation.amountMinor) ? payment.amountMinor : obligation.amountMinor) : "0";
  return {
    id: `reconciliation:${agreement.id}:${payment.id}`,
    agreementId: agreement.id,
    paymentId: payment.id,
    outcome: purposeMatches && received ? "SUPPORTED" : "UNRESOLVED",
    reason,
    appliedMinor: applied,
    currency: payment.currency,
    ...(purposeMatches && received ? {} : { clarification: paymentClarification(payment, reason) }),
    citations: [...agreement.citations, ...payment.citations],
  };
}

function formatMinor(value: string, exponent: number): string {
  const minor = BigInt(value);
  if (exponent === 0) return minor.toString();
  const scale = 10n ** BigInt(exponent);
  return `${minor / scale}.${(minor % scale).toString().padStart(exponent, "0")}`;
}
