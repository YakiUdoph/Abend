import type { Citation, EvidencePacket } from "../domain/evidence.js";
import type { AmountExplanation, FinancialProjection } from "../domain/projections.js";
import type { WorkspaceSubmission } from "../domain/workspace.js";
import type { InvestigationRunResponse } from "../server/app.js";

type ApiError = { error?: { message?: string } };
const state: { run: InvestigationRunResponse | undefined; busy: boolean } = { run: undefined, busy: false };
const $ = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing UI element: ${selector}`);
  return node;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}
function formatMoney(raw: string, currency: string, exponent: number, absolute = false): string {
  let value = BigInt(raw);
  const negative = value < 0n;
  if (negative) value = -value;
  const scale = 10n ** BigInt(exponent);
  return `${negative && !absolute ? "−" : ""}${currency} ${value / scale}${exponent ? `.${(value % scale).toString().padStart(exponent, "0")}` : ""}`;
}
function setStep(step: string): void {
  document.querySelectorAll<HTMLElement>(".journey-steps li").forEach((item) => item.dataset.step === step ? item.setAttribute("aria-current", "step") : item.removeAttribute("aria-current"));
}
function statusChip(status: string): HTMLElement { return el("span", `status-chip status-${status.toLowerCase()}`, status.replaceAll("_", " ")); }

function field(label: string, name: string, placeholder = "", value = ""): HTMLLabelElement {
  const wrapper = el("label");
  wrapper.append(document.createTextNode(label));
  const input = el("input");
  input.dataset.field = name;
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = "off";
  wrapper.append(input);
  return wrapper;
}
function removeButton(card: HTMLElement): HTMLButtonElement {
  const button = el("button", "text-button record-remove", "Remove");
  button.type = "button";
  button.addEventListener("click", () => card.remove());
  return button;
}
function addExpense(values: Partial<Record<"label" | "payer" | "amount" | "shares", string>> = {}): void {
  const card = el("article", "record-card");
  const header = el("header");
  header.append(el("strong", "", "Expense"), removeButton(card));
  const fields = el("div", "record-fields");
  fields.append(field("Description", "label", "Accommodation", values.label), field("Paid by", "payer", "Alex", values.payer), field("Amount", "amount", "300.00", values.amount), field("Explicit shares", "shares", "Alex=100.00, Bea=100.00, Chen=100.00", values.shares));
  card.append(header, fields);
  $("#expense-records").append(card);
}
function addPayment(values: Partial<Record<"sender" | "recipient" | "amount" | "purpose" | "status", string>> = {}): void {
  const card = el("article", "record-card");
  const header = el("header");
  header.append(el("strong", "", "Repayment"), removeButton(card));
  const fields = el("div", "record-fields payment-fields");
  fields.append(field("Sender", "sender", "Bea", values.sender), field("Recipient", "recipient", "Alex", values.recipient), field("Amount", "amount", "40.00", values.amount), field("Purpose", "purpose", "Accommodation", values.purpose));
  const label = el("label"); label.append(document.createTextNode("Record status"));
  const select = el("select"); select.dataset.field = "status";
  ["CLAIMED", "INITIATED", "RECEIVED"].forEach((status) => { const option = el("option", "", status); option.value = status; option.selected = status === (values.status ?? "INITIATED"); select.append(option); });
  label.append(select); fields.append(label); card.append(header, fields); $("#payment-records").append(card);
}
function rowValue(row: Element, name: string): string { return row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${name}"]`)?.value.trim() ?? ""; }
function workspaceSubmission(): WorkspaceSubmission {
  const participants = ($("#participants") as HTMLInputElement).value.split(",").map((value) => value.trim()).filter(Boolean);
  const expenses = [...document.querySelectorAll("#expense-records .record-card")].map((row) => ({
    label: rowValue(row, "label"), payer: rowValue(row, "payer"), amount: rowValue(row, "amount"),
    shares: rowValue(row, "shares").split(",").map((entry) => { const separator = entry.lastIndexOf("="); return { participant: entry.slice(0, separator).trim(), amount: entry.slice(separator + 1).trim() }; }),
  }));
  const payments = [...document.querySelectorAll("#payment-records .record-card")].map((row) => ({ sender: rowValue(row, "sender"), recipient: rowValue(row, "recipient"), amount: rowValue(row, "amount"), purpose: rowValue(row, "purpose"), status: rowValue(row, "status") as "CLAIMED" | "INITIATED" | "RECEIVED" }));
  const conversation = ($("#conversation") as HTMLTextAreaElement).value.trim();
  return { participants, currency: ($("#currency") as HTMLSelectElement).value as WorkspaceSubmission["currency"], expenses, payments, ...(conversation ? { conversation } : {}) };
}
function loadSample(): void {
  ($("#participants") as HTMLInputElement).value = "Alex, Bea, Chen";
  ($("#currency") as HTMLSelectElement).value = "EUR";
  $("#expense-records").replaceChildren(); $("#payment-records").replaceChildren();
  addExpense({ label: "Accommodation", payer: "Alex", amount: "300.00", shares: "Alex=100.00, Bea=100.00, Chen=100.00" });
  addPayment({ sender: "Bea", recipient: "Alex", amount: "40.00", purpose: "Accommodation", status: "INITIATED" });
  ($("#conversation") as HTMLTextAreaElement).value = "FICTIONAL TEST DATA: Alex, Bea and Chen agreed to the explicit accommodation shares entered above.";
  $("#sample-notice").removeAttribute("hidden");
}
function resetWorkspace(): void {
  state.run = undefined; ( $("#records-form") as HTMLFormElement).reset(); $("#expense-records").replaceChildren(); $("#payment-records").replaceChildren(); addExpense();
  $("#sample-notice").setAttribute("hidden", ""); $("#evidence-list").replaceChildren();
  ["#investigation-results", "#findings-section", "#review-section", "#balances-section", "#message-section"].forEach((selector) => $(selector).setAttribute("hidden", ""));
  $("#investigation-empty").removeAttribute("hidden"); ($("#verification-nav") as HTMLButtonElement).disabled = true; document.body.dataset.runState = "idle"; setStep("evidence");
}

function citationId(citation: Citation): string { return `citation-${citation.sourceId}-${citation.start}-${citation.end}`; }
function citationButtons(citations: Citation[]): HTMLElement {
  const group = el("div", "citation-links");
  citations.forEach((citation, index) => { const button = el("button", "citation-link", `Open evidence ${index + 1}`); button.type = "button"; button.addEventListener("click", () => { const target = document.getElementById(citationId(citation)); if (target) { target.tabIndex = -1; target.focus(); target.scrollIntoView({ behavior: "smooth", block: "center" }); } }); group.append(button); });
  return group;
}
function renderEvidence(packet: EvidencePacket): void {
  const list = $("#evidence-list"); list.replaceChildren();
  packet.sources.forEach((source, sourceIndex) => { const card = el("article", "source-card"); const header = el("header"); header.append(el("strong", "", source.evidenceType === "CONVERSATION" ? "Conversation excerpt" : source.evidenceType === "EXPENSE_RECORD" ? "Expense agreement" : "Payment record"), el("span", "", `Source ${sourceIndex + 1} · immutable spans`)); const lines = el("ol", "source-lines"); source.spans.forEach((span, index) => { const row = el("li"); row.id = citationId(span); row.append(el("span", "line-number", String(index + 1).padStart(2, "0")), el("span", "line-text", span.text)); lines.append(row); }); card.append(header, lines); list.append(card); });
}
function reasonLabel(reason: string): string { return ({ AMBIGUOUS_PURPOSE: "The record does not establish which obligation this transfer belongs to.", PAYMENT_NOT_CONFIRMED: "The transfer has not been confirmed as received.", PAYMENT_RECEIVED: "Receipt was confirmed through an explicit reviewer decision.", MISSING_SHARING_AGREEMENT: "Not included because no sharing agreement was found.", DOCUMENTED_SHARING_AGREEMENT: "Included because the submitted record documents explicit shares." } as Record<string, string>)[reason] ?? reason.replaceAll("_", " ").toLowerCase(); }
function findingTitle(term: AmountExplanation): string { if (term.kind === "OBLIGATION") { const debtor = term.participants.find(({ role }) => role === "DEBTOR")?.participant ?? "Participant"; const creditor = term.participants.find(({ role }) => role === "CREDITOR")?.participant ?? "participant"; return `${debtor} has a documented obligation to ${creditor}`; } if (term.kind === "PAYMENT") return "A repayment record needs review"; if (term.kind === "EXPENSE") return "Expense is not included"; return "Unresolved sharing term"; }
function renderProjection(projection: FinancialProjection, balanceSelector: string, termSelector: string): void {
  const balances = $(balanceSelector); balances.replaceChildren();
  projection.balances.forEach((balance) => { const row = el("div", "balance-row"); const label = el("span", "", balance.participant); label.append(el("small", "", BigInt(balance.amountMinor) < 0n ? "owes in this projection" : "is owed in this projection")); row.append(label, el("output", "", formatMoney(balance.amountMinor, balance.currency, balance.exponent, true))); balances.append(row); });
  if (!projection.balances.length) balances.append(el("p", "small-note", "No supported balance yet."));
  const terms = $(termSelector); terms.replaceChildren(); projection.terms.forEach((term) => { const row = el("article", "term-row"); const header = el("header"); header.append(el("strong", "", term.kind), el("span", "money", formatMoney(term.amountMinor, term.currency, term.exponent, true))); row.append(header, statusChip(term.status), el("p", "", reasonLabel(term.reason)), citationButtons(term.evidenceReferences)); terms.append(row); });
}
function activeDecisionIds(run: InvestigationRunResponse): Set<string> { return new Set(run.result.projections.afterConfirmations.terms.flatMap(({ decisionReferences }) => decisionReferences).filter(({ active }) => active).map(({ decisionId }) => decisionId)); }
function renderReview(run: InvestigationRunResponse): void {
  const card = $("#review-card"); card.replaceChildren(); const payment = run.result.payments[0]; const agreement = run.result.agreements[0]; const history = $("#decision-history"); history.replaceChildren();
  if (!payment || !agreement) card.append(el("p", "", "No payment finding currently requires a review decision."));
  else { const active = activeDecisionIds(run); const link = run.result.decisions.find(({ kind, id }) => kind === "LINK_PAYMENT_TO_AGREEMENT" && active.has(id)); const confirmation = run.result.decisions.find(({ kind, id }) => kind === "CONFIRM_PAYMENT_RECEIPT" && active.has(id)); card.append(el("h4", "", `Was ${payment.sender}'s transfer to ${payment.recipient} received for ${agreement.expenseLabel}?`), el("p", "", "Linking purpose and confirming receipt are separate decisions.")); const actions = el("div", "review-actions"); if (!link) { const button = el("button", "button button-secondary", `Link to ${agreement.expenseLabel}`); button.type = "button"; button.dataset.action = "link-payment"; button.addEventListener("click", () => void applyDecision("LINK_PAYMENT_TO_AGREEMENT", { paymentId: payment.id, agreementId: agreement.id })); actions.append(button); } else if (!confirmation) { const button = el("button", "button button-primary", "Confirm receipt"); button.type = "button"; button.dataset.action = "confirm-payment"; button.addEventListener("click", () => void applyDecision("CONFIRM_PAYMENT_RECEIPT", { paymentId: payment.id })); actions.append(button); } else { actions.append(statusChip("CONFIRMED")); const button = el("button", "button button-danger", "Reverse receipt confirmation"); button.type = "button"; button.dataset.action = "reverse-payment"; button.addEventListener("click", () => void applyDecision("REVERSE_DECISION", { reversesDecisionId: confirmation.id })); actions.append(button); } card.append(actions); }
  if (!run.result.decisions.length) history.append(el("li", "", "No reviewer decisions yet.")); run.result.decisions.forEach((decision) => { const item = el("li"); item.append(el("strong", "", decision.kind.replaceAll("_", " ")), el("code", "", decision.id), el("span", "small-note", decision.occurredAt)); history.append(item); });
}
function renderRun(run: InvestigationRunResponse): void {
  state.run = run; document.body.dataset.runState = "ready"; renderEvidence(run.packet); $("#investigation-loading").setAttribute("hidden", ""); $("#investigation-results").removeAttribute("hidden"); ["#findings-section", "#review-section", "#balances-section", "#message-section"].forEach((selector) => $(selector).removeAttribute("hidden")); ($("#verification-nav") as HTMLButtonElement).disabled = false;
  const agents = $("#agent-list"); agents.replaceChildren(); run.result.agentWindows.forEach((window) => { const card = el("article", "agent-card"); card.append(el("h4", "", window.role === "agreement" ? "Agreement investigator" : "Payment investigator"), statusChip(window.status), el("code", "", `participant ${window.agentId}\nloop ${window.loopId ?? "not emitted"}`)); agents.append(card); }); $("#overlap-summary").textContent = run.result.overlap.observed && run.result.overlap.distinctLoopIds ? `Genuine concurrency observed: distinct loops overlapped by ${run.result.overlap.overlapMs} ms.` : "Concurrency could not be established from emitted runtime windows.";
  const findings = $("#findings-list"); findings.replaceChildren(); run.result.projections.fromEvidence.terms.forEach((term) => { const card = el("article", "finding-card"); card.append(el("div", "money", formatMoney(term.amountMinor, term.currency, term.exponent, true)), el("h4", "", findingTitle(term)), el("p", "", reasonLabel(term.reason)), statusChip(term.status), citationButtons(term.evidenceReferences)); findings.append(card); });
  renderReview(run); renderProjection(run.result.projections.fromEvidence, "#evidence-balances", "#evidence-terms"); renderProjection(run.result.projections.afterConfirmations, "#confirmed-balances", "#confirmed-terms"); ($("#friendly-message") as HTMLTextAreaElement).value = run.friendlyMessage;
  const manifest = $("#run-manifest"); manifest.textContent = `Run ${run.runId} · ${run.mode} · Agreement ${run.participantIds.agreement} · Payment ${run.participantIds.payment}`; const timeline = $("#event-timeline"); timeline.replaceChildren(); run.result.nativeEvents.forEach((event) => { const item = el("li"); item.append(el("strong", "", event.type), el("code", "", `${event.occurredAt} · producer ${event.producerId}${event.loopId ? ` · loop ${event.loopId}` : ""}`)); timeline.append(item); }); setStep(run.result.decisions.length ? "balances" : "review");
}
async function startInvestigation(): Promise<void> {
  if (state.busy) return; state.busy = true; const button = $("#start-investigation") as HTMLButtonElement; button.disabled = true; $("#input-error").setAttribute("hidden", ""); $("#investigation-error").setAttribute("hidden", ""); $("#investigation-loading").removeAttribute("hidden"); setStep("investigation");
  try { renderRun(await fetchJson<InvestigationRunResponse>("/api/investigations", { method: "POST", body: JSON.stringify(workspaceSubmission()) })); $("#investigation-section").scrollIntoView({ behavior: "smooth" }); }
  catch (error) { const panel = $("#input-error"); panel.textContent = error instanceof Error ? error.message : "The records could not be investigated."; panel.removeAttribute("hidden"); $("#investigation-loading").setAttribute("hidden", ""); document.body.dataset.runState = "error"; }
  finally { state.busy = false; button.disabled = false; }
}
async function applyDecision(kind: string, target: Record<string, string>): Promise<void> {
  if (!state.run || state.busy) return; state.busy = true; const run = state.run;
  try { renderRun(await fetchJson<InvestigationRunResponse>(`/api/investigations/${encodeURIComponent(run.runId)}/decisions`, { method: "POST", headers: { "x-abend-session": run.accessToken }, body: JSON.stringify({ kind, ...target }) })); }
  catch (error) { const panel = $("#review-error"); panel.textContent = error instanceof Error ? error.message : "The decision could not be applied."; panel.removeAttribute("hidden"); }
  finally { state.busy = false; }
}
function initialize(): void {
  addExpense(); $("#add-expense").addEventListener("click", () => addExpense()); $("#add-payment").addEventListener("click", () => addPayment()); $("#load-sample").addEventListener("click", loadSample); $("#new-investigation").addEventListener("click", resetWorkspace); $("#records-form").addEventListener("submit", (event) => { event.preventDefault(); void startInvestigation(); }); $("#verification-nav").addEventListener("click", () => ($("#verification-dialog") as HTMLDialogElement).showModal()); $("#close-verification").addEventListener("click", () => ($("#verification-dialog") as HTMLDialogElement).close()); $("#copy-message").addEventListener("click", async () => { const textarea = $("#friendly-message") as HTMLTextAreaElement; try { await navigator.clipboard.writeText(textarea.value); $("#copy-status").textContent = "Copied."; } catch { textarea.select(); $("#copy-status").textContent = "Select and copy the highlighted message."; } });
}
initialize();
