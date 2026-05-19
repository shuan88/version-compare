export const DEFAULT_EXCLUDE_GLOBS = [
  ".git/**",
  "**/.git/**",
  "node_modules/**",
  "**/node_modules/**",
  ".vscode/**",
  "**/.vscode/**",
  "**/*.tmp",
];

export const DEFAULT_VERSION_PATTERNS = [
  "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$",
  "^\\d+(?:\\.\\d+)*(?:[a-z]+\\d*)?$",
];
