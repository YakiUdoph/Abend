import {
  ModelMessageItem,
  SemanticEvent,
  supportedModels,
  type InferenceInput,
  type InferenceOutput,
  type InferenceRunner,
} from "@mozaik-ai/core";

export type ProviderErrorCategory =
  | "AUTHENTICATION"
  | "BAD_REQUEST"
  | "MODEL_NOT_FOUND"
  | "PROVIDER_SERVER"
  | "RATE_LIMIT"
  | "SCHEMA_REJECTED"
  | "TRANSPORT"
  | "UNKNOWN";

export type SafeProviderDiagnostic = {
  category: ProviderErrorCategory;
  model: string;
  retryable: boolean;
  rateLimited: boolean;
  httpStatus?: number;
  providerCode?: string;
};

function errorRecord(error: unknown): Record<string, unknown> {
  return error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
}

function safeCodeFromMessage(message: string): string | undefined {
  try {
    const parsed = errorRecord(JSON.parse(message));
    const nested = errorRecord(parsed.error);
    const status = nested.status;
    return typeof status === "string" && /^[A-Z][A-Z0-9_\-]{1,63}$/.test(status) ? status : undefined;
  } catch {
    return undefined;
  }
}

export function classifyProviderError(error: unknown, model: string): SafeProviderDiagnostic {
  const candidate = errorRecord(error);
  const response = errorRecord(candidate.response);
  const statusCandidate = candidate.status ?? candidate.statusCode ?? response.status;
  const httpStatus = typeof statusCandidate === "number" && Number.isInteger(statusCandidate)
    ? statusCandidate
    : undefined;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const rawCode = typeof candidate.code === "string" ? candidate.code : safeCodeFromMessage(message);
  const providerCode = rawCode && /^[A-Z0-9_\-]+$/i.test(rawCode) ? rawCode.slice(0, 64) : undefined;
  const searchable = `${providerCode ?? ""} ${message}`.toUpperCase();

  let category: ProviderErrorCategory = "UNKNOWN";
  if (httpStatus === 429 || searchable.includes("RESOURCE_EXHAUSTED") || searchable.includes("RATE LIMIT")) category = "RATE_LIMIT";
  else if (httpStatus === 401 || httpStatus === 403 || /UNAUTHENTICATED|PERMISSION_DENIED|API KEY/.test(searchable)) category = "AUTHENTICATION";
  else if (httpStatus === 404 || /MODEL[^\n]{0,40}(NOT FOUND|UNAVAILABLE)|NOT_FOUND/.test(searchable)) category = "MODEL_NOT_FOUND";
  else if (httpStatus === 400 && /SCHEMA|RESPONSE_SCHEMA|RESPONSESCHEMA|JSON SCHEMA/.test(searchable)) category = "SCHEMA_REJECTED";
  else if (httpStatus === 400) category = "BAD_REQUEST";
  else if (httpStatus !== undefined && httpStatus >= 500) category = "PROVIDER_SERVER";
  else if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|FETCH FAILED|NETWORK/.test(searchable)) category = "TRANSPORT";

  const retryable = category === "RATE_LIMIT" || category === "TRANSPORT" || category === "PROVIDER_SERVER";
  return {
    category,
    model,
    retryable,
    rateLimited: category === "RATE_LIMIT",
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(providerCode ? { providerCode } : {}),
  };
}

export class BundledProviderInferenceRunner implements InferenceRunner {
  async run(input: InferenceInput): Promise<InferenceOutput> {
    const model = supportedModels.find(({ specification }) => specification.name === input.model);
    if (!model) throw new Error(`Unsupported bundled model: ${input.model}`);
    if (input.structuredOutput && !model.specification.supportsStructuredOutput) {
      throw new Error(`Model does not support structured output: ${input.model}`);
    }
    return model.endpoint.infer(input);
  }

  async *stream(input: InferenceInput): AsyncGenerator<SemanticEvent> {
    const model = supportedModels.find(({ specification }) => specification.name === input.model);
    if (!model) throw new Error(`Unsupported bundled model: ${input.model}`);
    yield* model.endpoint.stream(input);
  }
}

export class SafeInferenceRunner implements InferenceRunner {
  constructor(private readonly inner: InferenceRunner) {}

  private failure(input: InferenceInput, error: unknown): InferenceOutput {
    const diagnostic = classifyProviderError(error, input.model);
    return {
      items: [ModelMessageItem.rehydrate({ text: JSON.stringify({ status: "error", code: "PROVIDER_REQUEST_FAILED", diagnostic }) })],
      tokenUsage: undefined,
      rowResponse: { providerFailure: true, diagnostic },
    };
  }

  async run(input: InferenceInput): Promise<InferenceOutput> {
    try {
      return await this.inner.run(input);
    } catch (error) {
      return this.failure(input, error);
    }
  }

  async *stream(input: InferenceInput): AsyncGenerator<SemanticEvent> {
    try {
      yield* this.inner.stream(input);
    } catch (error) {
      yield SemanticEvent.create("inference.output", "provider-boundary", this.failure(input, error));
    }
  }
}
