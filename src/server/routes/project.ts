import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";
import type { WsHub } from "../ws-hub.js";
import { Logger } from "../../utils/logger.js";
import { runMetaOrchestrator } from "../../meta/meta-orchestrator.js";
import { validateAndIndexTeam } from "../../meta/team-generator.js";
import { runProjectOrchestrator } from "../../orchestrator/orchestrator.js";
import { updateMilestoneStatus } from "../../orchestrator/milestone.js";
import { eventBus } from "../../core/event-bus.js";

interface StartBody {
  intent: string;
  preferences?: string;
}

export async function projectRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir; wsHub: WsHub }
): Promise<void> {
  const { softieDir, wsHub } = options;

  // POST /api/project/start — initialize and begin meta-analysis
  fastify.post<{ Body: StartBody }>("/api/project/start", async (request, reply) => {
    if (softieDir.exists) {
      return reply.code(409).send({ error: "Project already exists. Delete .softie/ to start fresh." });
    }

    const { intent, preferences } = request.body;
    if (!intent?.trim()) {
      return reply.code(400).send({ error: "intent is required" });
    }

    // Initialize the .softie/ directory synchronously
    const metadata = softieDir.init(intent.trim(), preferences);
    const logger = new Logger(softieDir.root);

    // Emit project status update
    eventBus.emit_event({
      type: "project:status",
      status: "initializing",
      timestamp: new Date().toISOString(),
    });

    // Run the full orchestration pipeline async in background
    (async () => {
      try {
        await runMetaOrchestrator(intent.trim(), softieDir, logger, preferences);

        const { plan } = await validateAndIndexTeam(softieDir, logger);

        // Auto-handle milestone m0 in UI context (no terminal prompt)
        const m0 = plan.milestones.find((m) => m.id === "m0");
        if (m0) {
          updateMilestoneStatus(softieDir, "m0", "completed");
        }

        eventBus.emit_event({
          type: "project:status",
          status: "team-review",
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("ui-project-start", message);
        eventBus.emit_event({
          type: "project:status",
          status: "failed",
          timestamp: new Date().toISOString(),
        });
      }
    })();

    return { started: true, projectId: metadata.id };
  });

  // POST /api/project/execute — run the project orchestrator (after team review)
  fastify.post("/api/project/execute", async (request, reply) => {
    if (!softieDir.exists) {
      return reply.code(404).send({ error: "No project found" });
    }

    const metadata = softieDir.getMetadata();
    if (!metadata) return reply.code(404).send({ error: "No project metadata" });

    const resumableStatuses = ["team-review", "paused", "milestone-review", "failed"];
    if (!resumableStatuses.includes(metadata.status)) {
      return reply.code(409).send({
        error: `Cannot execute from status: ${metadata.status}`,
      });
    }

    const logger = new Logger(softieDir.root);
    const { agents, plan } = await validateAndIndexTeam(softieDir, logger);

    const remainingPlan = {
      ...plan,
      phases: plan.phases.filter(
        (p) => p.status === "pending" || p.status === "active"
      ),
    };

    // Run async
    (async () => {
      try {
        await runProjectOrchestrator(softieDir, agents, remainingPlan, logger, wsHub);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("ui-project-execute", message);
        eventBus.emit_event({
          type: "project:status",
          status: "failed",
          timestamp: new Date().toISOString(),
        });
      }
    })();

    return { started: true };
  });

  // DELETE /api/project — reset project (delete .softie/)
  fastify.delete("/api/project", async (request, reply) => {
    if (!softieDir.exists) {
      return reply.code(404).send({ error: "No project found" });
    }

    const { rmSync } = await import("node:fs");
    rmSync(softieDir.root, { recursive: true, force: true });

    eventBus.emit_event({
      type: "project:status",
      status: "initializing",
      timestamp: new Date().toISOString(),
    });

    return { deleted: true };
  });
}
