import {
  DeveloperMessageItem,
  ModelMessageItem,
  SemanticEvent,
  UserMessageItem,
  type InferenceInput,
  type InferenceOutput,
  type InferenceRunner,
} from "@mozaik-ai/core";
import { packetFromAgentMessage } from "../domain/evidence.js";
import { extractAgreements, extractPayments } from "../domain/extractors.js";
import type { AgentOutput, Finding } from "../domain/findings.js";

export type InvestigatorRole = "agreement" | "payment";

export type RunnerOptions = {
  delaysMs?: Partial<Record<InvestigatorRole, number>>;
  failRole?: InvestigatorRole;
  corruptCitationRole?: InvestigatorRole;
  duplicateFindingsRole?: InvestigatorRole;
};

function investigatorRole(input: InferenceInput): InvestigatorRole {
  const instruction = input.context
    .getItems()
    .find((item): item is DeveloperMessageItem => item instanceof DeveloperMessageItem)?.content.text;
  if (instruction?.includes("AGREEMENT_INVESTIGATOR")) return "agreement";
  if (instruction?.includes("PAYMENT_INVESTIGATOR")) return "payment";
  throw new Error("Unknown deterministic investigator role");
}

function evidenceMessage(input: InferenceInput): string {
  const messages = input.context
    .getItems()
    .filter((item): item is UserMessageItem => item instanceof UserMessageItem);
  const message = messages.at(-1)?.content.text;
  if (!message) throw new Error("Missing evidence packet message");
  return message;
}

export class DeterministicInvestigatorRunner implements InferenceRunner {
  constructor(private readonly options: RunnerOptions = {}) {}

  async run(input: InferenceInput): Promise<InferenceOutput> {
    const role = investigatorRole(input);
    await new Promise<void>((resolve) =>
      setTimeout(resolve, this.options.delaysMs?.[role] ?? 15),
    );

    let output: AgentOutput;
    if (this.options.failRole === role) {
      output = { status: "error", code: `${role.toUpperCase()}_DETERMINISTIC_FAILURE` };
    } else {
      const packet = packetFromAgentMessage(evidenceMessage(input));
      const findings: Finding[] =
        role === "agreement" ? extractAgreements(packet) : extractPayments(packet);
      if (this.options.corruptCitationRole === role && findings[0]?.citations[0]) {
        findings[0].citations[0].sourceId = "invented-source.txt";
      }
      if (this.options.duplicateFindingsRole === role && findings[0]) {
        findings.push(structuredClone(findings[0]));
      }
      output = { status: "ok", findings };
    }

    return {
      items: [ModelMessageItem.rehydrate({ text: JSON.stringify(output) })],
      tokenUsage: undefined,
      rowResponse: { provider: "deterministic-t001-runner", role },
    };
  }

  async *stream(input: InferenceInput): AsyncGenerator<SemanticEvent> {
    const output = await this.run(input);
    yield SemanticEvent.create("inference.output", "deterministic-t001-runner", output);
  }
}
