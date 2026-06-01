# Version Compare

Version Compare is a VS Code extension for comparing two local folders with filename matching that understands version/date suffixes, type prefixes, subfolders, and configurable ignored filename characters.

## 中文使用說明

### 主要功能

- 在 VS Code 內選擇 Left / Right 兩個資料夾後進行比較。
- 遞迴掃描所有子資料夾，只比較檔案，不比較空資料夾。
- 預設只在相同相對子資料夾中配對檔案，例如 `A/report.xlsx` 只會配 `A/report.xlsx`，不會配 `B/report.xlsx`。
- 可設定成跨資料夾全域配對。
- 檔名可忽略尾端版本號，例如 `Report_1.0P2.xlsx` 與 `Report_1.0P3.xlsx` 可配對。
- 檔名可忽略尾端日期，例如 `Report_20250621.xlsx` 與 `Report_20250622.xlsx` 可配對。
- 可用 regex 忽略指定字元或文字，例如括號、`#`、`copy`、`副本`。
- 副檔名必須相同才會配對。
- 預設保留 type prefix，例如 `G-RPT_` 不會配 `G-DF_`。

### 使用方式

1. 執行 `Version Compare: Open Compare View` 開啟分頁 UI。
2. 在分頁中選擇 Left folder 與 Right folder。
3. 按 `Compare`。
4. 在結果表格查看 Left / Status / Right。
5. 對 `Modified` 或 `Identical` row 按 `Diff`，會開啟 VS Code 內建 diff。
6. 對 `Ambiguous` row 按 `Pick` 可手動指定配對。
7. 對 `LeftOnly` 或 `RightOnly` row 按 `Force` 可強制指定另一側檔案配對。

也可以使用命令：

- `Version Compare: Select Left Folder`
- `Version Compare: Select Right Folder`
- `Version Compare: Compare`
- `Version Compare: Refresh`
- `Version Compare: Change Settings and Re-compare`
- `Version Compare: Export GPT Debug Package...`
- `Version Compare: Ask GPT for Regex Suggestions`
- `Version Compare: Import Regex Config...`
- `Force Match...`，在 `LeftOnly` / `RightOnly` 項目的 context menu 中使用

左側 Explorer 也會顯示 `Version Compare` TreeView。

### 子資料夾配對規則

預設設定：

```json
{
  "versionCompare.matching.scope": "sameFolder"
}
```

代表只會在相同相對資料夾內配對：

| Left | Right | 結果 |
| --- | --- | --- |
| `Dept/A/G-RPT_Sales_1.0.xlsx` | `Dept/A/G-RPT_Sales_1.1.xlsx` | 會配對 |
| `Dept/A/G-RPT_Sales_1.0.xlsx` | `Dept/B/G-RPT_Sales_1.0.xlsx` | 不會配對 |

如果要跨子資料夾全域配對：

```json
{
  "versionCompare.matching.scope": "anywhere"
}
```

注意：`anywhere` 容錯較高，但也比較容易誤配。

### 忽略特定字元或文字

如果不想自己寫 regex，可以先用內建 preset。這些 preset 在 VS Code Settings UI 會以 checkbox 顯示，也可以從 `Version Compare: Change Settings and Re-compare` 裡選 `Toggle preset ignore rules`。

| Checkbox setting | 作用 | 實際 regex |
| --- | --- | --- |
| `versionCompare.matching.preset.ignoreParentheses` | 忽略 `(` 和 `)` 字元 | `[()]` |
| `versionCompare.matching.preset.ignoreParenthesizedText` | 忽略整段括號內容，例如 `(old)` | `\\([^)]*\\)` |
| `versionCompare.matching.preset.ignoreSquareBrackets` | 忽略 `[` 和 `]` 字元 | `[\\[\\]]` |
| `versionCompare.matching.preset.ignoreBracketedText` | 忽略整段中括號內容，例如 `[old]` | `\\[[^\\]]*\\]` |
| `versionCompare.matching.preset.ignoreHashMarks` | 忽略 `#` 和 `＃` | `[#＃]` |
| `versionCompare.matching.preset.ignoreCopyMarkers` | 忽略 `copy`、`副本`、`複本`、`拷貝` | `(?:copy\|副本\|複本\|拷貝)` |
| `versionCompare.matching.preset.ignoreCommonNoiseWords` | 忽略 `draft`、`final`、`old`、`new`、`最新版` 等字 | `(?:draft\|final\|old\|new\|最新版\|新版\|舊版)` |

Preset 會和自訂 `ignoreNamePatterns` 合併使用。若檔名中的 `draft`、`final` 對你有實際意義，不建議開啟 `ignoreCommonNoiseWords`。

使用：

```json
{
  "versionCompare.matching.ignoreNamePatterns": []
}
```

這是一組 JavaScript regex 字串。每個 pattern 會從「不含副檔名、且已先抽出 type prefix 後的檔名主體」移除，再產生 match key。

範例：忽略括號與 `#`

```json
{
  "versionCompare.matching.ignoreNamePatterns": ["[()#]"]
}
```

可讓以下檔案配對：

| Left | Right |
| --- | --- |
| `G-RPT_Sales(Reviewed)#_1.0.xlsx` | `G-RPT_SalesReviewed_1.0.xlsx` |

範例：忽略中括號內的任何內容

```json
{
  "versionCompare.matching.ignoreNamePatterns": ["\\[[^\\]]*\\]"]
}
```

可讓以下檔案配對：

| Left | Right |
| --- | --- |
| `G-RPT_Sales[old]_1.0.xlsx` | `G-RPT_Sales_1.0.xlsx` |

範例：忽略 `copy` 或 `副本`

```json
{
  "versionCompare.matching.ignoreNamePatterns": ["(?:copy|副本)"]
}
```

可讓以下檔案配對：

| Left | Right |
| --- | --- |
| `G-RPT_Sales_COPY_1.0.xlsx` | `G-RPT_Sales_1.0.xlsx` |
| `G-RPT_Sales_副本_1.0.xlsx` | `G-RPT_Sales_1.0.xlsx` |

注意：在 VS Code `settings.json` 裡，regex 的 `\` 要寫成 `\\`。例如 regex `\d{8}` 要寫成 `"\\d{8}"`。

### 強制配對 Force Match

如果兩個檔案名字差太多，套用 preset / regex 後仍分成 `LeftOnly` 和 `RightOnly`，可以用 Force Match。

操作方式：

1. 先執行 Compare。
2. 在分頁 UI 找到 `LeftOnly` 或 `RightOnly` row。
3. 按 `Force`。
4. 從另一側候選清單選擇要配對的檔案。
5. Extension 會寫入 `versionCompare.manualMatches`，並自動重新 Compare。

Force Match 可以跨 matchKey、跨 type、甚至跨副檔名。這是使用者明確指定的 override，因此優先於自動配對規則。

設定儲存範例：

```json
{
  "versionCompare.manualMatches": {
    "manual::Dept/A/G-RPT_Sales_Main_1.0.xlsx::Dept/A/G-RPT_Revenue_Main_9.9.xlsx": {
      "leftRelPath": "Dept/A/G-RPT_Sales_Main_1.0.xlsx",
      "rightRelPath": "Dept/A/G-RPT_Revenue_Main_9.9.xlsx"
    }
  }
}
```

### Debug 模式：匯出給 GPT 網頁版使用

如果目前規則無法成功配對，可以先執行 Compare，再執行：

```text
Version Compare: Export GPT Debug Package...
```

這會輸出一個 Markdown 檔，內容包含：

- 適合貼到 GPT 網頁版的 prompt。
- Left / Right 的完整檔名清單。
- 相對路徑、子資料夾、檔名、副檔名。
- 目前 parser 解析出的 `typePrefix`、`coreKey`、`versionRaw`、`dateRaw`。
- 目前 compare 結果與 ambiguous / left-only / right-only 狀態。
- 要求 GPT 回傳可匯入的 JSON regex config。

建議把整個 Markdown 檔內容貼到 GPT，請它回傳 JSON，不要回傳 markdown。回傳格式範例：

```json
{
  "matching": {
    "scope": "sameFolder",
    "includeTypePrefix": true,
    "ignoreNamePatterns": [
      "\\([^)]*\\)",
      "(?:copy|副本)"
    ],
    "versionPatterns": [
      "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$",
      "^rev\\d+$"
    ],
    "datePattern": "^\\d{8}$"
  },
  "notes": [
    "Ignore parenthesized labels and copy markers.",
    "Treat revNN as a version token."
  ]
}
```

### 在 VS Code 內呼叫 GPT API

也可以直接執行：

```text
Version Compare: Ask GPT for Regex Suggestions
```

Extension 會用同一份 debug prompt 呼叫 API，並把模型回覆開成一個新文件。若 API 回錯，`Version Compare` OutputChannel 會顯示：

- HTTP status。
- raw response body。
- JSON template parse error。
- timeout 或 network error。

設定項目：

```json
{
  "versionCompare.ai.endpoint": "https://api.openai.com/v1/responses",
  "versionCompare.ai.method": "POST",
  "versionCompare.ai.model": "gpt-4.1",
  "versionCompare.ai.apiKeyEnv": "OPENAI_API_KEY",
  "versionCompare.ai.apiKey": "",
  "versionCompare.ai.headersJson": "{\"Authorization\":\"Bearer {{apiKey}}\",\"Content-Type\":\"application/json\"}",
  "versionCompare.ai.bodyTemplateJson": "{\"model\":\"{{model}}\",\"input\":\"{{prompt}}\"}",
  "versionCompare.ai.responseTextPath": "output_text",
  "versionCompare.ai.timeoutMs": 60000
}
```

如果公司 API 包了多層，可以改 endpoint、headers、body template。例如公司 wrapper 需要 `deployment` 和 `apiVersion`：

```json
{
  "versionCompare.ai.endpoint": "https://company.example.com/ai/generate",
  "versionCompare.ai.model": "company-gpt-regex",
  "versionCompare.ai.headersJson": "{\"x-api-key\":\"{{apiKey}}\",\"Content-Type\":\"application/json\"}",
  "versionCompare.ai.bodyTemplateJson": "{\"deployment\":\"{{model}}\",\"apiVersion\":\"2026-01-01\",\"messages\":[{\"role\":\"user\",\"content\":\"{{prompt}}\"}]}",
  "versionCompare.ai.responseTextPath": "data.answer"
}
```

`{{apiKey}}`、`{{model}}`、`{{prompt}}` 會自動替換。建議把 key 放在環境變數，不要寫進 settings：

```sh
export OPENAI_API_KEY="your-key"
```

Node.js 版本的等效呼叫範例：

```js
const endpoint = process.env.VERSION_COMPARE_AI_ENDPOINT || "https://api.openai.com/v1/responses";
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.VERSION_COMPARE_AI_MODEL || "gpt-4.1";
const prompt = "Paste the Version Compare GPT Debug Package prompt here.";

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    input: prompt
  })
});

const raw = await response.text();
if (!response.ok) {
  console.error("HTTP", response.status, response.statusText);
  console.error(raw);
  process.exit(1);
}

const json = JSON.parse(raw);
console.log(json.output_text ?? raw);
```

### 匯入每次 compare 使用的 regex config

如果 GPT 回傳了 JSON config，可以執行：

```text
Version Compare: Import Regex Config...
```

支援三種方式：

- 貼上 JSON 檔案路徑。
- 用檔案選擇器選 JSON。
- 直接貼上 JSON 內容。

匯入後會存在 workspace state，並立即重新 Compare。匯入設定會和 VS Code settings / preset 合併，其中匯入的 `versionPatterns`、`datePattern`、`scope`、`includeTypePrefix` 會覆蓋一般設定，`ignoreNamePatterns` 則會附加到既有 preset / custom ignore 規則。

最小可匯入檔案：

```json
{
  "matching": {
    "ignoreNamePatterns": ["\\([^)]*\\)"]
  }
}
```

完整可匯入檔案：

```json
{
  "matching": {
    "scope": "sameFolder",
    "includeTypePrefix": true,
    "ignoreNamePatterns": ["\\([^)]*\\)", "(?:copy|副本)"],
    "versionPatterns": ["^rev\\d+$", "^(?:v)?\\d+(?:\\.\\d+)*$"],
    "datePattern": "^\\d{8}$"
  }
}
```

### 版本號 regex

設定：

```json
{
  "versionCompare.matching.versionPatterns": [
    "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$",
    "^\\d+(?:\\.\\d+)*(?:[a-z]+\\d*)?$"
  ]
}
```

規則：

- 依序嘗試每個 regex。
- 預設只檢查檔名尾端或接近尾端的 token。
- 成功解析的版本 token 會從 `coreKey` 移除。
- 版本距離會用於多候選配對。

常見範例：

| 要支援的版本格式 | regex 寫法 |
| --- | --- |
| `V1`, `V1.2`, `v2.0` | `"^v\\d+(?:\\.\\d+)*$"` |
| `1.0P2`, `2.3p10` | `"^\\d+(?:\\.\\d+)*p\\d+$"` |
| `REV01`, `rev12` | `"^rev\\d+$"` |
| `R1`, `R12` | `"^r\\d+$"` |
| `1_2_3` 不建議 | 版本 token 會被 `_` 切開，建議改用 `1.2.3` |

如果你的版本格式是 `Report_A01.xlsx`，可以加入：

```json
{
  "versionCompare.matching.versionPatterns": [
    "^a\\d+$",
    "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$"
  ]
}
```

### 日期 regex

設定：

```json
{
  "versionCompare.matching.datePattern": "^\\d{8}$"
}
```

預設只把尾端 token 且符合 `YYYYMMDD` 的內容視為日期：

| 檔名 | 日期是否被忽略 |
| --- | --- |
| `Report_20250621.xlsx` | 是 |
| `Report_20250621_Draft.xlsx` | 否，因為日期不在尾端 |

### Type prefix

預設：

```json
{
  "versionCompare.matching.includeTypePrefix": true
}
```

代表：

| Left | Right | 結果 |
| --- | --- | --- |
| `G-RPT_Sales_1.0.xlsx` | `G-RPT_Sales_1.1.xlsx` | 會配對 |
| `G-RPT_Sales_1.0.xlsx` | `G-DF_Sales_1.0.xlsx` | 不會配對 |

如果要允許跨 type 配對：

```json
{
  "versionCompare.matching.includeTypePrefix": false
}
```

跨 type 配對會在 UI 中標示 `cross type`。

### 排除掃描檔案

設定：

```json
{
  "versionCompare.excludeGlobs": [
    ".git/**",
    "**/.git/**",
    "node_modules/**",
    "**/node_modules/**",
    ".vscode/**",
    "**/.vscode/**",
    "**/*.tmp"
  ]
}
```

範例：

```json
{
  "versionCompare.excludeGlobs": [
    "**/archive/**",
    "**/*.bak",
    "**/~$*"
  ]
}
```

### 內容比較方式

```json
{
  "versionCompare.contentCompare": "size+hash"
}
```

可用值：

| 值 | 說明 |
| --- | --- |
| `size+hash` | 預設，size 不同直接 Modified，size 相同再 hash |
| `size+mtime` | size 相同再比最後修改時間 |
| `sizeOnly` | 只看 size，最快但最不精準 |

### 多候選解歧義

```json
{
  "versionCompare.disambiguation.strategy": "minDistanceGreedy",
  "versionCompare.disambiguation.ambiguityDeltaThreshold": 1,
  "versionCompare.disambiguation.versionMajorMismatchAsAmbiguous": false
}
```

可用策略：

| 值 | 說明 |
| --- | --- |
| `minDistanceGreedy` | 預設，依版本距離、日期距離、名稱相似度挑最低分 |
| `latestOnEachSide` | 左右各挑最新版或最新日期配成一對 |
| `manualPreferred` | 先套用手動配對，再使用 greedy |

### 完整設定範例

```json
{
  "versionCompare.matching.scope": "sameFolder",
  "versionCompare.matching.includeTypePrefix": true,
  "versionCompare.matching.preset.ignoreParenthesizedText": true,
  "versionCompare.matching.preset.ignoreCopyMarkers": true,
  "versionCompare.matching.ignoreNamePatterns": [
    "[()#]",
    "\\[[^\\]]*\\]",
    "(?:copy|副本)"
  ],
  "versionCompare.matching.versionPatterns": [
    "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$",
    "^rev\\d+$",
    "^r\\d+$"
  ],
  "versionCompare.matching.datePattern": "^\\d{8}$",
  "versionCompare.contentCompare": "size+hash",
  "versionCompare.excludeGlobs": [
    "**/.git/**",
    "**/node_modules/**",
    "**/*.tmp",
    "**/*.bak"
  ]
}
```

## English Guide

### Features

- Compare two local folders inside VS Code.
- Recursively scans subfolders.
- Compares files only.
- Matches files by normalized filename keys.
- Ignores configured trailing version tokens.
- Ignores configured trailing date tokens.
- Supports custom regex patterns for ignored filename characters or marker text.
- Requires identical file extensions.
- Keeps type prefixes such as `G-RPT` and `G-DF` separate by default.

### Basic Usage

1. Run `Version Compare: Open Compare View`.
2. Select the Left folder and Right folder in the editor tab.
3. Click `Compare`.
4. Review the Left / Status / Right table.
5. Click `Diff` on paired rows to open VS Code's built-in diff viewer.
6. Click `Pick` on ambiguous rows to manually choose a match.
7. Click `Force` on `LeftOnly` or `RightOnly` rows to force a pair with a file from the opposite side.

Available commands:

- `Version Compare: Open Compare View`
- `Version Compare: Select Left Folder`
- `Version Compare: Select Right Folder`
- `Version Compare: Compare`
- `Version Compare: Refresh`
- `Version Compare: Change Settings and Re-compare`
- `Version Compare: Export GPT Debug Package...`
- `Version Compare: Ask GPT for Regex Suggestions`
- `Version Compare: Import Regex Config...`
- `Force Match...` from the `LeftOnly` / `RightOnly` context menu

### Subfolder Matching

Default:

```json
{
  "versionCompare.matching.scope": "sameFolder"
}
```

With `sameFolder`, matching is restricted to the same relative folder:

| Left | Right | Result |
| --- | --- | --- |
| `Dept/A/G-RPT_Sales_1.0.xlsx` | `Dept/A/G-RPT_Sales_1.1.xlsx` | Matched |
| `Dept/A/G-RPT_Sales_1.0.xlsx` | `Dept/B/G-RPT_Sales_1.0.xlsx` | Not matched |

To match anywhere across subfolders:

```json
{
  "versionCompare.matching.scope": "anywhere"
}
```

Use `anywhere` carefully because it can create false positives.

### Ignoring Specific Characters Or Text

If you do not want to write regex manually, start with the built-in presets. These appear as checkbox settings in VS Code Settings UI. You can also run `Version Compare: Change Settings and Re-compare` and choose `Toggle preset ignore rules`.

| Checkbox setting | Meaning | Regex |
| --- | --- | --- |
| `versionCompare.matching.preset.ignoreParentheses` | Ignore `(` and `)` | `[()]` |
| `versionCompare.matching.preset.ignoreParenthesizedText` | Ignore full parenthesized text such as `(old)` | `\\([^)]*\\)` |
| `versionCompare.matching.preset.ignoreSquareBrackets` | Ignore `[` and `]` | `[\\[\\]]` |
| `versionCompare.matching.preset.ignoreBracketedText` | Ignore full bracketed text such as `[old]` | `\\[[^\\]]*\\]` |
| `versionCompare.matching.preset.ignoreHashMarks` | Ignore `#` and `＃` | `[#＃]` |
| `versionCompare.matching.preset.ignoreCopyMarkers` | Ignore `copy`, `副本`, `複本`, and `拷貝` | `(?:copy\|副本\|複本\|拷貝)` |
| `versionCompare.matching.preset.ignoreCommonNoiseWords` | Ignore `draft`, `final`, `old`, `new`, `最新版`, etc. | `(?:draft\|final\|old\|new\|最新版\|新版\|舊版)` |

Preset patterns are combined with custom `ignoreNamePatterns`. Use `ignoreCommonNoiseWords` carefully because those words can be meaningful.

Use:

```json
{
  "versionCompare.matching.ignoreNamePatterns": []
}
```

Each entry is a JavaScript regex string. The extension removes these matches from the filename stem after extracting the type prefix and before tokenization.

Ignore parentheses and `#`:

```json
{
  "versionCompare.matching.ignoreNamePatterns": ["[()#]"]
}
```

This matches:

| Left | Right |
| --- | --- |
| `G-RPT_Sales(Reviewed)#_1.0.xlsx` | `G-RPT_SalesReviewed_1.0.xlsx` |

Ignore bracketed text:

```json
{
  "versionCompare.matching.ignoreNamePatterns": ["\\[[^\\]]*\\]"]
}
```

This matches:

| Left | Right |
| --- | --- |
| `G-RPT_Sales[old]_1.0.xlsx` | `G-RPT_Sales_1.0.xlsx` |

Ignore `copy` or `副本`:

```json
{
  "versionCompare.matching.ignoreNamePatterns": ["(?:copy|副本)"]
}
```

In VS Code `settings.json`, escape regex backslashes twice. Regex `\d{8}` must be written as `"\\d{8}"`.

### Force Match

If two files are still split into `LeftOnly` and `RightOnly`, use Force Match.

Steps:

1. Run Compare.
2. Find a `LeftOnly` or `RightOnly` row in the compare tab.
3. Click `Force`.
4. Select a file from the opposite side.
5. The extension writes a `versionCompare.manualMatches` override and re-runs Compare.

Force Match can pair files across different match keys, types, or extensions because it is an explicit user override.

### Debug Mode For ChatGPT Web

If the current rules cannot match your filenames, run Compare first, then run:

```text
Version Compare: Export GPT Debug Package...
```

The exported Markdown file contains:

- A ready-to-paste GPT prompt.
- Full Left / Right filename inventory.
- Relative paths, subfolders, filenames, and extensions.
- Parsed `typePrefix`, `coreKey`, `versionRaw`, and `dateRaw`.
- Current compare statuses, including ambiguous / left-only / right-only rows.
- A JSON output schema for regex settings.

Paste the whole Markdown content into ChatGPT and ask it to return JSON only.

Expected response shape:

```json
{
  "matching": {
    "scope": "sameFolder",
    "includeTypePrefix": true,
    "ignoreNamePatterns": [
      "\\([^)]*\\)",
      "(?:copy|副本)"
    ],
    "versionPatterns": [
      "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$",
      "^rev\\d+$"
    ],
    "datePattern": "^\\d{8}$"
  },
  "notes": [
    "Ignore parenthesized labels and copy markers.",
    "Treat revNN as a version token."
  ]
}
```

### Calling A GPT API From VS Code

Run:

```text
Version Compare: Ask GPT for Regex Suggestions
```

The extension sends the same debug prompt to a configurable API endpoint and opens the model response in a new editor. If the API returns an error, the `Version Compare` OutputChannel shows the raw HTTP status and response body.

Settings:

```json
{
  "versionCompare.ai.endpoint": "https://api.openai.com/v1/responses",
  "versionCompare.ai.method": "POST",
  "versionCompare.ai.model": "gpt-4.1",
  "versionCompare.ai.apiKeyEnv": "OPENAI_API_KEY",
  "versionCompare.ai.apiKey": "",
  "versionCompare.ai.headersJson": "{\"Authorization\":\"Bearer {{apiKey}}\",\"Content-Type\":\"application/json\"}",
  "versionCompare.ai.bodyTemplateJson": "{\"model\":\"{{model}}\",\"input\":\"{{prompt}}\"}",
  "versionCompare.ai.responseTextPath": "output_text",
  "versionCompare.ai.timeoutMs": 60000
}
```

For company wrapper APIs, change the endpoint, headers, body template, and response text path:

```json
{
  "versionCompare.ai.endpoint": "https://company.example.com/ai/generate",
  "versionCompare.ai.model": "company-gpt-regex",
  "versionCompare.ai.headersJson": "{\"x-api-key\":\"{{apiKey}}\",\"Content-Type\":\"application/json\"}",
  "versionCompare.ai.bodyTemplateJson": "{\"deployment\":\"{{model}}\",\"apiVersion\":\"2026-01-01\",\"messages\":[{\"role\":\"user\",\"content\":\"{{prompt}}\"}]}",
  "versionCompare.ai.responseTextPath": "data.answer"
}
```

Supported placeholders:

- `{{apiKey}}`
- `{{model}}`
- `{{prompt}}`

Node.js equivalent using `fetch`:

```js
const endpoint = process.env.VERSION_COMPARE_AI_ENDPOINT || "https://api.openai.com/v1/responses";
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.VERSION_COMPARE_AI_MODEL || "gpt-4.1";
const prompt = "Paste the Version Compare GPT Debug Package prompt here.";

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    input: prompt
  })
});

const raw = await response.text();
if (!response.ok) {
  console.error("HTTP", response.status, response.statusText);
  console.error(raw);
  process.exit(1);
}

const json = JSON.parse(raw);
console.log(json.output_text ?? raw);
```

### Importing Regex Config Per Compare

Run:

```text
Version Compare: Import Regex Config...
```

Import options:

- Paste a JSON file path.
- Choose a JSON file.
- Paste JSON directly.

The imported config is stored in workspace state and Compare runs immediately. Imported `versionPatterns`, `datePattern`, `scope`, and `includeTypePrefix` override normal settings. Imported `ignoreNamePatterns` are appended to preset and custom ignore rules.

Minimal import file:

```json
{
  "matching": {
    "ignoreNamePatterns": ["\\([^)]*\\)"]
  }
}
```

Full import file:

```json
{
  "matching": {
    "scope": "sameFolder",
    "includeTypePrefix": true,
    "ignoreNamePatterns": ["\\([^)]*\\)", "(?:copy|副本)"],
    "versionPatterns": ["^rev\\d+$", "^(?:v)?\\d+(?:\\.\\d+)*$"],
    "datePattern": "^\\d{8}$"
  }
}
```

### Version Regex

Default:

```json
{
  "versionCompare.matching.versionPatterns": [
    "^(?:v|ver|version)?\\d+(?:\\.\\d+)*(?:p\\d+)?$",
    "^\\d+(?:\\.\\d+)*(?:[a-z]+\\d*)?$"
  ]
}
```

Rules:

- Patterns are tested in order.
- Only tail or near-tail tokens are tested.
- A parsed version token is removed from `coreKey`.
- Version distance is used to disambiguate multiple candidates.

Examples:

| Version format | Regex in `settings.json` |
| --- | --- |
| `V1`, `V1.2`, `v2.0` | `"^v\\d+(?:\\.\\d+)*$"` |
| `1.0P2`, `2.3p10` | `"^\\d+(?:\\.\\d+)*p\\d+$"` |
| `REV01`, `rev12` | `"^rev\\d+$"` |
| `R1`, `R12` | `"^r\\d+$"` |

### Date Regex

Default:

```json
{
  "versionCompare.matching.datePattern": "^\\d{8}$"
}
```

Only a trailing `YYYYMMDD` token is treated as a date.

| Filename | Date ignored |
| --- | --- |
| `Report_20250621.xlsx` | Yes |
| `Report_20250621_Draft.xlsx` | No |

### Type Prefix

Default:

```json
{
  "versionCompare.matching.includeTypePrefix": true
}
```

`G-RPT_Sales_1.0.xlsx` does not match `G-DF_Sales_1.0.xlsx` by default.

Allow cross-type matching:

```json
{
  "versionCompare.matching.includeTypePrefix": false
}
```

Cross-type matches are labeled in the UI.

### Excluding Files

```json
{
  "versionCompare.excludeGlobs": [
    "**/.git/**",
    "**/node_modules/**",
    "**/*.tmp",
    "**/*.bak"
  ]
}
```

### Content Comparison

```json
{
  "versionCompare.contentCompare": "size+hash"
}
```

| Value | Behavior |
| --- | --- |
| `size+hash` | Default. Size first, then hash if sizes match. |
| `size+mtime` | Size first, then modified time. |
| `sizeOnly` | Fastest but least accurate. |

### Development

```sh
npm install
npm run compile
npm test
```
