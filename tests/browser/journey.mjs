import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import WebSocket from "ws";

const projectRoot = process.cwd();
const artifactDirectory = join(projectRoot, ".artifacts");

function chromePath() {
  const candidates = process.platform === "win32"
    ? [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find(Boolean);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw lastError ?? new Error("Timed out waiting for browser state");
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.targetId = 0;
    this.targetPending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.on("message", (data) => {
      const raw = data.toString("utf8");
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        process.stderr.write(`[browser] failed to parse CDP message: ${String(error)} (${String(raw).slice(0, 120)})\n`);
        return;
      }
      if (payload.method === "Target.receivedMessageFromTarget") {
        const inner = JSON.parse(payload.params.message);
        const pending = this.targetPending.get(inner.id);
        if (!pending) return;
        this.targetPending.delete(inner.id);
        if (inner.error) pending.reject(new Error(inner.error.message));
        else pending.resolve(inner.result);
        return;
      }
      if (!payload.id) return;
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      this.pending.delete(payload.id);
      if (payload.error) pending.reject(new Error(payload.error.message));
      else pending.resolve(payload.result);
    });
    this.socket.on("close", (code, reason) => {
      process.stderr.write(`[browser] CDP socket closed (${code}): ${reason.toString()}\n`);
    });
    this.socket.on("error", (error) => {
      process.stderr.write(`[browser] CDP socket error: ${error.message}\n`);
    });
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
  }

  async attach(targetId) {
    const result = await this.send("Target.attachToTarget", { targetId, flatten: false }, 10_000, false);
    this.sessionId = result.sessionId;
  }

  send(method, params = {}, timeoutMs = 10_000, useSession = true) {
    if (useSession && this.sessionId) return this.sendToTarget(method, params, timeoutMs);
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      const message = { id, method, params };
      if (useSession && this.sessionId) message.sessionId = this.sessionId;
      this.socket.send(JSON.stringify(message), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  sendToTarget(method, params = {}, timeoutMs = 10_000) {
    const id = ++this.targetId;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.targetPending.delete(id);
        reject(new Error(`CDP target command timed out: ${method}`));
      }, timeoutMs);
      this.targetPending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    void this.send("Target.sendMessageToTarget", {
      sessionId: this.sessionId,
      message: JSON.stringify({ id, method, params }),
    }, timeoutMs, false).catch((error) => {
      const pending = this.targetPending.get(id);
      this.targetPending.delete(id);
      pending?.reject(error);
    });
    return response;
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() { this.socket.close(); }
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, { cwd: projectRoot, windowsHide: true, ...options });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function serverUrl(process) {
  let output = "";
  process.stdout.setEncoding("utf8");
  process.stdout.on("data", (chunk) => { output += chunk; });
  process.stderr.setEncoding("utf8");
  process.stderr.on("data", (chunk) => { output += chunk; });
  return waitFor(() => /ABEND_SERVER_URL=(http:\/\/[^\s]+)/.exec(output)?.[1], 10_000);
}

const browserExecutable = chromePath();
if (!browserExecutable) throw new Error("Chrome or Edge is required for browser verification. Set CHROME_PATH if installed elsewhere.");

function stage(label) {
  process.stdout.write(`[browser] ${label}\n`);
}

const serverProcess = startProcess(process.execPath, ["dist/src/server/app.js"], { env: { ...process.env, PORT: "0" } });
const profile = await mkdtemp(join(tmpdir(), "abend-browser-"));
const debugPort = await freePort();
const browserProcess = startProcess(browserExecutable, [
  "--headless=new",
  "--no-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-gpu-sandbox",
  "--disable-background-networking",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  "--remote-allow-origins=*",
  `--user-data-dir=${profile}`,
  "about:blank",
]);
let browserOutput = "";
browserProcess.stdout.setEncoding("utf8");
browserProcess.stderr.setEncoding("utf8");
browserProcess.stdout.on("data", (chunk) => { browserOutput += chunk; });
browserProcess.stderr.on("data", (chunk) => { browserOutput += chunk; });

let cdp;
try {
  stage("waiting for local server and browser");
  const baseUrl = await serverUrl(serverProcess);
  const version = await waitFor(async () => {
    if (browserProcess.exitCode !== null) {
      throw new Error(`Browser exited before CDP became available (${browserProcess.exitCode}). ${browserOutput.trim()}`);
    }
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : undefined;
  });
  assert.ok(version.Browser);
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = pages.find((candidate) => candidate.type === "page");
  stage(`selected target ${page?.url ?? "none"} (${page?.id ?? "no id"})`);
  assert.ok(page?.webSocketDebuggerUrl);
  cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.connect();
  stage("connected to Chrome DevTools Protocol");
  const createdTarget = await cdp.send("Target.createTarget", { url: baseUrl }, 10_000, false);
  await cdp.attach(createdTarget.targetId);
  stage("attached to browser page target");
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Accessibility.enable");
  await waitFor(() => cdp.evaluate("document.readyState === 'complete'"));
  stage("loaded Abend");

  assert.equal(await cdp.evaluate("document.title"), "Abend — Settle the numbers. Keep the friendship.");
  assert.equal(await cdp.evaluate("document.querySelectorAll('main').length === 1 && Boolean(document.querySelector('nav[aria-label]'))"), true);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await cdp.evaluate("document.activeElement.classList.contains('skip-link')"), true);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal(await cdp.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches && parseFloat(getComputedStyle(document.querySelector('#open-demo')).transitionDuration) < 0.001"), true);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  assert.equal(await cdp.evaluate("document.querySelector('.mode-blocked').innerText.includes('Live investigation')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#demo').hidden"), true);

  await cdp.evaluate("document.querySelector('#open-demo').click()");
  await waitFor(() => cdp.evaluate("!document.querySelector('#demo').hidden && document.querySelectorAll('.source-lines li').length >= 7"));
  stage("opened fictional evidence");
  assert.equal(await cdp.evaluate("document.querySelector('#demo').innerText.includes('FICTIONAL TEST DATA')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#evidence-list').innerText.includes('status initiated')"), true);

  await cdp.evaluate("document.querySelector('#start-investigation').click()");
  await waitFor(() => cdp.evaluate("document.body.dataset.runState === 'ready'"), 15_000);
  stage("completed investigation");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.agent-card').length"), 2);
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('.agent-card')].every(card => card.innerText.includes('COMPLETED'))"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#overlap-summary').innerText.includes('Genuine concurrency observed')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#findings-list').innerText.includes('Taxi expense is not included')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#evidence-balances').innerText.includes('EUR 100.00')"), true);

  await cdp.evaluate("document.querySelector('[data-action=\"link-payment\"]').click()");
  await waitFor(() => cdp.evaluate("Boolean(document.querySelector('[data-action=\"confirm-payment\"]'))"));
  await cdp.evaluate("document.querySelector('[data-action=\"confirm-payment\"]').click()");
  await waitFor(() => cdp.evaluate("Boolean(document.querySelector('[data-action=\"reverse-payment\"]'))"));
  stage("applied reviewer decisions");
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('#confirmed-balances .balance-row')].some(row => row.innerText.includes('Bea') && row.innerText.includes('EUR 60.00'))"), true);
  assert.equal(await cdp.evaluate("[...document.querySelectorAll('#confirmed-balances .balance-row')].some(row => row.innerText.includes('Chen') && row.innerText.includes('EUR 100.00'))"), true);
  assert.equal(await cdp.evaluate("document.querySelectorAll('#decision-history li').length"), 2);

  await cdp.evaluate("document.querySelector('#findings-list .citation-link').click()");
  assert.equal(await cdp.evaluate("location.hash.startsWith('#citation-') && document.querySelector(location.hash).classList.contains('citation-active')"), true);

  await cdp.evaluate("document.querySelector('#verification-nav').click()");
  await waitFor(() => cdp.evaluate("document.querySelector('#verification-dialog').open"));
  stage("opened verification view");
  assert.equal(await cdp.evaluate("document.querySelector('#event-timeline').innerText.includes('agreement.finding')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#event-timeline').innerText.includes('payment.finding')"), true);
  assert.equal(await cdp.evaluate("document.querySelector('#event-timeline').innerText.includes('human.decision')"), true);

  const accessibility = await cdp.send("Accessibility.getFullAXTree");
  stage("checked accessibility tree");
  const unnamedButtons = accessibility.nodes.filter((node) => node.role?.value === "button" && !node.name?.value);
  assert.equal(unnamedButtons.length, 0, "Every browser-visible button must have an accessible name");
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('label[for=\"friendly-message\"]'))"), true);

  const concurrency = await cdp.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.agent-card')];
    return {
      overlap: document.querySelector('#overlap-summary').innerText,
      agents: cards.map(card => {
        const values = [...card.querySelectorAll('dd')].map(node => node.textContent);
        return { participantId: values[0], loopId: values[1], startedAt: values[2], completedAt: values[3] };
      }),
      eventCount: document.querySelectorAll('#event-timeline li').length,
    };
  })()`);

  await cdp.evaluate("document.querySelector('#close-verification').click()");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await cdp.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true);

  await mkdir(artifactDirectory, { recursive: true });
  const desktop = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(artifactDirectory, "abend-mobile.png"), Buffer.from(desktop.data, "base64"));
  stage("captured mobile verification artifact");

  process.stdout.write(JSON.stringify({
    status: "PASS",
    browser: version.Browser,
    journey: ["open fictional evidence", "run investigation", "inspect findings", "link payment", "confirm receipt", "compare projections", "open citation", "inspect authentic timeline"],
    concurrency,
    accessibility: { keyboardSkipLink: true, reducedMotion: true, unnamedButtons: 0, mobileOverflow: false },
    screenshot: ".artifacts/abend-mobile.png",
  }, null, 2) + "\n");
} catch (error) {
  if (browserOutput.trim()) process.stderr.write(`[browser] browser diagnostics:\n${browserOutput.trim()}\n`);
  throw error;
} finally {
  cdp?.close();
  browserProcess.kill();
  serverProcess.kill();
  await Promise.all([waitForExit(browserProcess), waitForExit(serverProcess)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
}
