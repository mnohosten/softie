#!/usr/bin/env node

import { resolve } from "node:path";
import { Command } from "commander";
import { SoftieDir } from "./project/softie-dir.js";
import { Logger } from "./utils/logger.js";
import { runMetaOrchestrator } from "./meta/meta-orchestrator.js";
import { validateAndIndexTeam } from "./meta/team-generator.js";
import { runProjectOrchestrator } from "./orchestrator/orchestrator.js";
import { runMilestoneCheckIn, updateMilestoneStatus } from "./orchestrator/milestone.js";
import { loadConfig, readBriefFile, readStdin } from "./project/config.js";
import * as display from "./utils/display.js";
import { startServer } from "./server/index.js";

const program = new Command();

program
  .name("softie")
  .description("Universal Project Orchestrator")
  .version("0.1.0");

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

// ── CLI subcommand group ──────────────────────────────────────────────────────

const cli = program
  .command("cli")
  .description("Run Softie from the command line");

// softie cli "<intent>"
cli
  .argument("[intent]", "Project intent / description")
  .option("-f, --file <path>", "Read project brief from a file")
  .action(async (intent: string | undefined, opts: { file?: string }) => {
    const stdinContent = readStdin();
    let resolvedIntent: string;

    if (opts.file) {
      resolvedIntent = readBriefFile(resolve(opts.file));
    } else if (stdinContent) {
      resolvedIntent = stdinContent;
    } else if (intent) {
      resolvedIntent = intent;
    } else {
      cli.help();
      return;
    }

    display.showLogo();
    const projectDir = process.cwd();
    const softieDir = new SoftieDir(projectDir);

    if (softieDir.exists) {
      display.warn(".softie/ already exists in this directory.");
      display.info("Use 'softie cli resume' to continue or delete .softie/ to start fresh.");
      process.exit(1);
    }

    const config = loadConfig(projectDir);
    if (config) {
      display.info(`Loaded preferences from ${config.source}`);
    }

    const metadata = softieDir.init(resolvedIntent, config?.content);
    const logger = new Logger(softieDir.root);

    display.info(`Project ID: ${metadata.id}`);
    display.info(`Working directory: ${projectDir}`);
    display.divider();

    try {
      await runMetaOrchestrator(resolvedIntent, softieDir, logger, config?.content);

      const { team: _team, agents, plan } = await validateAndIndexTeam(softieDir, logger);

      const m0 = plan.milestones.find((m) => m.id === "m0");
      if (m0) {
        const { approved } = await runMilestoneCheckIn(m0, softieDir, logger);
        if (!approved) {
          display.warn("Team not approved. Project paused.");
          display.info("Modify .softie/team/ and run 'softie cli resume'.");
          softieDir.updateMetadata({ status: "paused" });
          process.exit(0);
        }
        updateMilestoneStatus(softieDir, "m0", "completed");
      }

      await runProjectOrchestrator(softieDir, agents, plan, logger);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      display.error(`Fatal: ${message}`);
      logger.error("main", message);
      softieDir.updateMetadata({ status: "failed" });
      process.exit(1);
    }
  });

// softie cli resume
cli
  .command("resume")
  .description("Resume a paused project")
  .action(async () => {
    display.showLogo();
    const projectDir = process.cwd();
    const softieDir = new SoftieDir(projectDir);

    if (!softieDir.exists) {
      display.error("No .softie/ directory found. Start a project first with: softie cli \"<intent>\"");
      process.exit(1);
    }

    const metadata = softieDir.getMetadata();
    if (!metadata) {
      display.error("Could not read project metadata.");
      process.exit(1);
    }

    const logger = new Logger(softieDir.root);
    display.info(`Resuming project: ${metadata.name}`);
    display.info(`Status: ${metadata.status}`);

    try {
      if (metadata.status === "analyzing" || metadata.status === "initializing") {
        await runMetaOrchestrator(metadata.intent, softieDir, logger);
        const updated = softieDir.getMetadata();
        if (updated) metadata.status = updated.status;
      }

      if (
        metadata.status === "team-review" ||
        metadata.status === "analyzing"
      ) {
        const { agents, plan } = await validateAndIndexTeam(softieDir, logger);

        const m0 = plan.milestones.find((m) => m.id === "m0");
        if (m0 && m0.status === "pending") {
          const { approved } = await runMilestoneCheckIn(m0, softieDir, logger);
          if (!approved) {
            display.warn("Team not approved. Project remains paused.");
            process.exit(0);
          }
          updateMilestoneStatus(softieDir, "m0", "completed");
        }

        await runProjectOrchestrator(softieDir, agents, plan, logger);
      } else if (
        metadata.status === "executing" ||
        metadata.status === "paused" ||
        metadata.status === "milestone-review"
      ) {
        const { agents, plan } = await validateAndIndexTeam(softieDir, logger);
        const remainingPlan = {
          ...plan,
          phases: plan.phases.filter(
            (p) => p.status === "pending" || p.status === "active"
          ),
        };
        await runProjectOrchestrator(softieDir, agents, remainingPlan, logger);
      } else if (metadata.status === "completed") {
        display.success("Project is already completed!");
      } else {
        display.error(`Cannot resume from status: ${metadata.status}`);
        process.exit(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      display.error(`Fatal: ${message}`);
      logger.error("resume", message);
      process.exit(1);
    }
  });

// softie cli status
cli
  .command("status")
  .description("Show current project status")
  .action(async () => {
    const projectDir = process.cwd();
    const softieDir = new SoftieDir(projectDir);

    if (!softieDir.exists) {
      display.error("No .softie/ directory found.");
      process.exit(1);
    }

    const metadata = softieDir.getMetadata();
    if (!metadata) {
      display.error("Could not read project metadata.");
      process.exit(1);
    }

    display.header("Project Status");
    console.log(`  ID:      ${metadata.id}`);
    console.log(`  Name:    ${metadata.name}`);
    console.log(`  Status:  ${metadata.status}`);
    console.log(`  Created: ${metadata.createdAt}`);
    console.log(`  Updated: ${metadata.updatedAt}`);

    const progressData = softieDir.getProgress();
    if (progressData) {
      console.log();
      display.progress(progressData.completedPhases, progressData.totalPhases || 1);
      display.cost(progressData.totalCostUsd);
    }

    const team = softieDir.getTeam();
    if (team) {
      display.teamDisplay(team.agents as Array<{ id: string; name: string; description: string }>);
    }

    const plan = softieDir.getPlan();
    if (plan) {
      display.header("Phases");
      for (const p of plan.phases.sort((a, b) => a.order - b.order)) {
        const statusIcon =
          p.status === "completed"
            ? "✓"
            : p.status === "active"
              ? "▶"
              : p.status === "failed"
                ? "✗"
                : "○";
        console.log(`  ${statusIcon} ${p.name} (${p.status})`);
      }

      console.log();
      display.header("Milestones");
      for (const m of plan.milestones) {
        const statusIcon =
          m.status === "completed"
            ? "✓"
            : m.status === "active"
              ? "▶"
              : "○";
        console.log(`  ${statusIcon} ${m.name} (${m.status})`);
      }
    }
  });

// softie cli ui
cli
  .command("ui")
  .description("Start the web UI dashboard")
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
