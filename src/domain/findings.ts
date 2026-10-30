import type { Citation, EvidencePacket } from "./evidence.js";
import { resolveCitation } from "./evidence.js";
import { SUPPORTED_CURRENCY_EXPONENTS } from "./ingestion.js";
import type { SafeProviderDiagnostic } from "../runtime/provider-runner.js";

export type FindingStatus = "DOCUMENTED_CLAIM" | "USER_CONFIRMED" | "INDEPENDENTLY_VERIFIED" | "CONFLICTING" | "UNRESOLVED";
export type AgreementShare = { participant: string; amountMinor: string };
export type AgreementFinding = { kind: "agreement"; id: string; expenseLabel: string; payer: string; participants: string[]; amountMinor: string; currency: string; split: "EQUAL" | "EXACT"; shares?: AgreementShare[]; status: "DOCUMENTED_CLAIM" | "USER_CONFIRMED" | "CONFLICTING" | "UNRESOLVED"; uncertainty: string; citations: Citation[] };
export type PaymentFinding = { kind: "payment"; id: string; sender: string; recipient: string; amountMinor: string; currency: string; purpose: string; obligationId?: string; transferState: "MENTIONED" | "CLAIMED" | "CLAIMED_SENT" | "INITIATED" | "RECEIVED" | "DISPUTED" | "REJECTED" | "UNKNOWN"; status: FindingStatus; uncertainty: string; citations: Citation[] };
export type Finding = AgreementFinding | PaymentFinding;
export type AgentOutput = { status: "ok"; findings: Finding[] } | { status: "error"; code: string; diagnostic?: SafeProviderDiagnostic };

export class AgentOutputValidationError extends Error {
  constructor(readonly validationCode: string, readonly path: string) {
    super(`${validationCode} at ${path}`);
    this.name = "AgentOutputValidationError";
  }
}

function invalid(code: string, path: string): never {
  throw new AgentOutputValidationError(code, path);
}

const OUTPUT_STATUSES = new Set(["DOCUMENTED_CLAIM", "CONFLICTING", "UNRESOLVED"]);
const PAYMENT_STATES = new Set(["MENTIONED", "CLAIMED", "CLAIMED_SENT", "INITIATED", "RECEIVED", "DISPUTED", "REJECTED", "UNKNOWN"]);

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("EXPECTED_OBJECT", path);
  return value as Record<string, unknown>;
}
function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") invalid("EXPECTED_NON_EMPTY_STRING", path);
  return value;
}
function parseCitation(value: unknown, path: string): Citation {
  const candidate = record(value, path);
  const evidenceType = candidate.evidenceType;
  if (evidenceType !== "CONVERSATION" && evidenceType !== "EXPENSE_RECORD" && evidenceType !== "PAYMENT_RECORD") invalid("INVALID_ENUM", `${path}.evidenceType`);
  if (!Number.isSafeInteger(candidate.start)) invalid("EXPECTED_SAFE_INTEGER", `${path}.start`);
  if (!Number.isSafeInteger(candidate.end)) invalid("EXPECTED_SAFE_INTEGER", `${path}.end`);
  return { sourceId: nonEmptyString(candidate.sourceId, `${path}.sourceId`), start: candidate.start as number, end: candidate.end as number, text: nonEmptyString(candidate.text, `${path}.text`), excerptHash: nonEmptyString(candidate.excerptHash, `${path}.excerptHash`), evidenceType };
}
function parseCommon(candidate: Record<string, unknown>, path: string) {
  if (!Array.isArray(candidate.citations) || candidate.citations.length === 0) invalid("NON_EMPTY_ARRAY_REQUIRED", `${path}.citations`);
  return { id: nonEmptyString(candidate.id, `${path}.id`), amountMinor: nonEmptyString(candidate.amountMinor, `${path}.amountMinor`), currency: nonEmptyString(candidate.currency, `${path}.currency`), uncertainty: nonEmptyString(candidate.uncertainty, `${path}.uncertainty`), citations: candidate.citations.map((citation, index) => parseCitation(citation, `${path}.citations[${index}]`)) };
}
function parseFinding(value: unknown, path: string): Finding {
  const candidate = record(value, path);
  const common = parseCommon(candidate, path);
  const status = nonEmptyString(candidate.status, `${path}.status`);
  if (!OUTPUT_STATUSES.has(status)) invalid("DISALLOWED_MODEL_STATUS", `${path}.status`);
  if (candidate.kind === "agreement") {
    if (candidate.split !== "EQUAL" && candidate.split !== "EXACT") invalid("INVALID_ENUM", `${path}.split`);
    if (!Array.isArray(candidate.participants)) invalid("EXPECTED_ARRAY", `${path}.participants`);
    let shares: AgreementShare[] | undefined;
    if (candidate.split === "EXACT") {
      if (!Array.isArray(candidate.shares) || candidate.shares.length === 0) invalid("NON_EMPTY_ARRAY_REQUIRED", `${path}.shares`);
      shares = candidate.shares.map((item, index) => {
        const share = record(item, `${path}.shares[${index}]`);
        return { participant: nonEmptyString(share.participant, `${path}.shares[${index}].participant`), amountMinor: nonEmptyString(share.amountMinor, `${path}.shares[${index}].amountMinor`) };
      });
    }
    return { kind: "agreement", ...common, expenseLabel: nonEmptyString(candidate.expenseLabel, `${path}.expenseLabel`), payer: nonEmptyString(candidate.payer, `${path}.payer`), participants: candidate.participants.map((item, index) => nonEmptyString(item, `${path}.participants[${index}]`)), split: candidate.split, ...(shares ? { shares } : {}), status: status as AgreementFinding["status"] };
  }
  if (candidate.kind === "payment") {
    const transferState = nonEmptyString(candidate.transferState, `${path}.transferState`);
    if (!PAYMENT_STATES.has(transferState)) invalid("INVALID_ENUM", `${path}.transferState`);
    const obligationId = candidate.obligationId;
    if (obligationId !== undefined && obligationId !== null && typeof obligationId !== "string") invalid("EXPECTED_STRING", `${path}.obligationId`);
    return { kind: "payment", ...common, sender: nonEmptyString(candidate.sender, `${path}.sender`), recipient: nonEmptyString(candidate.recipient, `${path}.recipient`), purpose: typeof candidate.purpose === "string" ? candidate.purpose : "", ...(typeof obligationId === "string" && obligationId ? { obligationId } : {}), transferState: transferState as PaymentFinding["transferState"], status: status as PaymentFinding["status"] };
  }
  invalid("INVALID_ENUM", `${path}.kind`);
}

export function validateFinding(packet: EvidencePacket, finding: Finding, path = "$.finding"): void {
  if (!finding.id) invalid("REQUIRED", `${path}.id`);
  if (finding.citations.length === 0) invalid("NON_EMPTY_ARRAY_REQUIRED", `${path}.citations`);
  if (!(finding.currency in SUPPORTED_CURRENCY_EXPONENTS)) invalid("UNSUPPORTED_CURRENCY", `${path}.currency`);
  if (!(packet.currencies ?? []).includes(finding.currency)) invalid("UNDECLARED_CURRENCY", `${path}.currency`);
  if (!/^\d+$/.test(finding.amountMinor) || BigInt(finding.amountMinor) <= 0n) invalid("INVALID_MINOR_UNIT_AMOUNT", `${path}.amountMinor`);
  finding.citations.forEach((citation, index) => { if (!resolveCitation(packet, citation)) invalid("CITATION_DOES_NOT_RESOLVE", `${path}.citations[${index}]`); });
  const participants = new Set(Object.keys(packet.participantAliases ?? {}));
  const requireParticipant = (value: string, participantPath: string): void => { if (!participants.has(value)) invalid("UNKNOWN_PARTICIPANT", participantPath); };
  if (finding.kind === "agreement") {
    requireParticipant(finding.payer, `${path}.payer`);
    finding.participants.forEach((participant, index) => requireParticipant(participant, `${path}.participants[${index}]`));
    if (finding.participants.length < 2 || !finding.participants.includes(finding.payer)) invalid("INVALID_AGREEMENT_PARTICIPANTS", `${path}.participants`);
    if (new Set(finding.participants).size !== finding.participants.length) invalid("DUPLICATE_AGREEMENT_PARTICIPANT", `${path}.participants`);
    if (finding.split === "EXACT") {
      if (!finding.shares || finding.shares.length !== finding.participants.length) invalid("INVALID_EXACT_SHARES", `${path}.shares`);
      const shareParticipants = new Set<string>();
      let total = 0n;
      finding.shares.forEach((share, index) => {
        requireParticipant(share.participant, `${path}.shares[${index}].participant`);
        if (!finding.participants.includes(share.participant) || shareParticipants.has(share.participant)) invalid("INVALID_EXACT_SHARES", `${path}.shares[${index}]`);
        if (!/^\d+$/.test(share.amountMinor)) invalid("INVALID_MINOR_UNIT_AMOUNT", `${path}.shares[${index}].amountMinor`);
        shareParticipants.add(share.participant);
        total += BigInt(share.amountMinor);
      });
      if (total !== BigInt(finding.amountMinor)) invalid("SHARES_DO_NOT_SUM", `${path}.shares`);
    }
  } else {
    requireParticipant(finding.sender, `${path}.sender`);
    requireParticipant(finding.recipient, `${path}.recipient`);
    if (finding.sender === finding.recipient) invalid("PAYMENT_PARTIES_MUST_DIFFER", `${path}.recipient`);
    if (finding.status === "USER_CONFIRMED" || finding.status === "INDEPENDENTLY_VERIFIED") invalid("DISALLOWED_MODEL_STATUS", `${path}.status`);
  }
}

function parseProviderDiagnostic(value: unknown): SafeProviderDiagnostic | undefined {
  if (value === undefined) return undefined;
  const candidate = record(value, "$.diagnostic");
  const allowed = new Set(["AUTHENTICATION", "BAD_REQUEST", "MODEL_NOT_FOUND", "PROVIDER_SERVER", "RATE_LIMIT", "SCHEMA_REJECTED", "TRANSPORT", "UNKNOWN"]);
  const category = nonEmptyString(candidate.category, "$.diagnostic.category");
  if (!allowed.has(category)) invalid("INVALID_ENUM", "$.diagnostic.category");
  if (typeof candidate.retryable !== "boolean") invalid("EXPECTED_BOOLEAN", "$.diagnostic.retryable");
  if (typeof candidate.rateLimited !== "boolean") invalid("EXPECTED_BOOLEAN", "$.diagnostic.rateLimited");
  if (candidate.httpStatus !== undefined && !Number.isInteger(candidate.httpStatus)) invalid("EXPECTED_INTEGER", "$.diagnostic.httpStatus");
  if (candidate.providerCode !== undefined && typeof candidate.providerCode !== "string") invalid("EXPECTED_STRING", "$.diagnostic.providerCode");
  return { category: category as SafeProviderDiagnostic["category"], model: nonEmptyString(candidate.model, "$.diagnostic.model"), retryable: candidate.retryable, rateLimited: candidate.rateLimited, ...(typeof candidate.httpStatus === "number" ? { httpStatus: candidate.httpStatus } : {}), ...(typeof candidate.providerCode === "string" ? { providerCode: candidate.providerCode } : {}) };
}

export function parseAgentOutput(text: string): AgentOutput {
  let value: unknown;
  try { value = JSON.parse(text); } catch { invalid("MALFORMED_JSON", "$"); }
  const output = record(value, "$");
  if (output.status === "error") {
    const diagnostic = parseProviderDiagnostic(output.diagnostic);
    return { status: "error", code: nonEmptyString(output.code, "$.code"), ...(diagnostic ? { diagnostic } : {}) };
  }
  if (output.status !== "ok") invalid("INVALID_ENUM", "$.status");
  if (!Array.isArray(output.findings)) invalid("EXPECTED_ARRAY", "$.findings");
  return { status: "ok", findings: output.findings.map((finding, index) => parseFinding(finding, `$.findings[${index}]`)) };
}
