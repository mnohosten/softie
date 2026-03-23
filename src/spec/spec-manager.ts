import { randomUUID } from "node:crypto";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Spec, SpecType, SpecStatus, SpecSection } from "../project/state.js";
import { eventBus } from "../core/event-bus.js";

export class SpecManager {
  constructor(private softieDir: SoftieDir) {}

  list(): Spec[] {
    return this.softieDir.getSpecs();
  }

  get(id: string): Spec | null {
    return this.softieDir.getSpec(id);
  }

  create(data: {
    title: string;
    type: SpecType;
    content?: string;
    sections?: SpecSection[];
  }): Spec {
    const now = new Date().toISOString();
    const id = randomUUID().slice(0, 8);
    const fileName = `${data.type}-${id}.md`;

    const spec: Spec = {
      id,
      title: data.title,
      type: data.type,
      status: "draft",
      sections: data.sections || [],
      filePath: fileName,
      linkedTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };

    // Write spec content file
    const content = data.content || this.generateTemplate(data.title, data.type);
    this.softieDir.writeSpecContent(fileName, content);

    // Update index
    const specs = this.softieDir.getSpecs();
    specs.push(spec);
    this.softieDir.writeSpecs(specs);

    eventBus.emit_event({
      type: "file:changed",
      path: `specs/${fileName}`,
      timestamp: now,
    });

    return spec;
  }

  update(id: string, updates: Partial<Pick<Spec, "title" | "status" | "sections" | "linkedTaskIds">>): Spec | null {
    const specs = this.softieDir.getSpecs();
    const idx = specs.findIndex((s) => s.id === id);
    if (idx < 0) return null;

    const now = new Date().toISOString();
    specs[idx] = {
      ...specs[idx],
      ...updates,
      updatedAt: now,
    };
    this.softieDir.writeSpecs(specs);
    return specs[idx];
  }

  updateContent(id: string, content: string): boolean {
    const spec = this.get(id);
    if (!spec) return false;

    this.softieDir.writeSpecContent(spec.filePath, content);
    this.update(id, {}); // Touch updatedAt

    eventBus.emit_event({
      type: "file:changed",
      path: `specs/${spec.filePath}`,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  getContent(id: string): string | null {
    const spec = this.get(id);
    if (!spec) return null;
    return this.softieDir.readSpecContent(spec.filePath);
  }

  updateStatus(id: string, status: SpecStatus): Spec | null {
    return this.update(id, { status });
  }

  delete(id: string): boolean {
    const specs = this.softieDir.getSpecs();
    const idx = specs.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    specs.splice(idx, 1);
    this.softieDir.writeSpecs(specs);
    return true;
  }

  linkTask(specId: string, taskId: string): void {
    const spec = this.get(specId);
    if (!spec) return;
    if (!spec.linkedTaskIds.includes(taskId)) {
      this.update(specId, {
        linkedTaskIds: [...spec.linkedTaskIds, taskId],
      });
    }
  }

  private generateTemplate(title: string, type: SpecType): string {
    const templates: Record<SpecType, string> = {
      product: `# ${title}\n\n## Overview\n\n## User Stories\n\n## Acceptance Criteria\n\n## Out of Scope\n`,
      technical: `# ${title}\n\n## Overview\n\n## Architecture\n\n## Data Model\n\n## API Design\n\n## Technical Constraints\n`,
      architecture: `# ${title}\n\n## System Overview\n\n## Components\n\n## Data Flow\n\n## Technology Choices\n\n## Trade-offs\n`,
      api: `# ${title}\n\n## Base URL\n\n## Authentication\n\n## Endpoints\n\n## Error Handling\n\n## Rate Limiting\n`,
      ui: `# ${title}\n\n## Screens\n\n## Navigation Flow\n\n## Component Hierarchy\n\n## Responsive Behavior\n`,
    };
    return templates[type];
  }
}
