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
