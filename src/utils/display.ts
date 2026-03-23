import chalk from "chalk";
import { eventBus } from "../core/event-bus.js";

const LOGO = `
  ███████  ██████  ███████ ████████ ██ ███████
  ██      ██    ██ ██         ██    ██ ██
  ███████ ██    ██ █████      ██    ██ █████
       ██ ██    ██ ██         ██    ██ ██
  ███████  ██████  ██         ██    ██ ███████
`;

export function showLogo(): void {
  console.log(chalk.cyan(LOGO));
  console.log(
    chalk.gray("  Spec-Driven Development v2.0.0\n")
  );
}

export function header(text: string): void {
  console.log();
  console.log(chalk.bold.cyan(`━━━ ${text} ━━━`));
  console.log();
}

export function info(text: string): void {
  console.log(chalk.blue("ℹ ") + text);
}

export function success(text: string): void {
  console.log(chalk.green("✓ ") + text);
}

export function warn(text: string): void {
  console.log(chalk.yellow("⚠ ") + text);
}

export function error(text: string): void {
  console.log(chalk.red("✗ ") + text);
}

export function phase(name: string, description: string, phaseId = ""): void {
  console.log();
  console.log(chalk.bold.magenta(`▶ Phase: ${name}`));
  console.log(chalk.gray(`  ${description}`));
  console.log();
  eventBus.emit_event({
    type: "phase:started",
    phaseId,
    phaseName: name,
    description,
    timestamp: new Date().toISOString(),
  });
}

export function milestone(name: string): void {
  console.log();
  console.log(chalk.bold.yellow(`🏁 Milestone: ${name}`));
  console.log(chalk.yellow("─".repeat(50)));
  console.log();
}

export function agent(name: string, action: string): void {
  console.log(chalk.cyan(`  [${name}] `) + chalk.gray(action));
  eventBus.emit_event({
    type: "agent:activity",
    agentName: name,
    action,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Format a tool_use block into a human-readable action description.
 */
export function formatToolUse(
  toolName: string,
  input: Record<string, unknown>
): string {
  switch (toolName) {
    case "Write": {
      const fp = input.file_path as string | undefined;
      return fp ? `Writing ${chalk.white(shortenPath(fp))}` : "Writing file...";
    }
    case "Edit": {
      const fp = input.file_path as string | undefined;
      return fp ? `Editing ${chalk.white(shortenPath(fp))}` : "Editing file...";
    }
    case "Read": {
      const fp = input.file_path as string | undefined;
      return fp ? `Reading ${chalk.white(shortenPath(fp))}` : "Reading file...";
    }
    case "WebSearch": {
      const q = input.query as string | undefined;
      return q ? `Searching: ${chalk.white(truncate(q, 80))}` : "Searching web...";
    }
    case "WebFetch": {
      const url = input.url as string | undefined;
      return url ? `Fetching ${chalk.white(truncate(url, 80))}` : "Fetching URL...";
    }
    case "Bash": {
      const cmd = input.command as string | undefined;
      return cmd ? `Running: ${chalk.white(truncate(cmd, 80))}` : "Running command...";
    }
    case "Glob": {
      const pattern = input.pattern as string | undefined;
      return pattern
        ? `Finding files: ${chalk.white(pattern)}`
        : "Finding files...";
    }
    case "Grep": {
      const pattern = input.pattern as string | undefined;
      return pattern
        ? `Searching code: ${chalk.white(truncate(pattern, 60))}`
        : "Searching code...";
    }
    case "Agent": {
      const desc = input.description as string | undefined;
      const agentType = input.subagent_type as string | undefined;
      const label = agentType || "subagent";
      return desc
        ? `Delegating to ${chalk.white(label)}: ${truncate(desc, 60)}`
        : `Delegating to ${chalk.white(label)}`;
    }
    case "AskUserQuestion": {
      const q = input.question as string | undefined;
      return q ? `Asking investor: ${chalk.white(truncate(q, 60))}` : "Asking investor...";
    }
    case "ToolSearch":
      return "Looking up available tools...";
    default:
      return `Using ${toolName}...`;
  }
}

function shortenPath(filePath: string): string {
  // Show last 2-3 path segments for readability
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return ".../" + parts.slice(-3).join("/");
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

export function cost(usd: number): void {
  console.log(chalk.gray(`  Cost so far: $${usd.toFixed(4)}`));
}

export function progress(completed: number, total: number): void {
  const pct = Math.round((completed / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  console.log(chalk.gray(`  Progress: [${bar}] ${pct}%`));
}

export function divider(): void {
  console.log(chalk.gray("─".repeat(50)));
}

export function investorPrompt(question: string): void {
  console.log();
  console.log(chalk.bold.yellow("━".repeat(50)));
  console.log(chalk.bold.yellow("  INVESTOR CHECK-IN"));
  console.log(chalk.bold.yellow("━".repeat(50)));
  console.log();
  console.log(question);
  console.log();
}

export function teamDisplay(
  agents: Array<{ id: string; name: string; description: string }>
): void {
  header("Expert Team");
  for (const a of agents) {
    console.log(chalk.cyan(`  • ${a.name}`) + chalk.gray(` (${a.id})`));
    console.log(chalk.gray(`    ${a.description}`));
  }
  console.log();
}

export function sdkMessage(agentName: string, content: string): void {
  const truncated =
    content.length > 200 ? content.slice(0, 200) + "..." : content;
  console.log(chalk.gray(`  [${agentName}] ${truncated}`));
  eventBus.emit_event({
    type: "sdk:text",
    agentName,
    text: content,
    timestamp: new Date().toISOString(),
  });
}

export function parallelLaunch(agentNames: string[]): void {
  console.log();
  console.log(
    chalk.bold.blue(`  ⟁ Parallel launch: `) +
      agentNames.map((n) => chalk.cyan(n)).join(chalk.gray(" | "))
  );
  eventBus.emit_event({
    type: "parallel:launch",
    agentNames,
    timestamp: new Date().toISOString(),
  });
}

export function taskStarted(taskId: string, agentName: string): void {
  console.log(
    chalk.gray(`    ↳ `) +
      chalk.cyan(agentName) +
      chalk.gray(` running in background (${taskId.slice(0, 8)}...)`)
  );
}

export function taskCompleted(agentName: string): void {
  console.log(chalk.green(`    ✓ `) + chalk.cyan(agentName) + chalk.green(` completed`));
}
