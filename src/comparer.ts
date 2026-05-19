import * as crypto from "crypto";
import * as fs from "fs";
import type { MatchResultItem, VersionCompareConfig } from "./types";

export async function classifyPairedItems(
  items: MatchResultItem[],
  config: VersionCompareConfig,
): Promise<MatchResultItem[]> {
  const classified: MatchResultItem[] = [];

  for (const item of items) {
    if (item.status !== "paired-pending" || !item.left || !item.right) {
      classified.push(item);
      continue;
    }

    try {
      const result = await compareFiles(item.left.uri.fsPath, item.right.uri.fsPath, item.left.size, item.right.size, config);
      classified.push({
        ...item,
        status: result.identical ? "paired-identical" : "paired-modified",
        reason: `${item.reason}; ${result.reason}`,
      });
    } catch (error) {
      classified.push({
        ...item,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        reason: `${item.reason}; content compare failed`,
      });
    }
  }

  return classified;
}

async function compareFiles(
  leftPath: string,
  rightPath: string,
  leftSize: number,
  rightSize: number,
  config: VersionCompareConfig,
): Promise<{ identical: boolean; reason: string }> {
  if (leftSize !== rightSize) {
    return {
      identical: false,
      reason: `contentCompare=${config.contentCompare} size differs (${leftSize} != ${rightSize})`,
    };
  }

  if (config.contentCompare === "sizeOnly") {
    return {
      identical: true,
      reason: `contentCompare=sizeOnly size equal (${leftSize})`,
    };
  }

  if (config.contentCompare === "size+mtime") {
    const [leftStat, rightStat] = await Promise.all([fs.promises.stat(leftPath), fs.promises.stat(rightPath)]);
    const identical = Math.round(leftStat.mtimeMs) === Math.round(rightStat.mtimeMs);
    return {
      identical,
      reason: `contentCompare=size+mtime mtime ${identical ? "equal" : "differs"}`,
    };
  }

  const [leftHash, rightHash] = await Promise.all([hashFile(leftPath), hashFile(rightPath)]);
  return {
    identical: leftHash === rightHash,
    reason: `contentCompare=size+hash hash ${leftHash === rightHash ? "equal" : "differs"}`,
  };
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
