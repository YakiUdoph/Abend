import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createAbendServer, type DemoRunResponse } from "../../src/server/app.js";

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createAbendServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function json<T>(response: Response): Promise<T> {
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  return response.json() as Promise<T>;
}

function participantBalance(run: DemoRunResponse, projection: "fromEvidence" | "afterConfirmations", participant: string) {
  return run.result.projections[projection].balances.find(({ participant: candidate }) => candidate === participant);
}

test("frontend serves a locked fictional demonstration with a strict browser policy", async () => {
  await withServer(async (baseUrl) => {
    const health = await json<{ status: string; mode: string }>(await fetch(`${baseUrl}/health`));
    assert.deepEqual(health, { status: "ok", service: "abend", mode: "DEMONSTRATION" });

    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    const html = await page.text();
    assert.match(html, /Settle the numbers/);
    assert.match(html, /FICTIONAL TEST DATA/);
    assert.doesNotMatch(html, /type="file"/);

    const bootstrap = await json<{ mode: { demonstration: { status: string }; live: { status: string } }; packet: { label: string } }>(await fetch(`${baseUrl}/api/demo`));
    assert.equal(bootstrap.mode.demonstration.status, "AVAILABLE");
    assert.equal(bootstrap.mode.live.status, "BLOCKED");
    assert.equal(bootstrap.packet.label, "FICTIONAL TEST DATA");
  });
});

test("browser API runs real Mozaik loops and applies validated review decisions", async () => {
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/demo/investigations`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(created.status, 201);
    const before = await json<DemoRunResponse>(created);
    assert.equal(before.mode, "DEMONSTRATION");
    assert.equal(before.result.agentWindows.length, 2);
    assert.equal(before.result.agentWindows.every(({ status, loopId }) => status === "COMPLETED" && Boolean(loopId)), true);
    assert.equal(before.result.overlap.observed, true);
    assert.equal(before.result.overlap.distinctLoopIds, true);
    assert.equal(before.result.nativeEvents.some(({ type }) => type === "agreement.finding"), true);
    assert.equal(before.result.nativeEvents.some(({ type }) => type === "payment.finding"), true);
    assert.equal(before.result.nativeEvents.some(({ type }) => type === "reconciliation.updated"), true);
    assert.equal(participantBalance(before, "fromEvidence", "Bea")?.amountMinor, "-10000");
    assert.equal(participantBalance(before, "afterConfirmations", "Bea")?.amountMinor, "-10000");

    const payment = before.result.payments[0];
    const agreement = before.result.agreements[0];
    assert.ok(payment);
    assert.ok(agreement);
    const decisionUrl = `${baseUrl}/api/demo/investigations/${encodeURIComponent(before.runId)}/decisions`;
    const linked = await json<DemoRunResponse>(await fetch(decisionUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "LINK_PAYMENT_TO_AGREEMENT", paymentId: payment.id, agreementId: agreement.id }),
    }));
    assert.equal(participantBalance(linked, "afterConfirmations", "Bea")?.amountMinor, "-10000");

    const confirmed = await json<DemoRunResponse>(await fetch(decisionUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "CONFIRM_PAYMENT_RECEIPT", paymentId: payment.id }),
    }));
    assert.equal(participantBalance(confirmed, "afterConfirmations", "Bea")?.amountMinor, "-6000");
    assert.equal(participantBalance(confirmed, "afterConfirmations", "Chen")?.amountMinor, "-10000");
    assert.equal(confirmed.result.projections.afterConfirmations.terms.find(({ kind }) => kind === "EXPENSE")?.status, "EXCLUDED");
    assert.equal(confirmed.result.decisions.length, 2);
    assert.equal(confirmed.result.nativeEvents.filter(({ type }) => type === "human.decision").length, 2);
  });
});

test("review API rejects unsupported and contradictory decisions without losing the run", async () => {
  await withServer(async (baseUrl) => {
    const before = await json<DemoRunResponse>(await fetch(`${baseUrl}/api/demo/investigations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    const decisionUrl = `${baseUrl}/api/demo/investigations/${encodeURIComponent(before.runId)}/decisions`;
    const unsupported = await fetch(decisionUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "BYPASS_VALIDATION" }),
    });
    assert.equal(unsupported.status, 400);
    assert.equal((await json<{ error: { code: string } }>(unsupported)).error.code, "INVALID_DECISION");

    const missing = await fetch(`${baseUrl}/api/demo/investigations/not-a-run/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "CONFIRM_PAYMENT_RECEIPT", paymentId: "invented" }),
    });
    assert.equal(missing.status, 404);
  });
});
