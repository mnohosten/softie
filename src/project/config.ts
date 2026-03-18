import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_FILES = [
  "softie.config.yml",
  "softie.config.yaml",
  "softie.config.md",
];

export interface SoftieConfig {
  /** Raw content of the config file */
  content: string;
  /** Which file it was loaded from */
  source: string;
}

/**
 * Load softie config from CWD. Tries softie.config.yml, .yaml, .md in order.
 * Returns null if no config file found.
 */
export function loadConfig(projectDir: string): SoftieConfig | null {
  for (const filename of CONFIG_FILES) {
    const filepath = join(projectDir, filename);
    if (existsSync(filepath)) {
      const content = readFileSync(filepath, "utf-8").trim();
      if (content) {
        return { content, source: filename };
      }
    }
  }
  return null;
}

/**
 * Read project brief from a file path.
 */
export function readBriefFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Brief file not found: ${filePath}`);
  }
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) {
    throw new Error(`Brief file is empty: ${filePath}`);
  }
  return content;
}

/**
 * Read from stdin (for piped input like `softie << brief.md` or `cat brief.md | softie`).
 * Returns null if stdin is a TTY (no piped input).
 */
export function readStdin(): string | null {
  if (process.stdin.isTTY) return null;
  try {
    const content = readFileSync(0, "utf-8").trim();
    return content || null;
  } catch {
    return null;
  }
}
