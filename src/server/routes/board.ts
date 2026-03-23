import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";
import { BoardManager } from "../../board/board-manager.js";
import { runPlanningOrchestrator } from "../../agent/planning-orchestrator.js";
import { runSprintReview } from "../../agent/sprint-review.js";
import { Logger } from "../../utils/logger.js";
import type { TaskStatus, TaskPriority, TaskComplexity, SprintStatus } from "../../project/state.js";

export async function boardRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir }
): Promise<void> {
  const boardManager = new BoardManager(options.softieDir);

  // ─── Tasks ───────────────────────────────────────────

  // GET /api/board/tasks
  fastify.get("/api/board/tasks", async () => {
    return { tasks: boardManager.listTasks() };
  });

  // GET /api/board/tasks/:id
  fastify.get<{ Params: { id: string } }>("/api/board/tasks/:id", async (request, reply) => {
    const task = boardManager.getTask(request.params.id);
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return task;
  });

  // POST /api/board/tasks
  fastify.post<{
    Body: {
      title: string;
      description: string;
      specId?: string;
      specSectionId?: string;
      priority?: TaskPriority;
      estimatedComplexity?: TaskComplexity;
      sprintId?: string;
      dependencies?: string[];
    };
  }>("/api/board/tasks", async (request) => {
    return boardManager.createTask(request.body);
  });

  // PUT /api/board/tasks/:id
  fastify.put<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assignedAgentId?: string;
      sprintId?: string;
      estimatedComplexity?: TaskComplexity;
      dependencies?: string[];
    };
  }>("/api/board/tasks/:id", async (request, reply) => {
    const task = boardManager.updateTask(request.params.id, request.body);
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return task;
  });

  // PUT /api/board/tasks/:id/status
  fastify.put<{
    Params: { id: string };
    Body: { status: TaskStatus };
  }>("/api/board/tasks/:id/status", async (request, reply) => {
    const task = boardManager.updateTaskStatus(request.params.id, request.body.status);
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return task;
  });

  // DELETE /api/board/tasks/:id
  fastify.delete<{ Params: { id: string } }>("/api/board/tasks/:id", async (request, reply) => {
    const ok = boardManager.deleteTask(request.params.id);
    if (!ok) return reply.code(404).send({ error: "Task not found" });
    return { ok: true };
  });

  // GET /api/board/tasks/ready — tasks with all deps satisfied
  fastify.get("/api/board/tasks/ready", async () => {
    return { tasks: boardManager.getReadyTasks() };
  });

  // ─── Sprints ─────────────────────────────────────────

  // GET /api/board/sprints
  fastify.get("/api/board/sprints", async () => {
    return { sprints: boardManager.listSprints() };
  });

  // GET /api/board/sprints/:id
  fastify.get<{ Params: { id: string } }>("/api/board/sprints/:id", async (request, reply) => {
    const sprint = boardManager.getSprint(request.params.id);
    if (!sprint) return reply.code(404).send({ error: "Sprint not found" });
    return sprint;
  });

  // POST /api/board/sprints
  fastify.post<{
    Body: { name: string; taskIds?: string[] };
  }>("/api/board/sprints", async (request) => {
    return boardManager.createSprint(request.body);
  });

  // PUT /api/board/sprints/:id
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; status?: SprintStatus; taskIds?: string[] };
  }>("/api/board/sprints/:id", async (request, reply) => {
    const sprint = boardManager.updateSprint(request.params.id, request.body);
    if (!sprint) return reply.code(404).send({ error: "Sprint not found" });
    return sprint;
  });

  // PUT /api/board/sprints/:id/tasks/:taskId — add task to sprint
  fastify.put<{
    Params: { id: string; taskId: string };
  }>("/api/board/sprints/:id/tasks/:taskId", async (request, reply) => {
    const ok = boardManager.addTaskToSprint(request.params.id, request.params.taskId);
    if (!ok) return reply.code(400).send({ error: "Could not add task to sprint" });
    return { ok: true };
  });

  // DELETE /api/board/sprints/:id/tasks/:taskId — remove task from sprint
  fastify.delete<{
    Params: { id: string; taskId: string };
  }>("/api/board/sprints/:id/tasks/:taskId", async (request, reply) => {
    const ok = boardManager.removeTaskFromSprint(request.params.id, request.params.taskId);
    if (!ok) return reply.code(400).send({ error: "Could not remove task from sprint" });
    return { ok: true };
  });

  // DELETE /api/board/sprints/:id
  fastify.delete<{ Params: { id: string } }>("/api/board/sprints/:id", async (request, reply) => {
    const ok = boardManager.deleteSprint(request.params.id);
    if (!ok) return reply.code(404).send({ error: "Sprint not found" });
    return { ok: true };
  });

  // POST /api/board/plan — run planning orchestrator to decompose specs into tasks
  fastify.post("/api/board/plan", async (_request, reply) => {
    if (!options.softieDir.exists) {
      return reply.code(404).send({ error: "No project found" });
    }

    const logger = new Logger(options.softieDir.root);

    // Run async in background
    (async () => {
      try {
        await runPlanningOrchestrator(options.softieDir, logger);
      } catch (err) {
        logger.error("planning", err instanceof Error ? err.message : String(err));
      }
    })();

    return { started: true };
  });

  // POST /api/board/sprints/:id/review — run sprint review
  fastify.post<{ Params: { id: string } }>("/api/board/sprints/:id/review", async (request, reply) => {
    if (!options.softieDir.exists) {
      return reply.code(404).send({ error: "No project found" });
    }

    const logger = new Logger(options.softieDir.root);

    // Run async in background
    (async () => {
      try {
        const result = await runSprintReview(options.softieDir, logger, request.params.id);
        logger.info("sprint-review-result", `Sprint ${request.params.id}: ${result.approved ? "approved" : "needs changes"}`);
      } catch (err) {
        logger.error("sprint-review", err instanceof Error ? err.message : String(err));
      }
    })();

    return { started: true };
  });
}
