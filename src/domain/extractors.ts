import { createHash } from "node:crypto";
import type { Citation, EvidencePacket, SourceSpan } from "./evidence.js";
import type { AgreementFinding, PaymentFinding } from "./findings.js";
import { SUPPORTED_CURRENCY_EXPONENTS, type SupportedCurrency } from "./ingestion.js";
import type { ExpenseClaim } from "./reconciliation.js";

function stableId(prefix: string, values: string[]): string {
  return `${prefix}-${createHash("sha256").update(values.join("|")).digest("hex").slice(0, 12)}`;
}

function toMinorUnits(value: string, currency: string): string {
  if (!(currency in SUPPORTED_CURRENCY_EXPONENTS)) throw new Error(`Unsupported currency: ${currency}`);
  const exponent = SUPPORTED_CURRENCY_EXPONENTS[currency as SupportedCurrency];
  const match = (exponent === 0 ? /^(\d+)$/ : new RegExp(`^(\\d+)(?:\\.(\\d{1,${exponent}}))?$`)).exec(value);
  if (!match?.[1]) throw new Error(`Unsupported money value: ${value}`);
  const scale = 10n ** BigInt(exponent);
  return (BigInt(match[1]) * scale + BigInt((match[2] ?? "").padEnd(exponent, "0") || "0")).toString();
}

function citation(span: SourceSpan): Citation {
  return { ...span };
}

export function extractAgreements(packet: EvidencePacket): AgreementFinding[] {
  const spans = packet.sources.flatMap((source) => source.spans);
  const findings: AgreementFinding[] = [];

  for (const source of packet.sources.filter(({ evidenceType }) => evidenceType === "EXPENSE_RECORD")) {
    const values = Object.fromEntries(source.spans.map((span) => {
      const separator = span.text.indexOf(":");
      return separator < 0 ? [span.text, ""] : [span.text.slice(0, separator), span.text.slice(separator + 1).trim()];
    }));
    const money = /^(?<currency>[A-Z]{3}) (?<amount>\d+(?:\.\d+)?)$/.exec(values.Amount ?? "");
    const shares = (values.Shares ?? "").split(" | ").filter(Boolean).map((entry) => {
      const separator = entry.lastIndexOf("=");
      return { participant: entry.slice(0, separator), amount: entry.slice(separator + 1) };
    });
    if (!values.Expense || !values.Payer || values.Split !== "EXACT" || !money?.groups?.currency || !money.groups.amount || shares.length < 2 || shares.some(({ participant, amount }) => !participant || !amount)) continue;
    const amountMinor = toMinorUnits(money.groups.amount, money.groups.currency);
    findings.push({
      kind: "agreement",
      id: stableId("agreement", [source.id, values.Payer, money.groups.currency, amountMinor]),
      expenseLabel: values.Expense.toLowerCase(),
      payer: values.Payer,
      participants: shares.map(({ participant }) => participant),
      amountMinor,
      currency: money.groups.currency,
      split: "EXACT",
      shares: shares.map(({ participant, amount }) => ({ participant, amountMinor: toMinorUnits(amount, money.groups!.currency!) })),
      status: "DOCUMENTED_CLAIM",
      uncertainty: "The submitted structured record explicitly allocates these shares; it is not independently verified.",
      citations: source.spans.map(citation),
    });
  }

  for (const paymentSpan of spans) {
    const expense = /^(?<payer>[A-Za-z]+):\s+I paid (?<currency>[A-Z]{3}) (?<amount>\d+(?:\.\d{1,2})?) for (?:the )?(?<label>accommodation)\.$/i.exec(
      paymentSpan.text,
    );
    if (!expense?.groups) continue;

    const agreementSpan = spans.find((span) =>
      /^(?<speaker>[A-Za-z]+):\s+(?<people>[A-Za-z]+(?:, [A-Za-z]+)*(?:,? and [A-Za-z]+)) agreed to split the accommodation equally\.$/i.test(
        span.text,
      ),
    );
    if (!agreementSpan) continue;
    const agreement = /^(?:[A-Za-z]+):\s+(?<people>[A-Za-z]+(?:, [A-Za-z]+)*(?:,? and [A-Za-z]+)) agreed to split the accommodation equally\.$/i.exec(
      agreementSpan.text,
    );
    const peopleText = agreement?.groups?.people;
    if (!peopleText) continue;
    const participants = peopleText
      .replace(/,? and /i, ", ")
      .split(", ")
      .map((person) => person.trim())
      .filter(Boolean);
    const { payer, currency: rawCurrency, amount, label } = expense.groups;
    if (!payer || !rawCurrency || !amount || !label) continue;
    const currency = rawCurrency.toUpperCase();
    const amountMinor = toMinorUnits(amount, currency);
    findings.push({
      kind: "agreement",
      id: stableId("agreement", [payer, currency, amountMinor, participants.join(",")]),
      expenseLabel: label.toLowerCase(),
      payer,
      participants,
      amountMinor,
      currency,
      split: "EQUAL",
      status: "DOCUMENTED_CLAIM",
      uncertainty: "The supplied text documents an equal split; it is not independently verified.",
      citations: [citation(paymentSpan), citation(agreementSpan)],
    });
  }
  return findings;
}

export function extractPayments(packet: EvidencePacket): PaymentFinding[] {
  const spans = packet.sources.flatMap((source) => source.spans);
  const findings: PaymentFinding[] = [];
  for (const source of packet.sources.filter(({ evidenceType }) => evidenceType === "PAYMENT_RECORD")) {
    const values = Object.fromEntries(source.spans.map((span) => {
      const separator = span.text.indexOf(":");
      return separator < 0 ? [span.text, ""] : [span.text.slice(0, separator), span.text.slice(separator + 1).trim()];
    }));
    const money = /^(?<currency>[A-Z]{3}) (?<amount>\d+(?:\.\d+)?)$/.exec(values.Amount ?? "");
    const state = values.Status as PaymentFinding["transferState"] | undefined;
    if (!values.Sender || !values.Recipient || !values["Payment purpose"] || !money?.groups?.currency || !money.groups.amount || !state || !["CLAIMED", "INITIATED", "RECEIVED"].includes(state)) continue;
    const amountMinor = toMinorUnits(money.groups.amount, money.groups.currency);
    findings.push({
      kind: "payment",
      id: stableId("payment", [source.id, values.Sender, values.Recipient, money.groups.currency, amountMinor]),
      sender: values.Sender,
      recipient: values.Recipient,
      amountMinor,
      currency: money.groups.currency,
      purpose: values["Payment purpose"],
      transferState: state,
      status: state === "RECEIVED" ? "DOCUMENTED_CLAIM" : "UNRESOLVED",
      uncertainty: state === "RECEIVED" ? "The submitted record claims receipt; it is not independently verified." : "The submitted record does not establish that the recipient received the transfer.",
      citations: source.spans.map(citation),
    });
  }
  for (const span of spans) {
    const match = /^Transfer record:\s*(?<sender>[A-Za-z]+) -> (?<recipient>[A-Za-z]+), (?<currency>[A-Z]{3}) (?<amount>\d+(?:\.\d{1,2})?), status (?<state>claimed|initiated|received), memo "(?<purpose>[^"]+)"\.$/i.exec(
      span.text,
    );
    if (!match?.groups) continue;
    const { sender, recipient, currency: rawCurrency, amount, state, purpose } = match.groups;
    if (!sender || !recipient || !rawCurrency || !amount || !state || !purpose) continue;
    const currency = rawCurrency.toUpperCase();
    const amountMinor = toMinorUnits(amount, currency);
    const transferState = state.toUpperCase() as PaymentFinding["transferState"];
    findings.push({
      kind: "payment",
      id: stableId("payment", [
        sender,
        recipient,
        currency,
        amountMinor,
        purpose,
      ]),
      sender,
      recipient,
      amountMinor,
      currency,
      purpose,
      transferState,
      status: transferState === "RECEIVED" ? "DOCUMENTED_CLAIM" : "UNRESOLVED",
      uncertainty:
        transferState === "RECEIVED"
          ? "The supplied record claims receipt; it is not independently verified."
          : "The supplied record does not establish that the recipient received the transfer.",
      citations: [citation(span)],
    });
  }
  return findings;
}

export function extractExpenses(packet: EvidencePacket): ExpenseClaim[] {
  const findings: ExpenseClaim[] = [];
  for (const source of packet.sources.filter(({ evidenceType }) => evidenceType === "EXPENSE_RECORD")) {
    const label = source.spans.find(({ text }) => text.startsWith("Expense: "))?.text.slice(9);
    const payer = source.spans.find(({ text }) => text.startsWith("Payer: "))?.text.slice(7);
    const amountText = source.spans.find(({ text }) => text.startsWith("Amount: "))?.text.slice(8);
    const money = /^(?<currency>[A-Z]{3}) (?<amount>\d+(?:\.\d+)?)$/.exec(amountText ?? "");
    if (label && payer && money?.groups?.currency && money.groups.amount) {
      findings.push({
        id: stableId("expense", [source.id, payer, money.groups.currency, money.groups.amount, label]),
        label: label.toLowerCase(),
        payer,
        amountMinor: toMinorUnits(money.groups.amount, money.groups.currency),
        currency: money.groups.currency as SupportedCurrency,
        status: "DOCUMENTED_CLAIM",
        citations: source.spans.map(citation),
      });
    }
  }
  for (const span of packet.sources.flatMap((source) => source.spans)) {
    const match = /^(?<payer>[A-Za-z]+):\s+I paid (?<currency>[A-Z]{3}) (?<amount>\d+(?:\.\d+)?) for (?:the )?(?<label>[^.]+)\.$/i.exec(span.text);
    if (!match?.groups) continue;
    const { payer, currency: rawCurrency, amount, label } = match.groups;
    if (!payer || !rawCurrency || !amount || !label) continue;
    const currency = rawCurrency.toUpperCase();
    findings.push({
      id: stableId("expense", [payer, currency, amount, label.toLowerCase(), span.sourceId, String(span.start)]),
      label: label.toLowerCase(),
      payer,
      amountMinor: toMinorUnits(amount, currency),
      currency: currency as SupportedCurrency,
      status: "DOCUMENTED_CLAIM",
      citations: [citation(span)],
    });
  }
  return findings;
}
