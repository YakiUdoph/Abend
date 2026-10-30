import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createAbendServer, type InvestigationRunResponse } from "../../src/server/app.js";

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createAbendServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
async function create(baseUrl: string, body: unknown): Promise<{ response: Response; run?: InvestigationRunResponse }> {
  const response = await fetch(`${baseUrl}/api/investigations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { response, ...(response.ok ? { run: await response.json() as InvestigationRunResponse } : {}) };
}
function balance(run: InvestigationRunResponse, participant: string, projection: "fromEvidence" | "afterConfirmations" = "fromEvidence"): string | undefined {
  return run.result.projections[projection].balances.find((item) => item.participant === participant)?.amountMinor;
}
async function decide(baseUrl: string, run: InvestigationRunResponse, body: unknown): Promise<InvestigationRunResponse> {
  const response = await fetch(`${baseUrl}/api/investigations/${encodeURIComponent(run.runId)}/decisions`, { method: "POST", headers: { "content-type": "application/json", "x-abend-session": run.accessToken }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  return response.json() as Promise<InvestigationRunResponse>;
}

test("new scenario 1: explicit unequal shares reach both Mozaik investigators and determine balances", async () => withServer(async (baseUrl) => {
  const { response, run } = await create(baseUrl, { participants: ["Dana", "Eli", "Fran"], currency: "USD", expenses: [{ label: "Cabin", payer: "Dana", amount: "120.00", shares: [{ participant: "Dana", amount: "20.00" }, { participant: "Eli", amount: "40.00" }, { participant: "Fran", amount: "60.00" }] }], payments: [], conversation: "Dana: These are the agreed cabin shares." });
  assert.equal(response.status, 201); assert.ok(run);
  assert.equal(run.mode, "WORKSPACE"); assert.equal(run.result.agreements[0]?.split, "EXACT");
  assert.equal(run.result.agentWindows.length, 2); assert.equal(run.result.overlap.observed, true); assert.equal(run.result.overlap.distinctLoopIds, true);
  assert.equal(run.result.nativeEvents.some(({ type }) => type === "agreement.finding"), true);
  assert.equal(run.result.nativeEvents.some(({ type }) => type === "reconciliation.updated"), true);
  assert.equal(balance(run, "Dana"), "10000"); assert.equal(balance(run, "Eli"), "-4000"); assert.equal(balance(run, "Fran"), "-6000");
  assert.equal(run.packet.sources.some(({ text }) => text.includes("Alex") || text.includes("Bea")), false);
}));

test("new scenario 2: initiated repayment stays pending until two human decisions recalculate it", async () => withServer(async (baseUrl) => {
  const { run } = await create(baseUrl, { participants: ["Gita", "Hugo"], currency: "EUR", expenses: [{ label: "Groceries", payer: "Gita", amount: "100.00", shares: [{ participant: "Gita", amount: "50.00" }, { participant: "Hugo", amount: "50.00" }] }], payments: [{ sender: "Hugo", recipient: "Gita", amount: "20.00", purpose: "Groceries", status: "INITIATED" }] }); assert.ok(run);
  assert.equal(run.result.nativeEvents.some(({ type }) => type === "payment.finding"), true); assert.equal(balance(run, "Hugo"), "-5000");
  const payment = run.result.payments[0]; const agreement = run.result.agreements[0]; assert.ok(payment); assert.ok(agreement);
  const linked = await decide(baseUrl, run, { kind: "LINK_PAYMENT_TO_AGREEMENT", paymentId: payment.id, agreementId: agreement.id });
  assert.equal(balance(linked, "Hugo", "afterConfirmations"), "-5000");
  const confirmed = await decide(baseUrl, linked, { kind: "CONFIRM_PAYMENT_RECEIPT", paymentId: payment.id });
  assert.equal(balance(confirmed, "Hugo", "afterConfirmations"), "-3000"); assert.equal(confirmed.result.nativeEvents.filter(({ type }) => type === "human.decision").length, 2);
}));

test("new scenario 3: duplicate repayments are visible but never double-counted", async () => withServer(async (baseUrl) => {
  const payment = { sender: "Iris", recipient: "Jon", amount: "25.00", purpose: "Tickets", status: "RECEIVED" };
  const { run } = await create(baseUrl, { participants: ["Iris", "Jon"], currency: "GBP", expenses: [{ label: "Tickets", payer: "Jon", amount: "100.00", shares: [{ participant: "Iris", amount: "50.00" }, { participant: "Jon", amount: "50.00" }] }], payments: [payment, payment] }); assert.ok(run);
  const agreement = run.result.agreements[0]; assert.ok(agreement); let current = run;
  for (const candidate of run.result.payments) { current = await decide(baseUrl, current, { kind: "LINK_PAYMENT_TO_AGREEMENT", paymentId: candidate.id, agreementId: agreement.id }); current = await decide(baseUrl, current, { kind: "CONFIRM_PAYMENT_RECEIPT", paymentId: candidate.id }); }
  assert.equal(balance(current, "Iris", "afterConfirmations"), "-2500");
  assert.equal(current.result.paymentApplications.filter(({ status }) => status === "DUPLICATE").length, 1);
}));

test("malformed shares and a stolen run capability are rejected", async () => withServer(async (baseUrl) => {
  const invalid = await create(baseUrl, { participants: ["Kai", "Luz"], currency: "EUR", expenses: [{ label: "Meal", payer: "Kai", amount: "20.00", shares: [{ participant: "Kai", amount: "10.00" }, { participant: "Luz", amount: "9.00" }] }], payments: [] });
  assert.equal(invalid.response.status, 409);
  const { run } = await create(baseUrl, { participants: ["Kai", "Luz"], currency: "EUR", expenses: [{ label: "Meal", payer: "Kai", amount: "20.00", shares: [{ participant: "Kai", amount: "10.00" }, { participant: "Luz", amount: "10.00" }] }], payments: [] }); assert.ok(run);
  const denied = await fetch(`${baseUrl}/api/investigations/${run.runId}/decisions`, { method: "POST", headers: { "content-type": "application/json", "x-abend-session": "wrong" }, body: JSON.stringify({ kind: "BYPASS_VALIDATION" }) });
  assert.equal(denied.status, 403);
}));
