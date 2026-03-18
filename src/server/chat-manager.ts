import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { eventBus } from "../core/event-bus.js";

interface ChatThread {
  id: string;
  targetType: "task" | "phase" | "agent" | "project";
  targetId: string;
  projectDir: string;
  softieDirPath: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId: string | null;
  createdAt: string;
}

const threads = new Map<string, ChatThread>();

export function createThread(options: {
  targetType: "task" | "phase" | "agent" | "project";
  targetId: string;
  projectDir: string;
  softieDirPath: string;
}): string {
  const id = randomUUID();
  threads.set(id, {
    id,
    ...options,
    history: [],
    sessionId: null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export function getThread(threadId: string): ChatThread | undefined {
  return threads.get(threadId);
}

function buildSystemPrompt(
  targetType: string,
  targetId: string,
  softieDirPath: string
): string {
  const scopeDesc =
    targetType === "task"
      ? `a specific task (${targetId})`
      : targetType === "phase"
        ? `a project phase (${targetId})`
        : targetType === "agent"
          ? `an agent definition (${targetId})`
          : "the entire project";

  return `You are a helpful AI assistant embedded in the Softie project dashboard.
The user is asking about ${scopeDesc}.

## Your capabilities
- Read and edit files within the .softie/ directory
- Help the user understand, modify, and improve project plans, agent definitions, and tasks
- Suggest changes and implement them when asked

## Constraints
- You may ONLY read/write files inside: ${softieDirPath}
- Do not access files outside the .softie/ directory

## Context
- Project files are in: ${softieDirPath}
- Key files: project.json (metadata), plan/phases.json (phases), team/team.json (agents), state/ (progress + tasks)

Be helpful, concise, and precise. When making changes to files, always read them first to understand the current state.`;
}

function buildHistoryContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  if (history.length === 0) return "";
  const lines = ["## Previous conversation\n"];
  for (const msg of history) {
    lines.push(`**${msg.role === "user" ? "User" : "Assistant"}:** ${msg.content}`);
    lines.push("");
  }
  return lines.join("\n") + "\n---\n\n";
}

export async function sendMessage(options: {
  threadId: string;
  message: string;
}): Promise<void> {
  const thread = threads.get(options.threadId);
  if (!thread) {
    throw new Error(`Thread ${options.threadId} not found`);
  }

  const systemPrompt = buildSystemPrompt(
    thread.targetType,
    thread.targetId,
    thread.softieDirPath
  );

  const historyContext = buildHistoryContext(thread.history);
  const fullPrompt = historyContext + options.message;

  let assistantResponse = "";

  for await (const msg of query({
    prompt: fullPrompt,
    options: {
      systemPrompt,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-sonnet-4-6",
      cwd: thread.projectDir,
      maxTurns: 10,
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        // Restrict Write/Edit to .softie/ directory only
        if (toolName === "Write" || toolName === "Edit") {
          const filePath = (input.file_path as string) || "";
          const softieDirName = ".softie";
          const allowed =
            filePath.includes(softieDirName) ||
            filePath.startsWith(join(thread.projectDir, softieDirName));
          if (!allowed) {
            return {
              behavior: "allow" as const,
              updatedInput: {
                ...input,
                file_path: join(thread.softieDirPath, "context", "notes.md"),
              },
            };
          }
        }
        return { behavior: "allow" as const };
      },
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          assistantResponse += block.text;
          eventBus.emit_event({
            type: "chat:delta",
            threadId: options.threadId,
            content: block.text,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    if (msg.type === "result") {
      eventBus.emit_event({
        type: "chat:done",
        threadId: options.threadId,
        cost: msg.total_cost_usd,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Update history
  thread.history.push({ role: "user", content: options.message });
  if (assistantResponse) {
    thread.history.push({ role: "assistant", content: assistantResponse });
  }

  // Keep history bounded (last 20 messages)
  if (thread.history.length > 20) {
    thread.history = thread.history.slice(-20);
  }
}
