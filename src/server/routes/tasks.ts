import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";
import type { WsHub } from "../ws-hub.js";
import type { ApprovalMode } from "../../project/state.js";

interface RejectBody {
  reason?: string;
}

interface ApprovalModeBody {
  mode?: ApprovalMode;
  braveMode?: boolean;
}

export async function tasksRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir; wsHub: WsHub }
): Promise<void> {
  const { softieDir } = options;

  // GET /api/tasks — list all tasks
  fastify.get("/api/tasks", async (_request, _reply) => {
    return softieDir.getTasks();
  });

  // GET /api/tasks/:id — get a task
  fastify.get<{ Params: { id: string } }>("/api/tasks/:id", async (request, reply) => {
    const tasks = softieDir.getTasks();
    const task = tasks.find((t) => t.id === request.params.id);
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return task;
  });

  // PUT /api/tasks/:id/approve — approve a task
  fastify.put<{ Params: { id: string }; Body: { comment?: string } }>(
    "/api/tasks/:id/approve",
    async (request, reply) => {
      const tasks = softieDir.getTasks();
      const idx = tasks.findIndex((t) => t.id === request.params.id);
      if (idx === -1) return reply.code(404).send({ error: "Task not found" });

      tasks[idx] = {
        ...tasks[idx],
        status: "approved",
        reviewComment: request.body?.comment,
        updatedAt: new Date().toISOString(),
      };
      softieDir.writeTasks(tasks);
      return tasks[idx];
    }
  );

  // PUT /api/tasks/:id/reject — reject a task
  fastify.put<{ Params: { id: string }; Body: RejectBody }>(
    "/api/tasks/:id/reject",
    async (request, reply) => {
      const tasks = softieDir.getTasks();
      const idx = tasks.findIndex((t) => t.id === request.params.id);
      if (idx === -1) return reply.code(404).send({ error: "Task not found" });

      tasks[idx] = {
        ...tasks[idx],
        status: "rejected",
        rejectionReason: request.body?.reason,
        updatedAt: new Date().toISOString(),
      };
      softieDir.writeTasks(tasks);
      return tasks[idx];
    }
  );

  // PUT /api/tasks/approve-phase/:phaseId — approve all tasks in a phase
  fastify.put<{ Params: { phaseId: string } }>(
    "/api/tasks/approve-phase/:phaseId",
    async (request, _reply) => {
      const tasks = softieDir.getTasks();
      const now = new Date().toISOString();
      const updated = tasks.map((t) =>
        t.phaseId === request.params.phaseId &&
        (t.status === "draft" || t.status === "pending-review")
          ? { ...t, status: "approved" as const, updatedAt: now }
          : t
      );
      softieDir.writeTasks(updated);
      return updated;
    }
  );

  // PUT /api/tasks/approve-all — approve all pending tasks (brave mode)
  fastify.put("/api/tasks/approve-all", async (_request, _reply) => {
    const tasks = softieDir.getTasks();
    const now = new Date().toISOString();
    const updated = tasks.map((t) =>
      t.status === "draft" || t.status === "pending-review"
        ? { ...t, status: "approved" as const, updatedAt: now }
        : t
    );
    softieDir.writeTasks(updated);
    return updated;
  });

  // GET /api/approval — get approval state
  fastify.get("/api/approval", async (_request, _reply) => {
    return softieDir.getApprovalState();
  });

  // PUT /api/approval — update approval mode
  fastify.put<{ Body: ApprovalModeBody }>("/api/approval", async (request, _reply) => {
    const current = softieDir.getApprovalState();
    const updated = {
      ...current,
      ...(request.body.mode !== undefined ? { mode: request.body.mode } : {}),
      ...(request.body.braveMode !== undefined ? { braveMode: request.body.braveMode } : {}),
    };
    softieDir.writeApprovalState(updated);
    return updated;
  });
}
