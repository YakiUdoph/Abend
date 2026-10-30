import { createHash } from "node:crypto";
import {
  createEvidenceSource,
  hashExcerpt,
  type EvidencePacket,
  type EvidenceType,
} from "./evidence.js";

export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_PACKET_BYTES = 128 * 1024;
export const SUPPORTED_CURRENCY_EXPONENTS = {
  EUR: 2,
  GBP: 2,
  JPY: 0,
  USD: 2,
} as const;

export type SupportedCurrency = keyof typeof SUPPORTED_CURRENCY_EXPONENTS;

export type TextSourceInput = {
  content: string | Uint8Array;
  evidenceType: EvidenceType;
};

export type IngestTextInput = {
  sources: TextSourceInput[];
  participantAliases?: Record<string, string[]>;
  currencies?: string[];
  fictionalFixture?: boolean;
};

function decodeUtf8(content: string | Uint8Array): string {
  if (typeof content === "string") return content;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new Error("INVALID_UTF8");
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").normalize("NFC");
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function validateAliases(aliases: Record<string, string[]>): Record<string, string[]> {
  const seen = new Set<string>();
  const normalized: Record<string, string[]> = {};
  for (const [rawParticipant, rawAliases] of Object.entries(aliases)) {
    const participant = rawParticipant.trim();
    if (!participant || !Array.isArray(rawAliases)) throw new Error("INVALID_PARTICIPANT_ALIASES");
    const values = [...new Set([participant, ...rawAliases].map((value) => value.trim()).filter(Boolean))];
    if (values.length === 0) throw new Error("INVALID_PARTICIPANT_ALIASES");
    for (const value of values) {
      const key = value.toLocaleLowerCase("en-US");
      if (seen.has(key)) throw new Error(`DUPLICATE_PARTICIPANT_ALIAS:${value}`);
      seen.add(key);
    }
    normalized[participant] = values;
  }
  return normalized;
}

function validateCurrencies(currencies: string[]): SupportedCurrency[] {
  return [...new Set(currencies.map((currency) => currency.trim().toUpperCase()))].map((currency) => {
    if (!(currency in SUPPORTED_CURRENCY_EXPONENTS)) {
      throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
    }
    return currency as SupportedCurrency;
  });
}

export function ingestText(input: IngestTextInput): EvidencePacket {
  if (!input || !Array.isArray(input.sources) || input.sources.length === 0) {
    throw new Error("EMPTY_INPUT");
  }

  let totalBytes = 0;
  const occurrence = new Map<string, number>();
  const sources = input.sources.map((sourceInput) => {
    if (!sourceInput || !["CONVERSATION", "PAYMENT_RECORD"].includes(sourceInput.evidenceType)) {
      throw new Error("INVALID_EVIDENCE_TYPE");
    }
    const text = normalizeText(decodeUtf8(sourceInput.content));
    if (text.trim().length === 0) throw new Error("EMPTY_INPUT");
    const bytes = byteLength(text);
    if (bytes > MAX_SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
    totalBytes += bytes;
    if (totalBytes > MAX_PACKET_BYTES) throw new Error("PACKET_TOO_LARGE");

    const digest = hashExcerpt(`${sourceInput.evidenceType}\0${text}`);
    const ordinal = occurrence.get(digest) ?? 0;
    occurrence.set(digest, ordinal + 1);
    const id = `src-${digest.slice(0, 16)}-${ordinal}`;
    return createEvidenceSource(id, text, sourceInput.evidenceType);
  });

  const participantAliases = validateAliases(input.participantAliases ?? {});
  const currencies = validateCurrencies(input.currencies ?? []);
  const packetDigest = createHash("sha256")
    .update(JSON.stringify({
      sources: sources.map(({ id, contentHash, evidenceType }) => ({ id, contentHash, evidenceType })),
      participantAliases,
      currencies,
    }))
    .digest("hex");

  return {
    id: `packet-${packetDigest.slice(0, 20)}`,
    ...(input.fictionalFixture ? { label: "FICTIONAL TEST DATA" as const } : {}),
    participantAliases,
    currencies,
    sources,
  };
}
