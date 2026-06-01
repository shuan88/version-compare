import * as vscode from "vscode";
import type {
  ContentCompareMethod,
  DisambiguationStrategy,
  DisplayMode,
  ExtPolicy,
  ManualMatch,
  MatchScope,
  AiHttpMethod,
  VersionCompareConfig,
} from "./types";
import { DEFAULT_EXCLUDE_GLOBS, DEFAULT_VERSION_PATTERNS } from "./defaults";
import type { ImportedRegexConfig } from "./regexConfig";

export { DEFAULT_EXCLUDE_GLOBS, DEFAULT_VERSION_PATTERNS } from "./defaults";

export interface PresetIgnoreRule {
  id: string;
  settingKey: string;
  label: string;
  description: string;
  pattern: string;
}

export const PRESET_IGNORE_RULES: PresetIgnoreRule[] = [
  {
    id: "ignoreParentheses",
    settingKey: "matching.preset.ignoreParentheses",
    label: "Ignore parentheses characters",
    description: "Removes ( and ) from filename matching.",
    pattern: "[()]",
  },
  {
    id: "ignoreParenthesizedText",
    settingKey: "matching.preset.ignoreParenthesizedText",
    label: "Ignore parenthesized text",
    description: "Removes text such as (old) or (reviewed).",
    pattern: "\\([^)]*\\)",
  },
  {
    id: "ignoreSquareBrackets",
    settingKey: "matching.preset.ignoreSquareBrackets",
    label: "Ignore square bracket characters",
    description: "Removes [ and ] from filename matching.",
    pattern: "[\\[\\]]",
  },
  {
    id: "ignoreBracketedText",
    settingKey: "matching.preset.ignoreBracketedText",
    label: "Ignore bracketed text",
    description: "Removes text such as [old] or [reviewed].",
    pattern: "\\[[^\\]]*\\]",
  },
  {
    id: "ignoreHashMarks",
    settingKey: "matching.preset.ignoreHashMarks",
    label: "Ignore hash marks",
    description: "Removes # and full-width ＃.",
    pattern: "[#＃]",
  },
  {
    id: "ignoreCopyMarkers",
    settingKey: "matching.preset.ignoreCopyMarkers",
    label: "Ignore copy markers",
    description: "Removes copy, 副本, 複本, and 拷貝.",
    pattern: "(?:copy|副本|複本|拷貝)",
  },
  {
    id: "ignoreCommonNoiseWords",
    settingKey: "matching.preset.ignoreCommonNoiseWords",
    label: "Ignore common noise words",
    description: "Removes draft, final, old, new, 最新版, 新版, and 舊版. Use carefully.",
    pattern: "(?:draft|final|old|new|最新版|新版|舊版)",
  },
];

export function loadConfig(context?: vscode.ExtensionContext): VersionCompareConfig {
  const config = vscode.workspace.getConfiguration("versionCompare");
  const configuredManualMatches = config.get<Record<string, ManualMatch>>("manualMatches", {});
  const workspaceManualMatches = context?.workspaceState.get<Record<string, ManualMatch>>("manualMatches", {}) ?? {};
  const importedRegexConfig = context?.workspaceState.get<ImportedRegexConfig>("importedRegexConfig");
  const importedRegexConfigSource = context?.workspaceState.get<string>("importedRegexConfigSource");
  const presetIgnorePatterns = PRESET_IGNORE_RULES
    .filter((rule) => config.get<boolean>(rule.settingKey, false))
    .map((rule) => rule.pattern);
  const customIgnorePatterns = config.get<string[]>("matching.ignoreNamePatterns", []);
  const settingsMatching = {
    scope: config.get<MatchScope>("matching.scope", "sameFolder"),
    includeTypePrefix: config.get<boolean>("matching.includeTypePrefix", true),
    extPolicy: config.get<ExtPolicy>("matching.extPolicy", "sameExtOnly"),
    versionPatterns: config.get<string[]>("matching.versionPatterns", DEFAULT_VERSION_PATTERNS),
    datePattern: config.get<string>("matching.datePattern", "^\\d{8}$"),
    ignoreNamePatterns: [...presetIgnorePatterns, ...customIgnorePatterns],
  };

  return {
    excludeGlobs: config.get<string[]>("excludeGlobs", DEFAULT_EXCLUDE_GLOBS),
    maxFiles: config.get<number>("maxFiles", 50000),
    matching: {
      ...settingsMatching,
      ...importedRegexConfig,
      extPolicy: settingsMatching.extPolicy,
      ignoreNamePatterns: [
        ...settingsMatching.ignoreNamePatterns,
        ...(importedRegexConfig?.ignoreNamePatterns ?? []),
      ],
    },
    disambiguation: {
      strategy: config.get<DisambiguationStrategy>("disambiguation.strategy", "minDistanceGreedy"),
      ambiguityDeltaThreshold: config.get<number>("disambiguation.ambiguityDeltaThreshold", 1),
      versionMajorMismatchAsAmbiguous: config.get<boolean>(
        "disambiguation.versionMajorMismatchAsAmbiguous",
        false,
      ),
    },
    contentCompare: config.get<ContentCompareMethod>("contentCompare", "size+hash"),
    manualMatches: {
      ...configuredManualMatches,
      ...workspaceManualMatches,
    },
    ignoreKeys: config.get<string[]>("ignoreKeys", []),
    displayMode: config.get<DisplayMode>("displayMode", "coreKey"),
    importedRegexConfigSource,
    ai: {
      endpoint: config.get<string>("ai.endpoint", "https://api.openai.com/v1/responses"),
      method: config.get<AiHttpMethod>("ai.method", "POST"),
      model: config.get<string>("ai.model", "gpt-4.1"),
      apiKeyEnv: config.get<string>("ai.apiKeyEnv", "OPENAI_API_KEY"),
      apiKey: config.get<string>("ai.apiKey", ""),
      headersJson: config.get<string>(
        "ai.headersJson",
        "{\"Authorization\":\"Bearer {{apiKey}}\",\"Content-Type\":\"application/json\"}",
      ),
      bodyTemplateJson: config.get<string>(
        "ai.bodyTemplateJson",
        "{\"model\":\"{{model}}\",\"input\":\"{{prompt}}\"}",
      ),
      responseTextPath: config.get<string>("ai.responseTextPath", "output_text"),
      timeoutMs: config.get<number>("ai.timeoutMs", 60000),
    },
  };
}

export async function updateWorkspaceSetting<T>(key: string, value: T): Promise<void> {
  await vscode.workspace
    .getConfiguration("versionCompare")
    .update(key, value, vscode.ConfigurationTarget.Workspace);
}
