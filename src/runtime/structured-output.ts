import type { StructuredOutputFormat } from "@mozaik-ai/core";
import type { InvestigatorRole } from "./deterministic-runner.js";

const citation = {
  type: "object",
  properties: {
    sourceId: { type: "string" },
    start: { type: "integer", minimum: 0 },
    end: { type: "integer", minimum: 1 },
    text: { type: "string" },
    excerptHash: { type: "string" },
    evidenceType: { type: "string", enum: ["CONVERSATION", "PAYMENT_RECORD"] },
  },
  required: ["sourceId", "start", "end", "text", "excerptHash", "evidenceType"],
  additionalProperties: false,
};

const commonProperties = {
  id: { type: "string" }, amountMinor: { type: "string", description: "Positive integer minor units using digits only." },
  currency: { type: "string", enum: ["EUR", "GBP", "JPY", "USD"] },
  status: { type: "string", enum: ["DOCUMENTED_CLAIM", "CONFLICTING", "UNRESOLVED"] },
  uncertainty: { type: "string" }, citations: { type: "array", minItems: 1, items: citation },
};

export function investigatorOutputFormat(role: InvestigatorRole): StructuredOutputFormat {
  const finding = role === "agreement"
    ? {
        type: "object",
        properties: { kind: { type: "string", enum: ["agreement"] }, ...commonProperties, expenseLabel: { type: "string" }, payer: { type: "string" }, participants: { type: "array", minItems: 2, items: { type: "string" } }, split: { type: "string", enum: ["EQUAL"] } },
        required: ["kind", "id", "expenseLabel", "payer", "participants", "amountMinor", "currency", "split", "status", "uncertainty", "citations"],
        additionalProperties: false,
      }
    : {
        type: "object",
        properties: { kind: { type: "string", enum: ["payment"] }, ...commonProperties, sender: { type: "string" }, recipient: { type: "string" }, purpose: { type: "string" }, obligationId: { type: "string" }, transferState: { type: "string", enum: ["MENTIONED", "CLAIMED", "CLAIMED_SENT", "INITIATED", "RECEIVED", "DISPUTED", "REJECTED", "UNKNOWN"] } },
        required: ["kind", "id", "sender", "recipient", "amountMinor", "currency", "purpose", "obligationId", "transferState", "status", "uncertainty", "citations"],
        additionalProperties: false,
      };
  return { name: `abend_${role}_findings`, strict: true, schema: { type: "object", properties: { status: { type: "string", enum: ["ok"] }, findings: { type: "array", items: finding } }, required: ["status", "findings"], additionalProperties: false } };
}
