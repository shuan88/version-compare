export interface ParsedVersion {
  raw: string;
  normalized: string;
  numbers: number[];
}

export interface ParsedName {
  originalBaseName: string;
  typePrefix?: string;
  typePrefixNormalized?: string;
  coreTokens: string[];
  coreKey: string;
  versionRaw?: string;
  versionParsed?: ParsedVersion;
  dateRaw?: string;
  dateParsed?: number;
}

export interface ParserSettings {
  versionPatterns: string[];
  datePattern: string;
  ignoreNamePatterns?: string[];
}

const TOKEN_SPLIT_REGEX = /[_\-\s]+/;
const TYPE_PREFIX_REGEX = /^([A-Za-z0-9]+-[A-Za-z0-9]+)(?=_|\s)/;

export function parseFileName(fileName: string, settings: ParserSettings): ParsedName {
  const originalBaseName = stripExtension(fileName);
  const typePrefixMatch = originalBaseName.match(TYPE_PREFIX_REGEX);
  const typePrefix = typePrefixMatch?.[1];
  const typePrefixNormalized = typePrefix ? normalizeToken(typePrefix) : undefined;
  const body = typePrefix
    ? originalBaseName.slice(typePrefix.length).replace(/^[_\-\s]+/, "")
    : originalBaseName;
  const normalizedBody = applyIgnoreNamePatterns(body, settings.ignoreNamePatterns ?? []);

  const originalTokens = normalizedBody.split(TOKEN_SPLIT_REGEX).filter(Boolean);
  const coreTokens = originalTokens.map(normalizeToken).filter(Boolean);
  const dateRegex = compileFullMatchRegex(settings.datePattern);
  const versionRegexes = settings.versionPatterns.map(compileFullMatchRegex);

  let dateRaw: string | undefined;
  let dateParsed: number | undefined;
  if (coreTokens.length > 0) {
    const lastOriginal = originalTokens[originalTokens.length - 1];
    const lastNormalized = coreTokens[coreTokens.length - 1];
    if (dateRegex.test(lastNormalized)) {
      dateRaw = lastOriginal;
      dateParsed = parseDateToken(lastNormalized);
      originalTokens.pop();
      coreTokens.pop();
    }
  }

  let versionRaw: string | undefined;
  let versionParsed: ParsedVersion | undefined;
  const firstVersionCandidate = Math.max(0, coreTokens.length - 3);
  for (let index = coreTokens.length - 1; index >= firstVersionCandidate; index -= 1) {
    const candidate = coreTokens[index];
    if (dateRegex.test(candidate)) {
      continue;
    }
    if (versionRegexes.some((regex) => regex.test(candidate))) {
      versionRaw = originalTokens[index];
      versionParsed = parseVersionToken(candidate);
      originalTokens.splice(index, 1);
      coreTokens.splice(index, 1);
      break;
    }
  }

  const fallbackCoreTokens = coreTokens.length > 0 ? coreTokens : [normalizeToken(normalizedBody || body || originalBaseName)];
  const coreKey = fallbackCoreTokens.join("_");

  return {
    originalBaseName,
    typePrefix,
    typePrefixNormalized,
    coreTokens: fallbackCoreTokens,
    coreKey,
    versionRaw,
    versionParsed,
    dateRaw,
    dateParsed,
  };
}

export function normalizeToken(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function compareParsedVersions(a: ParsedVersion | undefined, b: ParsedVersion | undefined): number {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }

  const maxLength = Math.max(a.numbers.length, b.numbers.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = a.numbers[index] ?? 0;
    const right = b.numbers[index] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
}

export function versionDistance(a: ParsedVersion | undefined, b: ParsedVersion | undefined): number {
  if (!a && !b) {
    return 0;
  }
  if (!a || !b) {
    return 1000;
  }

  const maxLength = Math.max(a.numbers.length, b.numbers.length, 1);
  let distance = 0;
  for (let index = 0; index < maxLength; index += 1) {
    const left = a.numbers[index] ?? 0;
    const right = b.numbers[index] ?? 0;
    const weight = Math.pow(10, Math.max(0, maxLength - index - 1));
    distance += Math.abs(left - right) * weight;
  }
  return distance;
}

function parseVersionToken(token: string): ParsedVersion {
  const normalized = normalizeToken(token);
  const numbers = [...normalized.matchAll(/\d+/g)].map((match) => Number.parseInt(match[0], 10));
  return {
    raw: token,
    normalized,
    numbers,
  };
}

function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return fileName;
  }
  return fileName.slice(0, lastDot);
}

function parseDateToken(token: string): number | undefined {
  if (!/^\d{8}$/.test(token)) {
    return undefined;
  }

  const year = Number.parseInt(token.slice(0, 4), 10);
  const month = Number.parseInt(token.slice(4, 6), 10);
  const day = Number.parseInt(token.slice(6, 8), 10);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return Math.floor(timestamp / 86_400_000);
}

function compileFullMatchRegex(pattern: string): RegExp {
  try {
    const source = pattern.startsWith("^") && pattern.endsWith("$") ? pattern : `^(?:${pattern})$`;
    return new RegExp(source, "i");
  } catch {
    return /a^/;
  }
}

function applyIgnoreNamePatterns(value: string, patterns: string[]): string {
  return patterns.reduce((current, pattern) => {
    try {
      return current.replace(new RegExp(pattern, "gi"), "");
    } catch {
      return current;
    }
  }, value);
}
