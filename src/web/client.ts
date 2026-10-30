import type { EvidencePacket, Citation } from "../domain/evidence.js";
import type { FinancialProjection, AmountExplanation } from "../domain/projections.js";
import type { DemoRunResponse } from "../server/app.js";

type DemoBootstrap = {
  mode: {
    demonstration: { status: string; label: string; description: string };
    live: { status: string; label: string; description: string };
  };
  packet: EvidencePacket;
};

type ApiError = { error?: { code?: string; message?: string } };

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const state: {
  bootstrap: DemoBootstrap | undefined;
  run: DemoRunResponse | undefined;
  busy: boolean;
} = { bootstrap: undefined, run: undefined, busy: false };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatMoney(minor: string, currency: string, exponent: number, absolute = false): string {
  let value = BigInt(minor);
  const negative = value < 0n;
  if (negative) value = -value;
  const scale = 10n ** BigInt(exponent);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(exponent, "0");
  return `${negative && !absolute ? "−" : ""}${currency} ${whole}${exponent > 0 ? `.${fraction}` : ""}`;
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    AMBIGUOUS_PURPOSE: "The record does not establish which obligation this transfer belongs to.",
    PAYMENT_NOT_CONFIRMED: "The transfer has not been confirmed as received.",
    PAYMENT_RECEIVED: "Receipt was confirmed through an explicit reviewer decision.",
    MISSING_SHARING_AGREEMENT: "Not included because no sharing agreement was found.",
    DOCUMENTED_SHARING_AGREEMENT: "Included because the conversation documents the sharing agreement.",
    SPLIT_USER_CONFIRMED: "Included after an explicit reviewer decision.",
  };
  return labels[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

function citationId(citation: Citation): string {
  return `citation-${citation.sourceId}-${citation.start}-${citation.end}`;
}

function citationButtons(citations: Citation[]): HTMLElement {
  const group = element("div", "citation-links");
  citations.forEach((citation, index) => {
    const button = element("button", "citation-link", `Open evidence ${index + 1}`);
    button.type = "button";
    button.addEventListener("click", () => {
      const target = document.getElementById(citationId(citation));
      document.querySelectorAll(".citation-active").forEach((node) => node.classList.remove("citation-active"));
      if (target) {
        target.classList.add("citation-active");
        target.setAttribute("tabindex", "-1");
        target.focus();
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        history.replaceState(null, "", `#${target.id}`);
      }
    });
    group.append(button);
  });
  return group;
}

function renderEvidence(packet: EvidencePacket): void {
  const list = $("#evidence-list");
  list.replaceChildren();
  packet.sources.forEach((source, sourceIndex) => {
    const card = element("article", "source-card");
    const header = element("header");
    header.append(
      element("strong", "", source.evidenceType === "CONVERSATION" ? "Conversation excerpt" : "Payment record"),
      element("span", "", `Source ${sourceIndex + 1} · immutable spans`),
    );
    const lines = element("ol", "source-lines");
    source.spans.forEach((span, index) => {
      const row = element("li");
      row.id = citationId(span);
      row.append(element("span", "line-number", String(index + 1).padStart(2, "0")), element("span", "line-text", span.text));
      lines.append(row);
    });
    card.append(header, lines);
    list.append(card);
  });
}

function setStep(step: "evidence" | "investigation" | "review" | "balances" | "message"): void {
  document.querySelectorAll<HTMLElement>(".journey-steps li").forEach((item) => {
    if (item.dataset.step === step) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}

function statusChip(status: string): HTMLElement {
  return element("span", `status-chip status-${status.toLowerCase()}`, status.replaceAll("_", " "));
}

function renderAgents(run: DemoRunResponse): void {
  const list = $("#agent-list");
  list.replaceChildren();
  run.result.agentWindows.forEach((window) => {
    const card = element("article", "agent-card");
    const header = element("header");
    const title = element("div");
    title.append(
      element("h4", "", window.role === "agreement" ? "Agreement investigator" : "Payment investigator"),
      element("p", "", window.role === "agreement" ? "Checked the supported split" : "Checked the transfer record"),
    );
    header.append(title, statusChip(window.status));
    const details = element("dl");
    const fields = [
      ["Participant", window.agentId],
      ["Loop", window.loopId ?? "Not emitted"],
      ["Started", window.startedAt ?? "Not emitted"],
      ["Completed", window.completedAt ?? "Not emitted"],
    ];
    fields.forEach(([label, value]) => details.append(element("dt", "", label), element("dd", "", value)));
    card.append(header, details);
    list.append(card);
  });
  const overlap = $("#overlap-summary");
  const genuine = run.result.overlap.observed && run.result.overlap.distinctLoopIds;
  overlap.classList.toggle("warning", !genuine);
  overlap.textContent = genuine
    ? `Genuine concurrency observed: distinct loops overlapped by ${run.result.overlap.overlapMs} ms.`
    : "Concurrency could not be established from the emitted runtime windows.";
}

function findingTitle(term: AmountExplanation): string {
  if (term.kind === "OBLIGATION") {
    const debtor = term.participants.find(({ role }) => role === "DEBTOR")?.participant ?? "Participant";
    const creditor = term.participants.find(({ role }) => role === "CREDITOR")?.participant ?? "participant";
    return `${debtor} has a documented obligation to ${creditor}`;
  }
  if (term.kind === "PAYMENT") return "The record indicates a transfer was initiated";
  if (term.kind === "EXPENSE") return "Taxi expense is not included";
  return "Unresolved sharing term";
}

function renderFindings(projection: FinancialProjection): void {
  const list = $("#findings-list");
  list.replaceChildren();
  projection.terms.forEach((term) => {
    const card = element("article", "finding-card");
    card.dataset.termKind = term.kind;
    card.append(element("div", "money", formatMoney(term.amountMinor, term.currency, term.exponent, true)));
    const copy = element("div");
    copy.append(element("h4", "", findingTitle(term)), element("p", "", reasonLabel(term.reason)), citationButtons(term.evidenceReferences));
    card.append(copy, statusChip(term.status));
    list.append(card);
  });
}

function renderProjection(projection: FinancialProjection, balanceSelector: string, termSelector: string): void {
  const balances = $(balanceSelector);
  balances.replaceChildren();
  projection.balances.forEach((balance) => {
    const row = element("div", "balance-row");
    const label = element("span", "", balance.participant);
    label.append(element("small", "", BigInt(balance.amountMinor) < 0n ? "owes in this projection" : "is owed in this projection"));
    const output = element("output", "", formatMoney(balance.amountMinor, balance.currency, balance.exponent, true));
    output.setAttribute("aria-label", `${balance.participant}: ${output.textContent}`);
    row.append(label, output);
    balances.append(row);
  });

  const terms = $(termSelector);
  terms.replaceChildren();
  projection.terms.forEach((term) => {
    const row = element("article", "term-row");
    const header = element("header");
    header.append(element("strong", "", term.kind), element("span", "money", formatMoney(term.amountMinor, term.currency, term.exponent, true)));
    row.append(header, statusChip(term.status), element("p", "", reasonLabel(term.reason)), citationButtons(term.evidenceReferences));
    if (term.decisionReferences.length > 0) {
      row.append(element("p", "", `${term.decisionReferences.length} reviewer decision reference${term.decisionReferences.length === 1 ? "" : "s"}`));
    }
    terms.append(row);
  });
}

function activeDecisionIds(run: DemoRunResponse): Set<string> {
  return new Set(
    run.result.projections.afterConfirmations.terms
      .flatMap(({ decisionReferences }) => decisionReferences)
      .filter(({ active }) => active)
      .map(({ decisionId }) => decisionId),
  );
}

function renderReview(run: DemoRunResponse): void {
  const card = $("#review-card");
  card.replaceChildren();
  const payment = run.result.payments[0];
  const agreement = run.result.agreements[0];
  if (!payment || !agreement) {
    card.append(element("p", "", "The available findings do not support this review action."));
    return;
  }
  const activeIds = activeDecisionIds(run);
  const activeLink = run.result.decisions.find(({ kind, id }) => kind === "LINK_PAYMENT_TO_AGREEMENT" && activeIds.has(id));
  const activeConfirmation = run.result.decisions.find(({ kind, id }) => kind === "CONFIRM_PAYMENT_RECEIPT" && activeIds.has(id));
  card.append(
    element("h4", "", "Was Bea’s EUR 40 transfer received for the accommodation?"),
    element("p", "", "The payment record says initiated. Linking and confirming are separate, validated decisions."),
    element("div", "record", `Bea → Alex · ${formatMoney(payment.amountMinor, payment.currency, 2, true)} · ${payment.transferState}`),
  );
  const actions = element("div", "review-actions");
  if (!activeLink) {
    const button = element("button", "button button-secondary", "Link to accommodation");
    button.type = "button";
    button.dataset.action = "link-payment";
    button.addEventListener("click", () => applyDecision("LINK_PAYMENT_TO_AGREEMENT", { paymentId: payment.id, agreementId: agreement.id }));
    actions.append(button);
  } else if (!activeConfirmation) {
    const button = element("button", "button button-primary", "Confirm receipt");
    button.type = "button";
    button.dataset.action = "confirm-payment";
    button.setAttribute("aria-describedby", "review-consequence");
    button.addEventListener("click", () => applyDecision("CONFIRM_PAYMENT_RECEIPT", { paymentId: payment.id }));
    actions.append(button);
  } else {
    actions.append(statusChip("CONFIRMED"));
    const reverse = element("button", "button button-danger", "Reverse receipt confirmation");
    reverse.type = "button";
    reverse.dataset.action = "reverse-payment";
    reverse.addEventListener("click", () => applyDecision("REVERSE_DECISION", { reversesDecisionId: activeConfirmation.id }));
    actions.append(reverse);
  }
  const consequence = element("p", "small-note", activeConfirmation
    ? "Receipt is included. Reversing it will restore the evidence-only balance."
    : "Confirming receipt will recalculate Bea’s balance using the deterministic engine.");
  consequence.id = "review-consequence";
  card.append(actions, consequence);

  const history = $("#decision-history");
  history.replaceChildren();
  if (run.result.decisions.length === 0) history.append(element("li", "", "No reviewer decisions yet."));
  run.result.decisions.forEach((decision) => {
    const item = element("li", activeIds.has(decision.id) || decision.kind === "REVERSE_DECISION" ? "" : "inactive");
    item.append(element("strong", "", decision.kind.replaceAll("_", " ")), element("code", "", decision.id), element("span", "small-note", decision.occurredAt));
    history.append(item);
  });
}

function renderVerification(run: DemoRunResponse): void {
  const manifest = $("#run-manifest");
  const dl = element("dl", "manifest-grid");
  const fields = [
    ["Abend run ID", run.runId],
    ["Mode", "DEMONSTRATION — deterministic inference runner"],
    ["Agreement participant", run.participantIds.agreement],
    ["Payment participant", run.participantIds.payment],
    ["Reconciliation participant", run.participantIds.reconciler],
    ["Reviewer participant", run.participantIds.reviewer],
    ["Observed overlap", `${run.result.overlap.overlapMs} ms`],
    ["Live provider", "NOT TESTED — blocked"],
  ];
  fields.forEach(([label, value]) => {
    const item = element("div");
    item.append(element("dt", "", label), element("dd", "", value));
    dl.append(item);
  });
  manifest.replaceChildren(dl);
  const timeline = $("#event-timeline");
  timeline.replaceChildren();
  run.result.nativeEvents.forEach((event) => {
    const item = element("li");
    item.append(
      element("strong", "", event.type),
      element("code", "", `${event.occurredAt} · producer ${event.producerId}${event.loopId ? ` · loop ${event.loopId}` : ""}`),
    );
    timeline.append(item);
  });
}

function renderRun(run: DemoRunResponse): void {
  state.run = run;
  document.body.dataset.runState = "ready";
  $("#investigation-empty").setAttribute("hidden", "");
  $("#investigation-loading").setAttribute("hidden", "");
  $("#investigation-results").removeAttribute("hidden");
  $("#findings-section").removeAttribute("hidden");
  $("#review-section").removeAttribute("hidden");
  $("#balances-section").removeAttribute("hidden");
  $("#message-section").removeAttribute("hidden");
  ($("#verification-nav") as HTMLButtonElement).disabled = false;
  renderAgents(run);
  renderFindings(run.result.projections.fromEvidence);
  renderReview(run);
  renderProjection(run.result.projections.fromEvidence, "#evidence-balances", "#evidence-terms");
  renderProjection(run.result.projections.afterConfirmations, "#confirmed-balances", "#confirmed-terms");
  ($("#friendly-message") as HTMLTextAreaElement).value = run.friendlyMessage;
  renderVerification(run);
  setStep(run.result.decisions.length > 0 ? "balances" : "review");
}

async function startInvestigation(): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  document.body.dataset.runState = "loading";
  ($("#start-investigation") as HTMLButtonElement).disabled = true;
  $("#investigation-empty").setAttribute("hidden", "");
  $("#investigation-error").setAttribute("hidden", "");
  $("#investigation-loading").removeAttribute("hidden");
  setStep("investigation");
  $("#investigation-section").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    renderRun(await fetchJson<DemoRunResponse>("/api/demo/investigations", { method: "POST", body: "{}" }));
  } catch (error) {
    document.body.dataset.runState = "error";
    const panel = $("#investigation-error");
    panel.replaceChildren(
      element("strong", "", "The investigation did not complete."),
      element("p", "", error instanceof Error ? error.message : "The request failed. Your fictional source evidence is still available."),
    );
    const retry = element("button", "button button-secondary", "Try the demonstration again");
    retry.type = "button";
    retry.addEventListener("click", startInvestigation);
    panel.append(retry);
    panel.removeAttribute("hidden");
    $("#investigation-loading").setAttribute("hidden", "");
  } finally {
    state.busy = false;
    ($("#start-investigation") as HTMLButtonElement).disabled = false;
  }
}

async function applyDecision(kind: string, target: Record<string, string>): Promise<void> {
  if (!state.run || state.busy) return;
  state.busy = true;
  const panel = $("#review-error");
  panel.setAttribute("hidden", "");
  document.querySelectorAll<HTMLButtonElement>("#review-card button").forEach((button) => { button.disabled = true; });
  try {
    const run = await fetchJson<DemoRunResponse>(`/api/demo/investigations/${encodeURIComponent(state.run.runId)}/decisions`, {
      method: "POST",
      body: JSON.stringify({ kind, ...target }),
    });
    renderRun(run);
    $("#balances-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    panel.textContent = error instanceof Error ? error.message : "The decision could not be applied. Existing evidence and decisions were preserved.";
    panel.removeAttribute("hidden");
  } finally {
    state.busy = false;
    document.querySelectorAll<HTMLButtonElement>("#review-card button").forEach((button) => { button.disabled = false; });
  }
}

async function initialize(): Promise<void> {
  try {
    state.bootstrap = await fetchJson<DemoBootstrap>("/api/demo");
  } catch {
    state.bootstrap = undefined;
  }
  $("#open-demo").addEventListener("click", () => {
    const demo = $("#demo");
    demo.removeAttribute("hidden");
    if (state.bootstrap) renderEvidence(state.bootstrap.packet);
    demo.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#start-investigation").addEventListener("click", startInvestigation);
  $("#verification-nav").addEventListener("click", () => ($("#verification-dialog") as HTMLDialogElement).showModal());
  $("#close-verification").addEventListener("click", () => ($("#verification-dialog") as HTMLDialogElement).close());
  $("#copy-message").addEventListener("click", async () => {
    const textarea = $("#friendly-message") as HTMLTextAreaElement;
    try {
      await navigator.clipboard.writeText(textarea.value);
      $("#copy-status").textContent = "Copied.";
    } catch {
      textarea.select();
      $("#copy-status").textContent = "Select and copy the highlighted message.";
    }
  });
}

void initialize();
