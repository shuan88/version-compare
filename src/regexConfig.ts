import type { MatchScope } from "./types";

export interface ImportedRegexConfig {
  versionPatterns?: string[];
  datePattern?: string;
  ignoreNamePatterns?: string[];
  includeTypePrefix?: boolean;
  scope?: MatchScope;
}

export interface ImportedRegexConfigEnvelope {
  matching?: ImportedRegexConfig;
  versionPatterns?: string[];
  datePattern?: string;
  ignoreNamePatterns?: string[];
  includeTypePrefix?: boolean;
  scope?: MatchScope;
}

export function parseImportedRegexConfig(raw: string): ImportedRegexConfig {
  const parsed = JSON.parse(raw) as ImportedRegexConfigEnvelope;
  const source = parsed.matching ?? parsed;
  const config: ImportedRegexConfig = {};

  if (source.versionPatterns !== undefined) {
    assertStringArray("versionPatterns", source.versionPatterns);
    config.versionPatterns = source.versionPatterns;
  }
  if (source.datePattern !== undefined) {
    assertString("datePattern", source.datePattern);
    config.datePattern = source.datePattern;
  }
  if (source.ignoreNamePatterns !== undefined) {
    assertStringArray("ignoreNamePatterns", source.ignoreNamePatterns);
    config.ignoreNamePatterns = source.ignoreNamePatterns;
  }
  if (source.includeTypePrefix !== undefined) {
    assertBoolean("includeTypePrefix", source.includeTypePrefix);
    config.includeTypePrefix = source.includeTypePrefix;
  }
  if (source.scope !== undefined) {
    if (source.scope !== "sameFolder" && source.scope !== "anywhere") {
      throw new Error("scope must be sameFolder or anywhere.");
    }
    config.scope = source.scope;
  }

  if (Object.keys(config).length === 0) {
    throw new Error("Regex config does not contain any supported fields.");
  }

  return config;
}

export function importedRegexConfigToSettingsJson(config: ImportedRegexConfig): string {
  return JSON.stringify({ matching: config }, null, 2);
}

function assertString(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }
}

function assertStringArray(name: string, value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }
}

function assertBoolean(name: string, value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }
}
