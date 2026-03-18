import { createInterface } from "node:readline/promises";
import chalk from "chalk";

/**
 * Prompt the user for input in the terminal.
 */
export async function askUser(question: string): Promise<string> {
  console.log();
  console.log(chalk.bold.yellow("━".repeat(60)));
  console.log();
  console.log(question);
  console.log();
  console.log(chalk.bold.yellow("━".repeat(60)));
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question(chalk.cyan("You: "));
  rl.close();
  return answer;
}

interface AskQuestion {
  question?: string;
  text?: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
}

/**
 * Extract displayable text from AskUserQuestion input.
 * The SDK sends { questions: [...] } with structured question objects.
 */
function extractQuestion(input: Record<string, unknown>): string {
  // Handle { questions: [...] } array format (SDK standard)
  if (input.questions && Array.isArray(input.questions)) {
    const parts: string[] = [];
    for (const q of input.questions as AskQuestion[]) {
      if (q.header) {
        parts.push(`## ${q.header}`);
      }
      if (q.question) {
        parts.push(q.question);
      } else if (q.text) {
        parts.push(q.text);
      }
      if (q.options && q.options.length > 0) {
        parts.push("");
        for (const opt of q.options) {
          const desc = opt.description ? ` - ${opt.description}` : "";
          parts.push(`  - ${opt.label}${desc}`);
        }
      }
      parts.push("");
    }
    const result = parts.join("\n").trim();
    if (result) return result;
  }

  // Handle { questions: { question: "..." } } single object format
  if (input.questions && typeof input.questions === "object" && !Array.isArray(input.questions)) {
    const q = input.questions as AskQuestion;
    if (q.question) return q.question;
    if (q.text) return q.text;
  }

  // Handle simple string fields
  if (typeof input.question === "string" && input.question.trim()) {
    return input.question;
  }
  if (typeof input.text === "string" && input.text.trim()) {
    return input.text;
  }
  if (typeof input.message === "string" && input.message.trim()) {
    return input.message;
  }
  if (typeof input.prompt === "string" && input.prompt.trim()) {
    return input.prompt;
  }

  // Last resort: find any long string value
  for (const val of Object.values(input)) {
    if (typeof val === "string" && val.length > 20) {
      return val;
    }
  }

  // Debug: show what we actually got
  process.stderr.write(
    `[debug:AskUserQuestion] Could not extract question from: ${JSON.stringify(input).slice(0, 500)}\n`
  );

  return "What would you like to do? (Type your response)";
}

/**
 * canUseTool callback that handles AskUserQuestion interactively.
 * For all other tools, auto-approve.
 */
export async function interactiveToolHandler(
  toolName: string,
  input: Record<string, unknown>
): Promise<{ behavior: "allow"; updatedInput?: Record<string, unknown> }> {
  if (toolName === "AskUserQuestion") {
    const question = extractQuestion(input);
    const answer = await askUser(question);

    return {
      behavior: "allow" as const,
      updatedInput: {
        ...input,
        answer,
      },
    };
  }

  return { behavior: "allow" as const, updatedInput: input };
}
