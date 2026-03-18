import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export class Logger {
  private logDir: string;
  private logFile: string;

  constructor(softieDir: string) {
    this.logDir = join(softieDir, "logs");
    mkdirSync(this.logDir, { recursive: true });
    this.logFile = join(
      this.logDir,
      `run-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
    );
  }

  log(
    level: "info" | "warn" | "error" | "debug",
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(data ? { data } : {}),
    };
    appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("info", category, message, data);
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("warn", category, message, data);
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("error", category, message, data);
  }

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("debug", category, message, data);
  }
}
