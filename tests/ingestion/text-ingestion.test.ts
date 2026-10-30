import assert from "node:assert/strict";
import test from "node:test";
import { createFictionalEvidencePacket } from "../../src/fixtures/fictional-evidence.js";
import { ingestText, MAX_SOURCE_BYTES } from "../../src/domain/ingestion.js";
import { parseAgentOutput, validateFinding } from "../../src/domain/findings.js";

const aliases = { Alex: ["A"], Bea: ["B"] };

test("acceptance L: rejects empty input without creating a partial packet", () => {
  assert.throws(() => ingestText({ sources: [] }), /EMPTY_INPUT/);
  assert.throws(() => ingestText({ sources: [{ evidenceType: "CONVERSATION", content: "  \r\n" }] }), /EMPTY_INPUT/);
});

test("rejects an oversized source instead of truncating it", () => {
  assert.throws(() => ingestText({ sources: [{ evidenceType: "CONVERSATION", content: "x".repeat(MAX_SOURCE_BYTES + 1) }] }), /SOURCE_TOO_LARGE/);
});

test("acceptance L: rejects malformed UTF-8 bytes", () => {
  assert.throws(() => ingestText({ sources: [{ evidenceType: "CONVERSATION", content: Uint8Array.from([0xc3, 0x28]) }] }), /INVALID_UTF8/);
});

test("normalizes line endings and produces stable source IDs, hashes, and exact spans", () => {
  const one = ingestText({ participantAliases: aliases, currencies: ["EUR"], sources: [{ evidenceType: "CONVERSATION", content: "Alex: café\r\nBea: yes" }] });
  const two = ingestText({ participantAliases: aliases, currencies: ["eur"], sources: [{ evidenceType: "CONVERSATION", content: "Alex: cafe\u0301\nBea: yes" }] });
  assert.equal(one.id, two.id);
  assert.equal(one.sources[0]?.id, two.sources[0]?.id);
  assert.equal(one.sources[0]?.text, "Alex: café\nBea: yes");
  assert.deepEqual(one.sources[0]?.spans.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 10, text: "Alex: café" },
    { start: 11, end: 19, text: "Bea: yes" },
  ]);
});

test("validates aliases and explicit supported currencies", () => {
  assert.throws(() => ingestText({ participantAliases: { Alex: ["same"], Bea: ["Same"] }, sources: [{ evidenceType: "CONVERSATION", content: "text" }] }), /DUPLICATE_PARTICIPANT_ALIAS/);
  assert.throws(() => ingestText({ currencies: ["CAD"], sources: [{ evidenceType: "CONVERSATION", content: "text" }] }), /UNSUPPORTED_CURRENCY/);
});

test("rejects malformed model JSON and model-assigned privileged status", () => {
  assert.throws(() => parseAgentOutput("not-json"), /MALFORMED_JSON at \$/);
  const packet = createFictionalEvidencePacket();
  const span = packet.sources[1]?.spans[0];
  assert.ok(span);
  assert.throws(() => parseAgentOutput(JSON.stringify({ status: "ok", findings: [{ kind: "payment", id: "p", sender: "Bea", recipient: "Alex", amountMinor: "4000", currency: "EUR", purpose: "trip", obligationId: "", transferState: "RECEIVED", status: "INDEPENDENTLY_VERIFIED", uncertainty: "none", citations: [span] }] })), /DISALLOWED_MODEL_STATUS at \$\.findings\[0\]\.status/);
});

test("rejects an otherwise valid finding using an undeclared or unsupported currency", () => {
  const packet = createFictionalEvidencePacket();
  const span = packet.sources[1]?.spans[0];
  assert.ok(span);
  const output = parseAgentOutput(JSON.stringify({ status: "ok", findings: [{ kind: "payment", id: "p", sender: "Bea", recipient: "Alex", amountMinor: "4000", currency: "USD", purpose: "trip", obligationId: "", transferState: "INITIATED", status: "UNRESOLVED", uncertainty: "receipt unknown", citations: [span] }] }));
  assert.equal(output.status, "ok");
  if (output.status === "ok" && output.findings[0]) assert.throws(() => validateFinding(packet, output.findings[0]!), /UNDECLARED_CURRENCY at \$\.finding\.currency/);
});
