import { ingestText, SUPPORTED_CURRENCY_EXPONENTS, type SupportedCurrency } from "./ingestion.js";
import type { EvidencePacket, EvidenceType } from "./evidence.js";

export const MAX_PARTICIPANTS = 12;
export const MAX_EXPENSES = 24;
export const MAX_PAYMENTS = 24;
export const MAX_CONVERSATION_CHARS = 12_000;

export type WorkspaceExpenseInput = {
  label: string;
  payer: string;
  amount: string;
  shares: Array<{ participant: string; amount: string }>;
};

export type WorkspacePaymentInput = {
  sender: string;
  recipient: string;
  amount: string;
  status: "CLAIMED" | "INITIATED" | "RECEIVED";
  purpose: string;
};

export type WorkspaceSubmission = {
  participants: string[];
  currency: SupportedCurrency;
  expenses: WorkspaceExpenseInput[];
  payments: WorkspacePaymentInput[];
  conversation?: string;
};

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function text(value: unknown, code: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function participantName(value: unknown): string {
  const name = text(value, "INVALID_PARTICIPANT", 40);
  if (!/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(name) || name.includes(" | ")) throw new Error("INVALID_PARTICIPANT");
  return name;
}

function amount(value: unknown, currency: SupportedCurrency): string {
  const candidate = text(value, "INVALID_AMOUNT", 32);
  const exponent = SUPPORTED_CURRENCY_EXPONENTS[currency];
  const pattern = exponent === 0 ? /^(?:0|[1-9]\d*)$/ : new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${exponent}})?$`);
  if (!pattern.test(candidate)) throw new Error("INVALID_AMOUNT");
  const [whole, fraction = ""] = candidate.split(".");
  const minor = BigInt(whole ?? "0") * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
  if (minor <= 0n || minor > 999_999_999_999n) throw new Error("INVALID_AMOUNT");
  return exponent === 0 ? whole! : `${whole}.${fraction.padEnd(exponent, "0")}`;
}

function participantArray(value: unknown, declared: Set<string>, allowEmpty = false): string[] {
  if (!Array.isArray(value)) throw new Error("INVALID_EXPENSE_PARTICIPANTS");
  const names = value.map(participantName);
  if ((!allowEmpty && names.length < 2) || names.length > declared.size || new Set(names).size !== names.length) {
    throw new Error("INVALID_EXPENSE_PARTICIPANTS");
  }
  for (const name of names) if (!declared.has(name)) throw new Error("UNKNOWN_PARTICIPANT");
  return names;
}

export function parseWorkspaceSubmission(value: unknown): WorkspaceSubmission {
  const input = object(value, "INVALID_WORKSPACE");
  if (!Array.isArray(input.participants) || input.participants.length < 2 || input.participants.length > MAX_PARTICIPANTS) {
    throw new Error("INVALID_PARTICIPANTS");
  }
  const participants = input.participants.map(participantName);
  const folded = participants.map((name) => name.toLocaleLowerCase("en-US"));
  if (new Set(folded).size !== participants.length) throw new Error("DUPLICATE_PARTICIPANT");
  const declared = new Set(participants);

  const rawCurrency = text(input.currency, "UNSUPPORTED_CURRENCY", 3).toUpperCase();
  if (!(rawCurrency in SUPPORTED_CURRENCY_EXPONENTS)) throw new Error("UNSUPPORTED_CURRENCY");
  const currency = rawCurrency as SupportedCurrency;

  if (!Array.isArray(input.expenses) || input.expenses.length === 0 || input.expenses.length > MAX_EXPENSES) {
    throw new Error("INVALID_EXPENSES");
  }
  const expenses = input.expenses.map((raw): WorkspaceExpenseInput => {
    const expense = object(raw, "INVALID_EXPENSE");
    const payer = participantName(expense.payer);
    if (!declared.has(payer)) throw new Error("UNKNOWN_PARTICIPANT");
    if (!Array.isArray(expense.shares) || expense.shares.length < 2 || expense.shares.length > participants.length) throw new Error("INVALID_EXPENSE_SHARES");
    const shares = expense.shares.map((rawShare) => {
      const share = object(rawShare, "INVALID_EXPENSE_SHARE");
      const participant = participantName(share.participant);
      if (!declared.has(participant)) throw new Error("UNKNOWN_PARTICIPANT");
      return { participant, amount: amount(share.amount, currency) };
    });
    if (new Set(shares.map(({ participant }) => participant)).size !== shares.length || !shares.some(({ participant }) => participant === payer)) throw new Error("INVALID_EXPENSE_SHARES");
    const expenseAmount = amount(expense.amount, currency);
    const exponent = SUPPORTED_CURRENCY_EXPONENTS[currency];
    const toMinor = (value: string): bigint => {
      const [whole = "0", fraction = ""] = value.split(".");
      return BigInt(whole) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
    };
    if (shares.reduce((sum, share) => sum + toMinor(share.amount), 0n) !== toMinor(expenseAmount)) throw new Error("SHARES_DO_NOT_SUM");
    return {
      label: text(expense.label, "INVALID_EXPENSE_LABEL", 80),
      payer,
      amount: expenseAmount,
      shares,
    };
  });

  if (!Array.isArray(input.payments) || input.payments.length > MAX_PAYMENTS) throw new Error("INVALID_PAYMENTS");
  const payments = input.payments.map((raw): WorkspacePaymentInput => {
    const payment = object(raw, "INVALID_PAYMENT");
    const sender = participantName(payment.sender);
    const recipient = participantName(payment.recipient);
    if (!declared.has(sender) || !declared.has(recipient)) throw new Error("UNKNOWN_PARTICIPANT");
    if (sender === recipient) throw new Error("PAYMENT_PARTIES_MUST_DIFFER");
    if (!new Set(["CLAIMED", "INITIATED", "RECEIVED"]).has(String(payment.status))) throw new Error("INVALID_PAYMENT_STATUS");
    return {
      sender,
      recipient,
      amount: amount(payment.amount, currency),
      status: payment.status as WorkspacePaymentInput["status"],
      purpose: text(payment.purpose, "INVALID_PAYMENT_PURPOSE", 80),
    };
  });

  const conversation = input.conversation === undefined || input.conversation === ""
    ? undefined
    : text(input.conversation, "INVALID_CONVERSATION", MAX_CONVERSATION_CHARS);
  return { participants, currency, expenses, payments, ...(conversation ? { conversation } : {}) };
}

function expenseRecord(expense: WorkspaceExpenseInput, currency: SupportedCurrency): string {
  return [
    `Expense: ${expense.label}`,
    `Payer: ${expense.payer}`,
    `Amount: ${currency} ${expense.amount}`,
    "Split: EXACT",
    `Shares: ${expense.shares.map(({ participant, amount }) => `${participant}=${amount}`).join(" | ")}`,
  ].join("\n");
}

function paymentRecord(payment: WorkspacePaymentInput, currency: SupportedCurrency): string {
  return [
    `Payment purpose: ${payment.purpose}`,
    `Sender: ${payment.sender}`,
    `Recipient: ${payment.recipient}`,
    `Amount: ${currency} ${payment.amount}`,
    `Status: ${payment.status}`,
  ].join("\n");
}

export function workspaceEvidencePacket(submission: WorkspaceSubmission): EvidencePacket {
  const sources: Array<{ evidenceType: EvidenceType; content: string }> = [
    ...submission.expenses.map((expense) => ({ evidenceType: "EXPENSE_RECORD" as const, content: expenseRecord(expense, submission.currency) })),
    ...submission.payments.map((payment) => ({ evidenceType: "PAYMENT_RECORD" as const, content: paymentRecord(payment, submission.currency) })),
    ...(submission.conversation ? [{ evidenceType: "CONVERSATION" as const, content: submission.conversation }] : []),
  ];
  return ingestText({
    participantAliases: Object.fromEntries(submission.participants.map((name) => [name, [name]])),
    currencies: [submission.currency],
    sources,
  });
}

export function workspacePacketFromUnknown(value: unknown): { submission: WorkspaceSubmission; packet: EvidencePacket } {
  const submission = parseWorkspaceSubmission(value);
  return { submission, packet: workspaceEvidencePacket(submission) };
}
