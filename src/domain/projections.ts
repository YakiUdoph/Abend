import { resolveCitation, type Citation, type EvidencePacket } from "./evidence.js";
import { SUPPORTED_CURRENCY_EXPONENTS, type SupportedCurrency } from "./ingestion.js";
import {
  reconcileLedger,
  type CurrencyBalance,
  type HumanDecision,
  type LedgerInput,
  type PaymentApplication,
  type ReconciliationLedger,
} from "./reconciliation.js";

export type ProjectionKind = "FROM_EVIDENCE" | "AFTER_CONFIRMATIONS";
export type ExplanationStatus = "CONFIRMED" | "UNCONFIRMED" | "DISPUTED" | "EXCLUDED" | "UNRESOLVED";

export type DecisionReference = {
  decisionId: string;
  kind: HumanDecision["kind"];
  actor: string;
  occurredAt: string;
  active: boolean;
  reversesDecisionId?: string;
};

export type ParticipantEffect = {
  participant: string;
  amountMinor: string;
};

export type AmountExplanation = {
  id: string;
  kind: "OBLIGATION" | "PAYMENT" | "EXPENSE" | "SPLIT";
  amountMinor: string;
  currency: string;
  exponent: number;
  participants: { role: "DEBTOR" | "CREDITOR" | "SENDER" | "RECIPIENT" | "PAYER"; participant: string }[];
  status: ExplanationStatus;
  disposition: "INCLUDED" | "EXCLUDED";
  reason: string;
  balanceEffects: ParticipantEffect[];
  evidenceReferences: Citation[];
  decisionReferences: DecisionReference[];
  agreementId?: string;
  paymentId?: string;
  expenseId?: string;
};

export type ExplainedBalance = CurrencyBalance & {
  termIds: string[];
  evidenceReferences: Citation[];
  decisionReferences: DecisionReference[];
};

export type FinancialProjection = {
  kind: ProjectionKind;
  label: "From the evidence" | "After confirmations";
  balances: ExplainedBalance[];
  terms: AmountExplanation[];
};

export type DualFinancialViews = {
  evidencePacketId: string;
  decisionHistory: HumanDecision[];
  fromEvidence: FinancialProjection;
  afterConfirmations: FinancialProjection;
};

function exponent(currency: string): number {
  if (!(currency in SUPPORTED_CURRENCY_EXPONENTS)) throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
  return SUPPORTED_CURRENCY_EXPONENTS[currency as SupportedCurrency];
}

function citationKey(citation: Citation): string {
  return [citation.sourceId, citation.start, citation.end, citation.excerptHash].join(":");
}

function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = citationKey(citation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decisionReferences(
  decisions: HumanDecision[],
  paymentId?: string,
  agreementId?: string,
): DecisionReference[] {
  const relevantIds = new Set(
    decisions
      .filter((decision) =>
        (paymentId !== undefined && decision.paymentId === paymentId)
        || (agreementId !== undefined && decision.agreementId === agreementId),
      )
      .map(({ id }) => id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const decision of decisions) {
      if (decision.reversesDecisionId && relevantIds.has(decision.reversesDecisionId) && !relevantIds.has(decision.id)) {
        relevantIds.add(decision.id);
        changed = true;
      }
    }
  }
  const reversed = new Set(
    decisions
      .filter(({ kind, reversesDecisionId }) => kind === "REVERSE_DECISION" && Boolean(reversesDecisionId))
      .map(({ reversesDecisionId }) => reversesDecisionId as string),
  );
  return decisions.filter(({ id }) => relevantIds.has(id)).map((decision) => ({
    decisionId: decision.id,
    kind: decision.kind,
    actor: decision.actor,
    occurredAt: decision.occurredAt,
    active: !reversed.has(decision.id),
    ...(decision.reversesDecisionId ? { reversesDecisionId: decision.reversesDecisionId } : {}),
  }));
}

function paymentStatus(
  application: PaymentApplication,
  ledger: ReconciliationLedger,
): ExplanationStatus {
  const payment = ledger.payments.find(({ id }) => id === application.paymentId);
  if (payment?.status === "CONFLICTING" || payment?.transferState === "DISPUTED") return "DISPUTED";
  if (application.status === "APPLIED") return "CONFIRMED";
  if (application.status === "REJECTED" || application.status === "DUPLICATE" || application.reason === "CURRENCY_MISMATCH") return "EXCLUDED";
  if (application.reason === "PAYMENT_NOT_CONFIRMED") return "UNCONFIRMED";
  return "UNRESOLVED";
}

function explanationTerms(
  packet: EvidencePacket,
  ledger: ReconciliationLedger,
): AmountExplanation[] {
  const terms: AmountExplanation[] = [];
  for (const obligation of ledger.obligations) {
    const agreement = ledger.agreements.find(({ id }) => id === obligation.agreementId);
    const decisions = decisionReferences(ledger.decisions, undefined, obligation.agreementId).filter(
      ({ kind }) => kind === "CONFIRM_EVIDENCE_SUPPORTED_SPLIT"
        || kind === "MARK_SPLIT_UNRESOLVED"
        || kind === "REVERSE_DECISION",
    );
    terms.push({
      id: `term:obligation:${obligation.id}`,
      kind: "OBLIGATION",
      amountMinor: obligation.originalMinor,
      currency: obligation.currency,
      exponent: obligation.exponent,
      participants: [
        { role: "DEBTOR", participant: obligation.debtor },
        { role: "CREDITOR", participant: obligation.creditor },
      ],
      status: agreement?.status === "USER_CONFIRMED" ? "CONFIRMED" : "UNCONFIRMED",
      disposition: "INCLUDED",
      reason: agreement?.status === "USER_CONFIRMED" ? "SPLIT_USER_CONFIRMED" : "DOCUMENTED_SHARING_AGREEMENT",
      balanceEffects: [
        { participant: obligation.debtor, amountMinor: (-BigInt(obligation.originalMinor)).toString() },
        { participant: obligation.creditor, amountMinor: obligation.originalMinor },
      ],
      evidenceReferences: uniqueCitations(obligation.citations),
      decisionReferences: decisions,
      agreementId: obligation.agreementId,
    });
  }

  for (const application of ledger.paymentApplications) {
    const payment = ledger.payments.find(({ id }) => id === application.paymentId);
    if (!payment) throw new Error(`MISSING_PAYMENT_FOR_APPLICATION:${application.paymentId}`);
    const included = BigInt(application.appliedMinor) > 0n;
    const decisions = decisionReferences(ledger.decisions, payment.id, application.agreementId);
    terms.push({
      id: `term:payment:${payment.id}`,
      kind: "PAYMENT",
      amountMinor: application.claimedMinor,
      currency: application.currency,
      exponent: exponent(application.currency),
      participants: [
        { role: "SENDER", participant: payment.sender },
        { role: "RECIPIENT", participant: payment.recipient },
      ],
      status: paymentStatus(application, ledger),
      disposition: included ? "INCLUDED" : "EXCLUDED",
      reason: application.reason,
      balanceEffects: included
        ? [
            { participant: payment.sender, amountMinor: application.appliedMinor },
            { participant: payment.recipient, amountMinor: (-BigInt(application.appliedMinor)).toString() },
          ]
        : [],
      evidenceReferences: uniqueCitations(application.citations),
      decisionReferences: decisions,
      ...(application.agreementId ? { agreementId: application.agreementId } : {}),
      paymentId: payment.id,
    });
  }

  for (const unresolved of ledger.unresolved.filter(({ kind }) => kind !== "PAYMENT")) {
    const agreementId = unresolved.kind === "SPLIT" ? unresolved.id.replace("unresolved:split:", "") : undefined;
    const expenseId = unresolved.kind === "EXPENSE" ? unresolved.id.replace("unresolved:expense:", "") : undefined;
    const agreement = agreementId ? ledger.agreements.find(({ id }) => id === agreementId) : undefined;
    const expense = expenseId ? ledger.expenses.find(({ id }) => id === expenseId) : undefined;
    terms.push({
      id: `term:${unresolved.kind.toLowerCase()}:${unresolved.id}`,
      kind: unresolved.kind,
      amountMinor: unresolved.amountMinor,
      currency: unresolved.currency,
      exponent: exponent(unresolved.currency),
      participants: agreement
        ? [{ role: "PAYER", participant: agreement.payer }]
        : expense
          ? [{ role: "PAYER", participant: expense.payer }]
          : [],
      status: agreement?.status === "CONFLICTING" ? "DISPUTED" : "EXCLUDED",
      disposition: "EXCLUDED",
      reason: unresolved.reason,
      balanceEffects: [],
      evidenceReferences: uniqueCitations(unresolved.citations),
      decisionReferences: decisionReferences(ledger.decisions, undefined, agreementId),
      ...(agreementId ? { agreementId } : {}),
      ...(expenseId ? { expenseId } : {}),
    });
  }

  for (const term of terms) {
    if (term.evidenceReferences.length === 0) throw new Error(`EXPLANATION_MISSING_EVIDENCE:${term.id}`);
    for (const citation of term.evidenceReferences) {
      if (!resolveCitation(packet, citation)) throw new Error(`EXPLANATION_INVALID_CITATION:${term.id}`);
    }
  }
  return terms;
}

function explainBalances(ledger: ReconciliationLedger, terms: AmountExplanation[]): ExplainedBalance[] {
  return ledger.balances.map((balance) => {
    const contributing = terms.filter((term) =>
      term.disposition === "INCLUDED" &&
      term.currency === balance.currency &&
      term.balanceEffects.some(({ participant, amountMinor }) => participant === balance.participant && BigInt(amountMinor) !== 0n),
    );
    const explained = contributing.reduce((sum, term) => {
      const effect = term.balanceEffects.find(({ participant }) => participant === balance.participant);
      return sum + BigInt(effect?.amountMinor ?? "0");
    }, 0n);
    if (explained !== BigInt(balance.amountMinor)) throw new Error(`UNEXPLAINED_BALANCE:${balance.currency}:${balance.participant}`);
    return {
      ...balance,
      termIds: contributing.map(({ id }) => id),
      evidenceReferences: uniqueCitations(contributing.flatMap(({ evidenceReferences }) => evidenceReferences)),
      decisionReferences: contributing.flatMap(({ decisionReferences }) => decisionReferences)
        .filter((reference, index, all) => all.findIndex(({ decisionId }) => decisionId === reference.decisionId) === index),
    };
  });
}

function buildProjection(
  packet: EvidencePacket,
  ledger: ReconciliationLedger,
  kind: ProjectionKind,
): FinancialProjection {
  const terms = explanationTerms(packet, ledger);
  return {
    kind,
    label: kind === "FROM_EVIDENCE" ? "From the evidence" : "After confirmations",
    balances: explainBalances(ledger, terms),
    terms,
  };
}

export function buildFinancialViews(input: LedgerInput): DualFinancialViews {
  const evidenceLedger = reconcileLedger({
    packet: input.packet,
    agreements: input.agreements,
    payments: input.payments,
    ...(input.expenses ? { expenses: input.expenses } : {}),
    decisions: [],
  });
  const confirmedLedger = reconcileLedger(input);
  return {
    evidencePacketId: input.packet.id,
    decisionHistory: (input.decisions ?? []).map((decision) => ({ ...decision })),
    fromEvidence: buildProjection(input.packet, evidenceLedger, "FROM_EVIDENCE"),
    afterConfirmations: buildProjection(input.packet, confirmedLedger, "AFTER_CONFIRMATIONS"),
  };
}
