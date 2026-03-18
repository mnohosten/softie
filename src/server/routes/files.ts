import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";

interface FileQuery {
  path?: string;
  dir?: string;
}

interface FilePutBody {
  content?: string;
}

export async function filesRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir }
): Promise<void> {
  const { softieDir } = options;

  // GET /api/file?path=... — read a file
  fastify.get<{ Querystring: FileQuery }>("/api/file", async (request, reply) => {
    const { path } = request.query;
    if (!path) return reply.code(400).send({ error: "path required" });

    const content = softieDir.readFile(path);
    if (content === null) return reply.code(404).send({ error: "File not found" });

    return { path, content };
  });

  // PUT /api/file?path=... — write a file
  fastify.put<{ Querystring: FileQuery; Body: FilePutBody }>(
    "/api/file",
    async (request, reply) => {
      const { path } = request.query;
      if (!path) return reply.code(400).send({ error: "path required" });

      const { content } = request.body || {};
      if (content === undefined) return reply.code(400).send({ error: "content required" });

      // Security: only allow writes within .softie/
      if (path.includes("..") || path.startsWith("/")) {
        return reply.code(403).send({ error: "Invalid path" });
      }

      softieDir.writeFile(path, content);
      return { path, saved: true };
    }
  );

  // GET /api/files?dir=... — list directory
  fastify.get<{ Querystring: { dir?: string } }>("/api/files", async (request, _reply) => {
    const dir = request.query.dir || "";
    const files = softieDir.listFiles(dir);
    return { dir, files };
  });

  // GET /api/snapshot?path=... — get snapshot (approved version)
  fastify.get<{ Querystring: FileQuery }>("/api/snapshot", async (request, reply) => {
    const { path } = request.query;
    if (!path) return reply.code(400).send({ error: "path required" });

    const content = softieDir.getSnapshot(path);
    if (content === null) return reply.code(404).send({ error: "No snapshot found" });

    return { path, content };
  });

  // POST /api/snapshot?path=... — save current version as snapshot
  fastify.post<{ Querystring: FileQuery }>("/api/snapshot", async (request, reply) => {
    const { path } = request.query;
    if (!path) return reply.code(400).send({ error: "path required" });

    const content = softieDir.readFile(path);
    if (content === null) return reply.code(404).send({ error: "File not found" });

    softieDir.saveSnapshot(path, content);
    return { path, saved: true };
  });
}
