import type { WsHub } from "./ws-hub.js";
import { extractQuestion } from "../utils/input.js";

// Single pending resolve — only one milestone question active at a time
let pendingResolve: ((answer: string) => void) | null = null;

export function waitForUiAnswer(): Promise<string> {
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

export function resolveUiAnswer(answer: string): void {
  pendingResolve?.(answer);
  pendingResolve = null;
}

export function createUiToolHandler(wsHub: WsHub) {
  return async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<{ behavior: "allow"; updatedInput?: Record<string, unknown> }> => {
    if (toolName === "AskUserQuestion") {
      const question = extractQuestion(input);
      wsHub.broadcast({
        type: "milestone:question",
        question,
        timestamp: new Date().toISOString(),
      });
      const answer = await waitForUiAnswer();
      return { behavior: "allow" as const, updatedInput: { ...input, answer } };
    }
    return { behavior: "allow" as const, updatedInput: input };
  };
}
