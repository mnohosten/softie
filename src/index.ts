#!/usr/bin/env node

import { Command } from "commander";
import * as display from "./utils/display.js";
import { startServer } from "./server/index.js";

const program = new Command();

program
  .name("softie")
  .description("Spec-Driven Development Tool")
  .version("2.0.0");

// Default action: open Electron desktop app
program.action(async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join, resolve: res } = await import("node:path");

  const packageRoot = res(dirname(fileURLToPath(import.meta.url)), "..");
  const electronBin = join(packageRoot, "node_modules", ".bin", "electron");

  const child = spawn(electronBin, [packageRoot, process.cwd()], {
    stdio: "inherit",
    detached: false,
  });

  child.on("error", (err) => {
    display.error(`Failed to launch Electron: ${err.message}`);
    display.info("Make sure you've run: npm install && npm run build:electron");
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
});

// softie ui — start only the web dashboard (no Electron)
program
  .command("ui")
  .description("Start the web UI dashboard without Electron")
  .option("-p, --port <port>", "Port to listen on", "3847")
  .option("--dev", "Development mode (no static file serving)", false)
  .action(async (opts: { port: string; dev: boolean }) => {
    const projectDir = process.cwd();
    const port = parseInt(opts.port, 10);

    display.showLogo();
    display.info(`Starting Softie Dashboard on port ${port}...`);
    if (opts.dev) display.info("Development mode: expecting Vite dev server on port 3848");

    await startServer({ projectDir, port, isDev: opts.dev });
  });

program.parse();
