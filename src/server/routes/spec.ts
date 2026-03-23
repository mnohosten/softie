import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";
import { SpecManager } from "../../spec/spec-manager.js";
import { generateSpec } from "../../spec/spec-orchestrator.js";
import { replanFromSpecChanges } from "../../agent/sprint-review.js";
import { Logger } from "../../utils/logger.js";
import type { SpecType, SpecStatus } from "../../project/state.js";

export async function specRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir }
): Promise<void> {
  const specManager = new SpecManager(options.softieDir);

  // GET /api/specs — list all specs
  fastify.get("/api/specs", async () => {
    return { specs: specManager.list() };
  });

  // GET /api/specs/:id — get spec metadata
  fastify.get<{ Params: { id: string } }>("/api/specs/:id", async (request, reply) => {
    const spec = specManager.get(request.params.id);
    if (!spec) return reply.code(404).send({ error: "Spec not found" });
    return spec;
  });

  // GET /api/specs/:id/content — get spec markdown content
  fastify.get<{ Params: { id: string } }>("/api/specs/:id/content", async (request, reply) => {
    const content = specManager.getContent(request.params.id);
    if (content === null) return reply.code(404).send({ error: "Spec not found" });
    return { content };
  });

  // POST /api/specs — create a new spec
  fastify.post<{
    Body: { title: string; type: SpecType; content?: string };
  }>("/api/specs", async (request) => {
    const { title, type, content } = request.body;
    const spec = specManager.create({ title, type, content });
    return spec;
  });

  // PUT /api/specs/:id — update spec metadata
  fastify.put<{
    Params: { id: string };
    Body: { title?: string; status?: SpecStatus };
  }>("/api/specs/:id", async (request, reply) => {
    const updates: Record<string, unknown> = {};
    if (request.body.title) updates.title = request.body.title;
    if (request.body.status) updates.status = request.body.status;

    const spec = specManager.update(request.params.id, updates as any);
    if (!spec) return reply.code(404).send({ error: "Spec not found" });
    return spec;
  });

  // PUT /api/specs/:id/content — update spec content
  fastify.put<{
    Params: { id: string };
    Body: { content: string };
  }>("/api/specs/:id/content", async (request, reply) => {
    const ok = specManager.updateContent(request.params.id, request.body.content);
    if (!ok) return reply.code(404).send({ error: "Spec not found" });
    return { ok: true };
  });

  // DELETE /api/specs/:id
  fastify.delete<{ Params: { id: string } }>("/api/specs/:id", async (request, reply) => {
    const ok = specManager.delete(request.params.id);
    if (!ok) return reply.code(404).send({ error: "Spec not found" });
    return { ok: true };
  });

  // POST /api/specs/generate — AI-generate a spec from prompt
  fastify.post<{
    Body: { type: SpecType; prompt: string };
  }>("/api/specs/generate", async (request, reply) => {
    const { type, prompt } = request.body;
    if (!type || !prompt) {
      return reply.code(400).send({ error: "type and prompt are required" });
    }

    const logger = new Logger(options.softieDir.root);

    // Run async in background
    (async () => {
      try {
        await generateSpec(options.softieDir, logger, type, prompt);
      } catch (err) {
        logger.error("spec-generate", err instanceof Error ? err.message : String(err));
      }
    })();

    return { started: true };
  });

  // POST /api/specs/:id/replan — cascade spec changes to affected tasks
  fastify.post<{ Params: { id: string } }>("/api/specs/:id/replan", async (request, reply) => {
    const spec = specManager.get(request.params.id);
    if (!spec) return reply.code(404).send({ error: "Spec not found" });

    const logger = new Logger(options.softieDir.root);

    (async () => {
      try {
        await replanFromSpecChanges(options.softieDir, logger, request.params.id);
      } catch (err) {
        logger.error("replan", err instanceof Error ? err.message : String(err));
      }
    })();

    return { started: true };
  });
}
