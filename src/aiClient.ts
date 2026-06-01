import type { AiConfig } from "./types";

export interface AiCallResult {
  text: string;
  rawText: string;
  status: number;
}

export class AiApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly rawBody: string,
  ) {
    super(`AI API request failed: ${status} ${statusText}`);
  }
}

export async function callAiForRegex(prompt: string, config: AiConfig): Promise<AiCallResult> {
  const apiKey = config.apiKey || process.env[config.apiKeyEnv] || "";
  const headersTemplate = parseJsonObject(config.headersJson, "versionCompare.ai.headersJson");
  const bodyTemplate = parseJsonObject(config.bodyTemplateJson, "versionCompare.ai.bodyTemplateJson");
  const variables = {
    apiKey,
    model: config.model,
    prompt,
  };
  const headers = applyTemplate(headersTemplate, variables) as Record<string, string>;
  const body = applyTemplate(bodyTemplate, variables);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: config.method,
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new AiApiError(response.status, response.statusText, rawText);
    }
    return {
      text: extractResponseText(rawText, config.responseTextPath),
      rawText,
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractResponseText(rawText: string, responseTextPath: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return rawText;
  }

  const configured = responseTextPath ? readPath(parsed, responseTextPath) : undefined;
  if (typeof configured === "string") {
    return configured;
  }

  const outputText = readPath(parsed, "output_text");
  if (typeof outputText === "string") {
    return outputText;
  }

  const chatContent = readPath(parsed, "choices.0.message.content");
  if (typeof chatContent === "string") {
    return chatContent;
  }

  const completionText = readPath(parsed, "choices.0.text");
  if (typeof completionText === "string") {
    return completionText;
  }

  const responsesText = collectResponsesOutputText(parsed);
  return responsesText || rawText;
}

function collectResponsesOutputText(value: unknown): string {
  const output = readPath(value, "output");
  if (!Array.isArray(output)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const contentItem of content) {
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") {
        parts.push(text);
      }
    }
  }
  return parts.join("\n");
}

function parseJsonObject(raw: string, settingName: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${settingName} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function applyTemplate(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === "string") {
    if (value === "{{prompt}}") {
      return variables.prompt;
    }
    if (value === "{{model}}") {
      return variables.model;
    }
    if (value === "{{apiKey}}") {
      return variables.apiKey;
    }
    return value.replace(/\{\{(apiKey|model|prompt)\}\}/g, (_match, key: string) => variables[key] ?? "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyTemplate(item, variables));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, applyTemplate(item, variables)]),
    );
  }
  return value;
}

function readPath(value: unknown, path: string): unknown {
  if (!path) {
    return undefined;
  }
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      return Number.isNaN(index) ? undefined : current[index];
    }
    if (typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}
