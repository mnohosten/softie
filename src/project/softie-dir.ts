import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ProjectMetadata,
  PhasePlan,
  Team,
  Progress,
  Decision,
  AgentDefinition,
  TaskApproval,
  ApprovalState,
  Spec,
  Task,
  Sprint,
} from "./state.js";

const SOFTIE_DIR = ".softie";

export class SoftieDir {
  readonly root: string;
  readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.root = join(projectDir, SOFTIE_DIR);
  }

  get exists(): boolean {
    return existsSync(this.root);
  }

  // --- Initialization ---

  init(intent: string, preferences?: string): ProjectMetadata {
    const dirs = [
      this.root,
      join(this.root, "analysis"),
      join(this.root, "team"),
      join(this.root, "team", "agents"),
      join(this.root, "plan"),
      join(this.root, "state"),
      join(this.root, "logs"),
      join(this.root, "artifacts"),
      join(this.root, "context"),
      join(this.root, "specs"),
      join(this.root, "board"),
    ];

    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }

    const now = new Date().toISOString();
    const metadata: ProjectMetadata = {
      id: randomUUID(),
      name: intent.slice(0, 80),
      intent,
      status: "initializing",
      createdAt: now,
      updatedAt: now,
    };

    this.writeJson("project.json", metadata);

    const progress: Progress = {
      totalPhases: 0,
      completedPhases: 0,
      totalCostUsd: 0,
      startedAt: now,
      lastActivityAt: now,
    };
    this.writeJson("state/progress.json", progress);
    this.writeJson("state/decisions.json", [] as Decision[]);

    // Write brief
    writeFileSync(
      join(this.root, "analysis", "brief.md"),
      `# Project Brief\n\n${intent}\n\nCreated: ${now}\n`
    );

    // Write user preferences to context if provided
    if (preferences) {
      this.writeContextFile(
        "preferences.md",
        `# User Preferences\n\n${preferences}\n`
      );
    }

    return metadata;
  }

  // --- JSON helpers ---

  private resolvePath(relativePath: string): string {
    return join(this.root, relativePath);
  }

  writeJson(relativePath: string, data: unknown): void {
    const fullPath = this.resolvePath(relativePath);
    writeFileSync(fullPath, JSON.stringify(data, null, 2) + "\n");
  }

  readJson<T>(relativePath: string): T | null {
    const fullPath = this.resolvePath(relativePath);
    if (!existsSync(fullPath)) return null;
    return JSON.parse(readFileSync(fullPath, "utf-8")) as T;
  }

  writeFile(relativePath: string, content: string): void {
    writeFileSync(this.resolvePath(relativePath), content);
  }

  readFile(relativePath: string): string | null {
    const fullPath = this.resolvePath(relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, "utf-8");
  }

  // --- Project metadata ---

  getMetadata(): ProjectMetadata | null {
    return this.readJson<ProjectMetadata>("project.json");
  }

  updateMetadata(updates: Partial<ProjectMetadata>): void {
    const current = this.getMetadata();
    if (!current) throw new Error("No project metadata found");
    this.writeJson("project.json", {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  // --- Team ---

  getTeam(): Team | null {
    return this.readJson<Team>("team/team.json");
  }

  writeTeam(team: Team): void {
    this.writeJson("team/team.json", team);
  }

  writeAgentDefinition(agent: AgentDefinition): void {
    const frontmatter = [
      "---",
      `id: ${agent.id}`,
      `name: ${agent.name}`,
      `description: ${agent.description}`,
      `model: ${agent.model}`,
      `maxTurns: ${agent.maxTurns}`,
      `tools:`,
      ...agent.tools.map((t) => `  - ${t}`),
      `dependencies:`,
      ...agent.dependencies.map((d) => `  - ${d}`),
      "---",
      "",
    ].join("\n");

    this.writeFile(
      `team/agents/${agent.id}.md`,
      frontmatter + agent.prompt + "\n"
    );
  }

  getAgentDefinitions(): AgentDefinition[] {
    const teamDir = join(this.root, "team", "agents");
    if (!existsSync(teamDir)) return [];

    const files = readdirSync(teamDir).filter((f) => f.endsWith(".md"));

    return files.map((file: string) => {
      const content = readFileSync(join(teamDir, file), "utf-8");
      return this.parseAgentMd(content);
    });
  }

  private parseAgentMd(content: string): AgentDefinition {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) throw new Error("Invalid agent definition format");

    const [, frontmatter, prompt] = fmMatch;
    const lines = frontmatter.split("\n");
    const data: Record<string, string | string[]> = {};
    let currentArray: string[] | null = null;
    let currentKey = "";

    for (const line of lines) {
      const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        if (value.trim() === "") {
          currentArray = [];
          currentKey = key;
          data[key] = currentArray;
        } else {
          data[key] = value.trim();
          currentArray = null;
        }
      } else if (currentArray !== null && line.match(/^\s+-\s+(.+)$/)) {
        const itemMatch = line.match(/^\s+-\s+(.+)$/);
        if (itemMatch) {
          currentArray.push(itemMatch[1].trim());
          data[currentKey] = currentArray;
        }
      }
    }

    const maxTurnsRaw = data.maxTurns as string | undefined;
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string,
      model: (data.model as string) as AgentDefinition["model"],
      tools: (data.tools || []) as AgentDefinition["tools"],
      dependencies: (data.dependencies || []) as string[],
      prompt: prompt.trim(),
      maxTurns: maxTurnsRaw ? parseInt(maxTurnsRaw, 10) : 30,
    };
  }

  // --- Plan ---

  getPlan(): PhasePlan | null {
    return this.readJson<PhasePlan>("plan/phases.json");
  }

  writePlan(plan: PhasePlan): void {
    this.writeJson("plan/phases.json", plan);
    this.writeJson("plan/current-phase.json", {
      currentPhaseId: plan.phases[0]?.id || null,
      startedAt: new Date().toISOString(),
    });
  }

  // --- Progress ---

  getProgress(): Progress | null {
    return this.readJson<Progress>("state/progress.json");
  }

  updateProgress(updates: Partial<Progress>): void {
    const current = this.getProgress();
    if (!current) return;
    this.writeJson("state/progress.json", {
      ...current,
      ...updates,
      lastActivityAt: new Date().toISOString(),
    });
  }

  // --- Decisions ---

  addDecision(decision: Omit<Decision, "timestamp">): void {
    const decisions = this.readJson<Decision[]>("state/decisions.json") || [];
    decisions.push({
      ...decision,
      timestamp: new Date().toISOString(),
    });
    this.writeJson("state/decisions.json", decisions);
  }

  // --- Context ---

  getContextSummary(): string {
    const contextDir = join(this.root, "context");
    if (!existsSync(contextDir)) return "";

    const files = readdirSync(contextDir).filter((f) => f.endsWith(".md")).sort();
    if (files.length === 0) return "";

    const sections: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(contextDir, file), "utf-8").trim();
      if (content) {
        sections.push(`## ${file.replace(".md", "").replace(/-/g, " ").toUpperCase()}\n\n${content}`);
      }
    }

    return sections.length > 0
      ? `# PROJECT CONTEXT\n\n${sections.join("\n\n---\n\n")}\n`
      : "";
  }

  writeContextFile(name: string, content: string): void {
    const contextDir = join(this.root, "context");
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(join(contextDir, name), content);
  }

  // --- Session ---

  getSessionId(): string | null {
    const data = this.readJson<{ sessionId: string }>(
      "state/orchestrator-session.json"
    );
    return data?.sessionId || null;
  }

  saveSessionId(sessionId: string): void {
    this.writeJson("state/orchestrator-session.json", { sessionId });
  }

  // --- Tasks / Approval ---

  getTasks(): TaskApproval[] {
    return this.readJson<TaskApproval[]>("state/tasks.json") || [];
  }

  writeTasks(tasks: TaskApproval[]): void {
    this.writeJson("state/tasks.json", tasks);
  }

  getApprovalState(): ApprovalState {
    return (
      this.readJson<ApprovalState>("state/approval.json") || {
        mode: "granular",
        braveMode: false,
      }
    );
  }

  writeApprovalState(state: ApprovalState): void {
    this.writeJson("state/approval.json", state);
  }

  // --- Snapshots (approved versions for diff) ---

  saveSnapshot(relativePath: string, content: string): void {
    const snapshotsDir = join(this.root, "state", "snapshots");
    mkdirSync(snapshotsDir, { recursive: true });
    // Flatten the path for storage
    const key = relativePath.replace(/\//g, "__").replace(/\\/g, "__");
    writeFileSync(join(snapshotsDir, key), content);
  }

  getSnapshot(relativePath: string): string | null {
    const key = relativePath.replace(/\//g, "__").replace(/\\/g, "__");
    const snapshotPath = join(this.root, "state", "snapshots", key);
    if (!existsSync(snapshotPath)) return null;
    return readFileSync(snapshotPath, "utf-8");
  }

  // --- Specs (v2) ---

  getSpecs(): Spec[] {
    return this.readJson<Spec[]>("specs/index.json") || [];
  }

  writeSpecs(specs: Spec[]): void {
    this.writeJson("specs/index.json", specs);
  }

  getSpec(id: string): Spec | null {
    const specs = this.getSpecs();
    return specs.find((s) => s.id === id) || null;
  }

  writeSpecContent(filePath: string, content: string): void {
    const specsDir = join(this.root, "specs");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, filePath), content);
  }

  readSpecContent(filePath: string): string | null {
    const fullPath = join(this.root, "specs", filePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, "utf-8");
  }

  // --- Board: Tasks v2 ---

  getBoardTasks(): Task[] {
    return this.readJson<Task[]>("board/tasks.json") || [];
  }

  writeBoardTasks(tasks: Task[]): void {
    this.writeJson("board/tasks.json", tasks);
  }

  getBoardTask(id: string): Task | null {
    const tasks = this.getBoardTasks();
    return tasks.find((t) => t.id === id) || null;
  }

  // --- Sprints ---

  getSprints(): Sprint[] {
    return this.readJson<Sprint[]>("board/sprints.json") || [];
  }

  writeSprints(sprints: Sprint[]): void {
    this.writeJson("board/sprints.json", sprints);
  }

  getSprint(id: string): Sprint | null {
    const sprints = this.getSprints();
    return sprints.find((s) => s.id === id) || null;
  }

  // --- File listing ---

  listFiles(subDir: string): Array<{ path: string; name: string; isDir: boolean }> {
    const targetDir = subDir ? join(this.root, subDir) : this.root;
    if (!existsSync(targetDir)) return [];

    const entries = readdirSync(targetDir, { withFileTypes: true });
    return entries.map((entry) => ({
      path: subDir ? `${subDir}/${entry.name}` : entry.name,
      name: entry.name,
      isDir: entry.isDirectory(),
    }));
  }
}
