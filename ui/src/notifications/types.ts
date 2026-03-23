import type { ViewId } from "../types.ts";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationAction {
  viewId: ViewId;
  itemId?: string;
  itemType?: "task" | "spec" | "phase";
}

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  severity: NotificationSeverity;
  read: boolean;
  timestamp: string;
  sourceEventType: string;
  action?: NotificationAction;
}
