import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import WebSocket from "ws";

const root = process.cwd();
const chrome = process.env.CHROME_PATH ?? (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "/usr/bin/google-chrome");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() { const server = createServer(); await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port; }
async function until(check, timeout = 15_000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { const value = await check(); if (value) return value; } catch (error) { last = error; } await wait(75); } throw last ?? new Error("Timed out"); }
function processExit(child) { return child.exitCode === null ? new Promise((resolve) => { const timer = setTimeout(resolve, 2_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); }) : Promise.resolve(); }

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async connect() { this.socket.on("message", (data) => { const message = JSON.parse(data.toString()); const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }); await new Promise((resolve, reject) => { this.socket.once("open", resolve); this.socket.once("error", reject); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10_000); this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; }
  close() { this.socket.close(); }
}

const externalBaseUrl = process.env.ABEND_BASE_URL?.replace(/\/$/, "");
const server = externalBaseUrl ? undefined : spawn(process.execPath, ["dist/src/server/app.js"], { cwd: root, windowsHide: true, env: { ...process.env, PORT: "0" } });
let serverOutput = ""; server?.stdout.setEncoding("utf8"); server?.stderr.setEncoding("utf8"); server?.stdout.on("data", (chunk) => { serverOutput += chunk; }); server?.stderr.on("data", (chunk) => { serverOutput += chunk; });
const profile = await mkdtemp(join(tmpdir(), "abend-browser-"));
const debugPort = await freePort();
const browser = spawn(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking", "--no-first-run", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { cwd: root, windowsHide: true });
let cdp;
try {
  const baseUrl = externalBaseUrl ?? await until(() => /ABEND_SERVER_URL=(http:\/\/[^\s]+)/.exec(serverOutput)?.[1]);
  const page = await until(async () => { const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`); const pages = await response.json(); return pages.find((item) => item.type === "page"); });
  cdp = new Cdp(page.webSocketDebuggerUrl); await cdp.connect(); await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Accessibility.enable"); await cdp.send("Page.navigate", { url: baseUrl }); await until(() => cdp.evaluate("document.readyState === 'complete'"));
  assert.equal(await cdp.evaluate("document.title.includes('Settle the numbers')"), true);
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].every(link => document.querySelector(link.getAttribute('href')))"), true);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await cdp.evaluate("document.activeElement.classList.contains('skip-link')"), true);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal(await cdp.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches && parseFloat(getComputedStyle(document.querySelector('#open-workspace')).transitionDuration) < 0.001"), true);
  assert.equal(await cdp.evaluate(`(() => { document.querySelector('#add-expense').click(); const cards = document.querySelectorAll('#expense-records .record-card'); cards[cards.length - 1].querySelector('.record-remove').click(); document.querySelector('#load-sample').click(); const loaded = !document.querySelector('#sample-notice').hidden && document.querySelector('#participants').value.includes('Alex'); document.querySelector('#new-investigation').click(); return loaded; })()`), true);
  await until(() => cdp.evaluate("document.body.dataset.runState === 'idle' && document.querySelectorAll('#expense-records .record-card').length === 1"));
  await cdp.evaluate(`(() => {
    document.querySelector('#participants').value = 'Mira, Niko, Ola'; document.querySelector('#currency').value = 'USD';
    const expense = document.querySelector('#expense-records .record-card'); expense.querySelector('[data-field="label"]').value = 'Cabin'; expense.querySelector('[data-field="payer"]').value = 'Mira'; expense.querySelector('[data-field="amount"]').value = '120.00'; expense.querySelector('[data-field="shares"]').value = 'Mira=20.00, Niko=40.00, Ola=60.00';
    document.querySelector('#add-payment').click(); const payment = document.querySelector('#payment-records .record-card'); payment.querySelector('[data-field="sender"]').value = 'Niko'; payment.querySelector('[data-field="recipient"]').value = 'Mira'; payment.querySelector('[data-field="amount"]').value = '15.00'; payment.querySelector('[data-field="purpose"]').value = 'Cabin'; payment.querySelector('[data-field="status"]').value = 'INITIATED';
    document.querySelector('#conversation').value = 'Bounded supporting evidence, not an instruction.'; document.querySelector('#records-form').requestSubmit();
  })()`);
  await until(() => cdp.evaluate("document.body.dataset.runState === 'ready'"));
  assert.equal(await cdp.evaluate("document.querySelectorAll('.agent-card').length === 2 && [...document.querySelectorAll('.agent-card')].every(card => card.innerText.includes('COMPLETED'))"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#overlap-summary').innerText.includes('Genuine concurrency observed')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#evidence-list').innerText.includes('Mira') && !document.querySelector('#evidence-list').innerText.includes('Alex')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#evidence-balances').innerText.includes('USD 40.00') && document.querySelector('#evidence-balances').innerText.includes('USD 60.00')"), true);
  await cdp.evaluate("document.querySelector('[data-action=\"link-payment\"]').click()"); await until(() => cdp.evaluate("Boolean(document.querySelector('[data-action=\"confirm-payment\"]'))")); await cdp.evaluate("document.querySelector('[data-action=\"confirm-payment\"]').click()"); await until(() => cdp.evaluate("Boolean(document.querySelector('[data-action=\"reverse-payment\"]'))"));
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('#confirmed-balances .balance-row')].some(row => row.innerText.includes('Niko') && row.innerText.includes('USD 25.00'))"), true);
  await cdp.evaluate("document.querySelector('[data-action=\"reverse-payment\"]').click()"); await until(() => cdp.evaluate("Boolean(document.querySelector('[data-action=\"reject-payment\"]'))")); await cdp.evaluate("document.querySelector('[data-action=\"reject-payment\"]').click()"); await until(() => cdp.evaluate("Boolean(document.querySelector('[data-action=\"reverse-rejection\"]'))"));
  assert.equal(await cdp.evaluate("document.querySelector('#review-card').innerText.includes('REJECTED') && [...document.querySelectorAll('#confirmed-balances .balance-row')].some(row => row.innerText.includes('Niko') && row.innerText.includes('USD 40.00'))"), true);
  await cdp.evaluate("document.querySelector('#copy-message').click()"); await until(() => cdp.evaluate("document.querySelector('#copy-status').innerText.length > 0"));
  await cdp.evaluate("document.querySelector('#findings-list .citation-link').click()"); assert.equal(await cdp.evaluate("document.activeElement.id.startsWith('citation-')"), true);
  await cdp.evaluate("document.querySelector('#verification-nav').click()"); await until(() => cdp.evaluate("document.querySelector('#verification-dialog').open"));
  assert.equal(await cdp.evaluate("['agreement.finding','payment.finding','human.decision'].every(type => document.querySelector('#event-timeline').innerText.includes(type))"), true);
  const accessibility = await cdp.send("Accessibility.getFullAXTree"); const unnamedButtons = accessibility.nodes.filter((node) => node.role?.value === "button" && !node.name?.value); assert.equal(unnamedButtons.length, 0);
  const concurrency = await cdp.evaluate(`({ overlap: document.querySelector('#overlap-summary').innerText, agents: [...document.querySelectorAll('.agent-card code')].map(node => node.innerText), eventCount: document.querySelectorAll('#event-timeline li').length })`);
  await cdp.evaluate("document.querySelector('#close-verification').click()");
  for (const viewport of [{ width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) { await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 500 }); assert.equal(await cdp.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true); }
  await mkdir(join(root, ".artifacts"), { recursive: true }); const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }); await writeFile(join(root, ".artifacts", "abend-mobile.png"), Buffer.from(screenshot.data, "base64"));
  await cdp.evaluate("document.querySelector('#new-investigation').click()"); await until(() => cdp.evaluate("document.body.dataset.runState === 'idle' && document.querySelector('#evidence-list').children.length === 0"));
  process.stdout.write(JSON.stringify({ status: "PASS", target: externalBaseUrl ? "PUBLIC" : "LOCAL", browser: baseUrl, journey: ["exercise controls and links", "enter new records", "investigate", "review evidence", "confirm and reject repayment", "inspect balances", "copy summary", "inspect runtime", "start independent investigation"], concurrency, accessibility: { keyboardSkipLink: true, reducedMotion: true, unnamedButtons: 0, desktopOverflow: false, tabletOverflow: false, mobileOverflow: false } }, null, 2) + "\n");
} finally {
  cdp?.close(); browser.kill(); server?.kill(); await Promise.all([processExit(browser), ...(server ? [processExit(server)] : [])]); await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
