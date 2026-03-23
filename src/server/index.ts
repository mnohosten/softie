import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import staticPlugin from "@fastify/static";
import cors from "@fastify/cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SoftieDir } from "../project/softie-dir.js";
import { WsHub } from "./ws-hub.js";
import { setupFileWatcher } from "./file-watcher.js";
import { stateRoutes } from "./routes/state.js";
import { filesRoutes } from "./routes/files.js";
import { tasksRoutes } from "./routes/tasks.js";
import { chatRoutes } from "./routes/chat.js";
import { projectRoutes } from "./routes/project.js";
import { specRoutes } from "./routes/spec.js";
import { boardRoutes } from "./routes/board.js";
import { Logger } from "../utils/logger.js";
import { runMetaOrchestrator } from "../meta/meta-orchestrator.js";
import { validateAndIndexTeam } from "../meta/team-generator.js";
import { runProjectOrchestrator } from "../orchestrator/orchestrator.js";
import { updateMilestoneStatus } from "../orchestrator/milestone.js";
import { resolveUiAnswer } from "./milestone-bridge.js";
import { eventBus } from "../core/event-bus.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function startServer(options: {
  projectDir: string;
  port: number;
  isDev: boolean;
  uiDistPath?: string;
  autoResume?: boolean;
}): Promise<void> {
  const softieDir = new SoftieDir(options.projectDir);
  const wsHub = new WsHub();

  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocketPlugin);

  // Serve static UI in production
  if (!options.isDev) {
    const uiDistPath = options.uiDistPath ?? join(__dirname, "..", "..", "ui", "dist");
    await fastify.register(staticPlugin, {
      root: uiDistPath,
      prefix: "/",
    });
    // SPA fallback
    fastify.setNotFoundHandler(async (_request, reply) => {
      return reply.sendFile("index.html");
    });
  }

  // WebSocket endpoint
  fastify.get("/ws", { websocket: true }, (socket) => {
    wsHub.addClient(socket);
    socket.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));

    socket.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        handleClientMessage(msg, softieDir, wsHub);
      } catch {
        // ignore malformed messages
      }
    });
  });

  // REST routes
  await fastify.register(stateRoutes, { softieDir });
  await fastify.register(filesRoutes, { softieDir });
  await fastify.register(tasksRoutes, { softieDir, wsHub });
  await fastify.register(chatRoutes, {
    softieDir,
    wsHub,
    projectDir: options.projectDir,
  });
  await fastify.register(projectRoutes, { softieDir, wsHub });
  await fastify.register(specRoutes, { softieDir });
  await fastify.register(boardRoutes, { softieDir });

  // Start file watcher if project exists
  if (softieDir.exists) {
    setupFileWatcher(softieDir.root);
  }

  await fastify.listen({ port: options.port, host: "0.0.0.0" });
  console.log(`\n  Softie Dashboard → http://localhost:${options.port}\n`);

  if (options.autoResume && softieDir.exists) {
    const metadata = softieDir.getMetadata();
    if (metadata) {
      const { status } = metadata;
      const logger = new Logger(softieDir.root);

      if (status === "analyzing" || status === "initializing") {
        console.log(`  Auto-resuming project from '${status}' state...\n`);
        (async () => {
          try {
            await runMetaOrchestrator(metadata.intent, softieDir, logger);
            const { plan } = await validateAndIndexTeam(softieDir, logger);
            const m0 = plan.milestones.find((m) => m.id === "m0");
            if (m0) updateMilestoneStatus(softieDir, "m0", "completed");
            eventBus.emit_event({ type: "project:status", status: "team-review", timestamp: new Date().toISOString() });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error("auto-resume", message);
            eventBus.emit_event({ type: "project:status", status: "failed", timestamp: new Date().toISOString() });
          }
        })();
      } else if (status === "executing" || status === "milestone-review") {
        console.log(`  Auto-resuming project from '${status}' state...\n`);
        (async () => {
          try {
            const { agents, plan } = await validateAndIndexTeam(softieDir, logger);
            const remainingPlan = {
              ...plan,
              phases: plan.phases.filter((p) => p.status === "pending" || p.status === "active"),
            };
            await runProjectOrchestrator(softieDir, agents, remainingPlan, logger, wsHub);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error("auto-resume", message);
            eventBus.emit_event({ type: "project:status", status: "failed", timestamp: new Date().toISOString() });
          }
        })();
      }
    }
  }
}

function handleClientMessage(
  msg: Record<string, unknown>,
  softieDir: SoftieDir,
  _wsHub: WsHub
): void {
  switch (msg.type) {
    case "task:approve": {
      const taskId = msg.taskId as string;
      if (!taskId) return;
      const tasks = softieDir.getTasks();
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx] = {
          ...tasks[idx],
          status: "approved",
          updatedAt: new Date().toISOString(),
        };
        softieDir.writeTasks(tasks);
      }
      break;
    }
    case "task:reject": {
      const taskId = msg.taskId as string;
      const reason = msg.reason as string | undefined;
      if (!taskId) return;
      const tasks = softieDir.getTasks();
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        tasks[idx] = {
          ...tasks[idx],
          status: "rejected",
          rejectionReason: reason,
          updatedAt: new Date().toISOString(),
        };
        softieDir.writeTasks(tasks);
      }
      break;
    }
    case "approval:mode": {
      const mode = msg.mode as string;
      if (mode) {
        const current = softieDir.getApprovalState();
        softieDir.writeApprovalState({
          ...current,
          mode: mode as "granular" | "phase" | "brave",
        });
      }
      break;
    }
    case "milestone:answer": {
      const answer = msg.answer as string;
      if (answer) resolveUiAnswer(answer);
      break;
    }
  }
}
