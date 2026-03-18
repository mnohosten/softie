import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";
import type { WsHub } from "../ws-hub.js";
import { createThread, sendMessage } from "../chat-manager.js";

interface StartChatBody {
  targetType: "task" | "phase" | "agent" | "project";
  targetId: string;
}

interface SendMessageBody {
  message: string;
}

export async function chatRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir; wsHub: WsHub; projectDir: string }
): Promise<void> {
  const { softieDir, projectDir } = options;

  // POST /api/chat — create a new chat thread
  fastify.post<{ Body: StartChatBody }>("/api/chat", async (request, reply) => {
    if (!softieDir.exists) {
      return reply.code(404).send({ error: "No .softie/ directory found" });
    }
    const { targetType, targetId } = request.body;
    if (!targetType || !targetId) {
      return reply.code(400).send({ error: "targetType and targetId required" });
    }

    const threadId = createThread({
      targetType,
      targetId,
      projectDir,
      softieDirPath: softieDir.root,
    });

    return { threadId };
  });

  // POST /api/chat/:threadId — send a message to a thread
  // The response streams via WebSocket; this just kicks off the query
  fastify.post<{ Params: { threadId: string }; Body: SendMessageBody }>(
    "/api/chat/:threadId",
    async (request, reply) => {
      const { threadId } = request.params;
      const { message } = request.body;

      if (!message) return reply.code(400).send({ error: "message required" });

      // Start async — response streams via WS events
      sendMessage({ threadId, message }).catch(console.error);

      return { threadId, started: true };
    }
  );
}
