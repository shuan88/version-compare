import * as vscode from "vscode";
import type {
  ContentCompareMethod,
  DisambiguationStrategy,
  DisplayMode,
  ExtPolicy,
  ManualMatch,
  MatchScope,
  VersionCompareConfig,
} from "./types";
import { DEFAULT_EXCLUDE_GLOBS, DEFAULT_VERSION_PATTERNS } from "./defaults";

export { DEFAULT_EXCLUDE_GLOBS, DEFAULT_VERSION_PATTERNS } from "./defaults";

export function loadConfig(context?: vscode.ExtensionContext): VersionCompareConfig {
  const config = vscode.workspace.getConfiguration("versionCompare");
  const configuredManualMatches = config.get<Record<string, ManualMatch>>("manualMatches", {});
  const workspaceManualMatches = context?.workspaceState.get<Record<string, ManualMatch>>("manualMatches", {}) ?? {};

  return {
    excludeGlobs: config.get<string[]>("excludeGlobs", DEFAULT_EXCLUDE_GLOBS),
    maxFiles: config.get<number>("maxFiles", 50000),
    matching: {
      scope: config.get<MatchScope>("matching.scope", "sameFolder"),
      includeTypePrefix: config.get<boolean>("matching.includeTypePrefix", true),
      extPolicy: config.get<ExtPolicy>("matching.extPolicy", "sameExtOnly"),
      versionPatterns: config.get<string[]>("matching.versionPatterns", DEFAULT_VERSION_PATTERNS),
      datePattern: config.get<string>("matching.datePattern", "^\\d{8}$"),
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
  };
}

export async function updateWorkspaceSetting<T>(key: string, value: T): Promise<void> {
  await vscode.workspace
    .getConfiguration("versionCompare")
    .update(key, value, vscode.ConfigurationTarget.Workspace);
}
