import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createFictionalEvidencePacket } from "../fixtures/fictional-evidence.js";
import {
  createInvestigation,
  type InvestigationResult,
} from "../runtime/investigation.js";
import type { HumanDecisionKind } from "../domain/reconciliation.js";
import type { EvidencePacket } from "../domain/evidence.js";
import { workspacePacketFromUnknown } from "../domain/workspace.js";

const MAX_REQUEST_BYTES = 32_768;
const MAX_INVESTIGATIONS_PER_MINUTE = 10;
const projectRoot = process.cwd();

type Investigation = ReturnType<typeof createInvestigation>;

type InvestigationSession = {
  runId: string;
  accessToken: string;
  createdAt: string;
  mode: "WORKSPACE" | "DEMONSTRATION";
  packet: EvidencePacket;
  investigation: Investigation;
  result: InvestigationResult;
};

export type InvestigationRunResponse = {
  runId: string;
  accessToken: string;
  createdAt: string;
  mode: "WORKSPACE" | "DEMONSTRATION";
  participantIds: Investigation["participantIds"];
  packet: EvidencePacket;
  result: InvestigationResult;
  friendlyMessage: string;
};
export type DemoRunResponse = InvestigationRunResponse;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, status: number, code: string, message: string): void {
  sendJson(response, status, { error: { code, message } });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_JSON_BODY");
  return parsed as Record<string, unknown>;
}

function money(minor: string, currency: string, exponent: number): string {
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(exponent);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(exponent, "0");
  return `${negative ? "−" : ""}${currency} ${whole}${exponent > 0 ? `.${fraction}` : ""}`;
}

function friendlyMessage(result: InvestigationResult): string {
  const payment = result.payments[0];
  const after = payment
    ? result.projections.afterConfirmations.balances.find(
        ({ participant, currency }) => participant === payment.sender && currency === payment.currency,
      )
    : undefined;
  const paymentTerm = payment
    ? result.projections.afterConfirmations.terms.find(({ paymentId }) => paymentId === payment.id)
    : undefined;
  const excludedExpense = result.projections.afterConfirmations.terms.find(({ kind, status }) => kind === "EXPENSE" && status === "EXCLUDED");
  const balanceText = after ? money(after.amountMinor, after.currency, after.exponent).replace("−", "") : "the supported amount";
  if (paymentTerm?.status === "CONFIRMED") {
    return `I worked through the submitted records. After confirming the repayment, ${payment?.sender ?? "the sender"} has ${balanceText} outstanding.${excludedExpense ? " One expense is still not included because its sharing agreement is unresolved." : ""}`;
  }
  return `I worked through the submitted records. A repayment record is not counted until its receipt and purpose are supported or explicitly confirmed. Please review the unresolved items before using the balances.`;
}

function publicSession(session: InvestigationSession): InvestigationRunResponse {
  return {
    runId: session.runId,
    accessToken: session.accessToken,
    createdAt: session.createdAt,
    mode: session.mode,
    participantIds: session.investigation.participantIds,
    packet: session.packet,
    result: session.result,
    friendlyMessage: friendlyMessage(session.result),
  };
}

function staticHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

async function serveFile(response: ServerResponse, path: string, contentType: string): Promise<void> {
  const content = await readFile(path);
  response.writeHead(200, staticHeaders(contentType));
  response.end(content);
}

function validDecisionKind(value: unknown): value is HumanDecisionKind {
  return [
    "LINK_PAYMENT_TO_AGREEMENT",
    "CONFIRM_PAYMENT_RECEIPT",
    "REVERSE_DECISION",
  ].includes(String(value));
}

export function createAbendServer() {
  const sessions = new Map<string, InvestigationSession>();
  const startsByAddress = new Map<string, number[]>();

  function startAllowed(address: string): boolean {
    const now = Date.now();
    const recent = (startsByAddress.get(address) ?? []).filter((timestamp) => timestamp > now - 60_000);
    if (recent.length >= MAX_INVESTIGATIONS_PER_MINUTE) return false;
    recent.push(now);
    startsByAddress.set(address, recent);
    return true;
  }

  async function createSession(packet: EvidencePacket, mode: InvestigationSession["mode"]): Promise<InvestigationSession> {
    const investigation = createInvestigation(packet, { delaysMs: { agreement: 55, payment: 30 }, timeoutMs: 1_000 });
    const result = await investigation.run();
    const session = { runId: randomUUID(), accessToken: randomUUID(), createdAt: new Date().toISOString(), mode, packet, investigation, result };
    sessions.set(session.runId, session);
    return session;
  }

  return createServer(async (request, response) => {
    try {
      const base = `http://${request.headers.host ?? "127.0.0.1"}`;
      const url = new URL(request.url ?? "/", base);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { status: "ok", service: "abend", mode: "WORKSPACE" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/") {
        await serveFile(response, resolve(projectRoot, "public/index.html"), "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/assets/styles.css") {
        await serveFile(response, resolve(projectRoot, "public/styles.css"), "text/css; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/assets/app.js") {
        await serveFile(response, resolve(projectRoot, "dist/src/web/client.js"), "text/javascript; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/demo") {
        sendJson(response, 200, {
          mode: {
            demonstration: {
              status: "AVAILABLE",
              label: "Demonstration mode",
              description: "Fictional evidence with the deterministic Mozaik inference runner.",
            },
            live: {
              status: "BLOCKED",
              label: "Live investigation",
              description: "Provider-backed inference has not returned validated findings and is not available here.",
            },
          },
          packet: createFictionalEvidencePacket(),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/demo/investigations") {
        if (!startAllowed(request.socket.remoteAddress ?? "unknown")) return sendError(response, 429, "RATE_LIMITED", "Too many investigations were started. Try again in one minute.");
        const session = await createSession(createFictionalEvidencePacket(), "DEMONSTRATION");
        sendJson(response, 201, publicSession(session));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/investigations") {
        if (!startAllowed(request.socket.remoteAddress ?? "unknown")) return sendError(response, 429, "RATE_LIMITED", "Too many investigations were started. Try again in one minute.");
        const body = await readJson(request);
        const { packet } = workspacePacketFromUnknown(body);
        const session = await createSession(packet, "WORKSPACE");
        sendJson(response, 201, publicSession(session));
        return;
      }

      const decisionMatch = /^\/api\/(?:demo\/)?investigations\/([^/]+)\/decisions$/.exec(url.pathname);
      if (request.method === "POST" && decisionMatch) {
        const runId = decodeURIComponent(decisionMatch[1] ?? "");
        const session = sessions.get(runId);
        if (!session) {
          sendError(response, 404, "RUN_NOT_FOUND", "This demonstration run is no longer available. Start a new one.");
          return;
        }
        if (request.headers["x-abend-session"] !== session.accessToken) {
          sendError(response, 403, "SESSION_ACCESS_DENIED", "This investigation belongs to a different browser session.");
          return;
        }
        const body = await readJson(request);
        if (!validDecisionKind(body.kind)) {
          sendError(response, 400, "INVALID_DECISION", "This review decision is not supported.");
          return;
        }
        const target = {
          ...(typeof body.paymentId === "string" ? { paymentId: body.paymentId } : {}),
          ...(typeof body.agreementId === "string" ? { agreementId: body.agreementId } : {}),
          ...(typeof body.reversesDecisionId === "string" ? { reversesDecisionId: body.reversesDecisionId } : {}),
        };
        session.result = session.investigation.reviewDecision(body.kind, target);
        sendJson(response, 200, publicSession(session));
        return;
      }

      sendError(response, 404, "NOT_FOUND", "The requested route does not exist.");
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(response, 400, "INVALID_JSON", "The request body must be valid JSON.");
        return;
      }
      if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
        sendError(response, 413, "REQUEST_TOO_LARGE", "The review request is too large.");
        return;
      }
      const code = error instanceof Error && /^[A-Z0-9_:.-]+$/.test(error.message)
        ? error.message
        : "REQUEST_FAILED";
      sendError(response, 409, code, "The requested change could not be applied. The existing evidence and decisions were preserved.");
    }
  });
}

export async function startAbendServer(port = Number(process.env.PORT ?? 4173), host = "127.0.0.1") {
  const server = createAbendServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SERVER_ADDRESS_UNAVAILABLE");
  const url = `http://${host}:${address.port}`;
  return { server, url };
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entry === import.meta.url) {
  const { url } = await startAbendServer(
    Number(process.env.PORT ?? 4173),
    process.env.HOST ?? "127.0.0.1",
  );
  process.stdout.write(`ABEND_SERVER_URL=${url}\n`);
}
