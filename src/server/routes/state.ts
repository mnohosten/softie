import type { FastifyInstance } from "fastify";
import type { SoftieDir } from "../../project/softie-dir.js";

export async function stateRoutes(
  fastify: FastifyInstance,
  options: { softieDir: SoftieDir }
): Promise<void> {
  const { softieDir } = options;

  // GET /api/state — full project state
  fastify.get("/api/state", async (_request, reply) => {
    if (!softieDir.exists) {
      return reply.code(404).send({ error: "No .softie/ directory found" });
    }

    const metadata = softieDir.getMetadata();
    const team = softieDir.getTeam();
    const plan = softieDir.getPlan();
    const progress = softieDir.getProgress();
    const tasks = softieDir.getTasks();
    const approvalState = softieDir.getApprovalState();
    const specs = softieDir.getSpecs();
    const boardTasks = softieDir.getBoardTasks();
    const sprints = softieDir.getSprints();

    return {
      metadata,
      team,
      plan,
      progress,
      tasks,
      approvalState,
      specs,
      boardTasks,
      sprints,
      exists: true,
    };
  });
}
