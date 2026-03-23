import { randomUUID } from "node:crypto";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Task, TaskStatus, TaskPriority, TaskComplexity, Sprint, SprintStatus } from "../project/state.js";
import { eventBus } from "../core/event-bus.js";

export class BoardManager {
  constructor(private softieDir: SoftieDir) {}

  // --- Tasks ---

  listTasks(): Task[] {
    return this.softieDir.getBoardTasks();
  }

  getTask(id: string): Task | null {
    return this.softieDir.getBoardTask(id);
  }

  createTask(data: {
    title: string;
    description: string;
    specId?: string;
    specSectionId?: string;
    priority?: TaskPriority;
    estimatedComplexity?: TaskComplexity;
    sprintId?: string;
    phaseId?: string;
    dependencies?: string[];
  }): Task {
    const now = new Date().toISOString();
    const id = randomUUID().slice(0, 8);

    const task: Task = {
      id,
      title: data.title,
      description: data.description,
      status: "backlog",
      priority: data.priority || "p1",
      estimatedComplexity: data.estimatedComplexity || "medium",
      specId: data.specId,
      specSectionId: data.specSectionId,
      sprintId: data.sprintId,
      phaseId: data.phaseId,
      dependencies: data.dependencies || [],
      createdAt: now,
      updatedAt: now,
    };

    const tasks = this.softieDir.getBoardTasks();
    tasks.push(task);
    this.softieDir.writeBoardTasks(tasks);

    eventBus.emit_event({
      type: "file:changed",
      path: "board/tasks.json",
      timestamp: now,
    });

    return task;
  }

  updateTask(id: string, updates: Partial<Pick<Task,
    "title" | "description" | "status" | "priority" | "assignedAgentId" |
    "dependencies" | "sprintId" | "phaseId" | "estimatedComplexity" | "specId" | "specSectionId"
  >>): Task | null {
    const tasks = this.softieDir.getBoardTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;

    const now = new Date().toISOString();
    tasks[idx] = {
      ...tasks[idx],
      ...updates,
      updatedAt: now,
    };
    this.softieDir.writeBoardTasks(tasks);

    eventBus.emit_event({
      type: "file:changed",
      path: "board/tasks.json",
      timestamp: now,
    });

    return tasks[idx];
  }

  updateTaskStatus(id: string, status: TaskStatus): Task | null {
    return this.updateTask(id, { status });
  }

  deleteTask(id: string): boolean {
    const tasks = this.softieDir.getBoardTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;

    tasks.splice(idx, 1);
    this.softieDir.writeBoardTasks(tasks);

    // Also remove from sprints
    const sprints = this.softieDir.getSprints();
    let sprintUpdated = false;
    for (const sprint of sprints) {
      const before = sprint.taskIds.length;
      sprint.taskIds = sprint.taskIds.filter((tid) => tid !== id);
      if (sprint.taskIds.length !== before) sprintUpdated = true;
    }
    if (sprintUpdated) this.softieDir.writeSprints(sprints);

    return true;
  }

  getTasksBySpec(specId: string): Task[] {
    return this.listTasks().filter((t) => t.specId === specId);
  }

  getTasksBySprint(sprintId: string): Task[] {
    return this.listTasks().filter((t) => t.sprintId === sprintId);
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.listTasks().filter((t) => t.status === status);
  }

  /** Return tasks that have all dependencies satisfied (status === "done") */
  getReadyTasks(): Task[] {
    const allTasks = this.listTasks();
    const doneIds = new Set(allTasks.filter((t) => t.status === "done").map((t) => t.id));

    return allTasks
      .filter((t) => t.status === "todo")
      .filter((t) => t.dependencies.every((depId) => doneIds.has(depId)));
  }

  // --- Sprints ---

  listSprints(): Sprint[] {
    return this.softieDir.getSprints();
  }

  getSprint(id: string): Sprint | null {
    return this.softieDir.getSprint(id);
  }

  createSprint(data: { name: string; taskIds?: string[] }): Sprint {
    const now = new Date().toISOString();
    const sprints = this.softieDir.getSprints();
    const id = randomUUID().slice(0, 8);

    const sprint: Sprint = {
      id,
      name: data.name,
      order: sprints.length + 1,
      status: "planning",
      taskIds: data.taskIds || [],
      createdAt: now,
      updatedAt: now,
    };

    sprints.push(sprint);
    this.softieDir.writeSprints(sprints);

    // Update tasks to reference this sprint
    if (data.taskIds?.length) {
      const tasks = this.softieDir.getBoardTasks();
      for (const task of tasks) {
        if (data.taskIds.includes(task.id)) {
          task.sprintId = id;
          task.updatedAt = now;
        }
      }
      this.softieDir.writeBoardTasks(tasks);
    }

    return sprint;
  }

  updateSprint(id: string, updates: Partial<Pick<Sprint, "name" | "status" | "taskIds">>): Sprint | null {
    const sprints = this.softieDir.getSprints();
    const idx = sprints.findIndex((s) => s.id === id);
    if (idx < 0) return null;

    const now = new Date().toISOString();
    sprints[idx] = {
      ...sprints[idx],
      ...updates,
      updatedAt: now,
    };
    this.softieDir.writeSprints(sprints);
    return sprints[idx];
  }

  updateSprintStatus(id: string, status: SprintStatus): Sprint | null {
    return this.updateSprint(id, { status });
  }

  addTaskToSprint(sprintId: string, taskId: string): boolean {
    const sprint = this.getSprint(sprintId);
    if (!sprint || sprint.taskIds.includes(taskId)) return false;

    this.updateSprint(sprintId, {
      taskIds: [...sprint.taskIds, taskId],
    });
    this.updateTask(taskId, { sprintId });
    return true;
  }

  removeTaskFromSprint(sprintId: string, taskId: string): boolean {
    const sprint = this.getSprint(sprintId);
    if (!sprint) return false;

    this.updateSprint(sprintId, {
      taskIds: sprint.taskIds.filter((id) => id !== taskId),
    });
    this.updateTask(taskId, { sprintId: undefined });
    return true;
  }

  deleteSprint(id: string): boolean {
    const sprints = this.softieDir.getSprints();
    const idx = sprints.findIndex((s) => s.id === id);
    if (idx < 0) return false;

    // Unlink tasks
    const tasks = this.softieDir.getBoardTasks();
    const now = new Date().toISOString();
    for (const task of tasks) {
      if (task.sprintId === id) {
        task.sprintId = undefined;
        task.updatedAt = now;
      }
    }
    this.softieDir.writeBoardTasks(tasks);

    sprints.splice(idx, 1);
    this.softieDir.writeSprints(sprints);
    return true;
  }
}
