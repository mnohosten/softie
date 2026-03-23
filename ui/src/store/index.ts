import { create } from "zustand";
import type {
  ProjectMetadata,
  Team,
  PhasePlan,
  Progress,
  TaskApproval,
  ApprovalState,
  Tab,
  ChatThread,
  Activity,
  SelectedItem,
  SoftieEvent,
  ViewId,
  Spec,
  BoardTask,
  Sprint,
} from "../types.ts";
import { randomId } from "../utils.ts";
import type { AppNotification } from "../notifications/types.ts";

interface SoftieStore {
  // Project data
  metadata: ProjectMetadata | null;
  team: Team | null;
  plan: PhasePlan | null;
  progress: Progress | null;
  tasks: TaskApproval[];
  approvalState: ApprovalState;
  projectExists: boolean;

  // v2 data
  specs: Spec[];
  boardTasks: BoardTask[];
  sprints: Sprint[];

  // UI state
  activeView: ViewId;
  openTabs: Tab[];
  activeTabId: string | null;
  selectedItem: SelectedItem | null;
  contextPanelOpen: boolean;
  sidebarWidth: number;
  contextPanelWidth: number;

  // Chat
  chatThreads: Record<string, ChatThread>;
  activeThreadId: string | null;

  // Activity feed
  activities: Activity[];
  isRunning: boolean;
  currentActivity: Activity | null;
  fileVersion: number;

  // Connection
  wsConnected: boolean;
  totalCost: number;

  // Milestone review
  milestoneQuestion: string | null;

  // Notifications
  notifications: AppNotification[];

  // Actions — project data
  setProjectState: (data: {
    metadata?: ProjectMetadata | null;
    team?: Team | null;
    plan?: PhasePlan | null;
    progress?: Progress | null;
    tasks?: TaskApproval[];
    approvalState?: ApprovalState;
    specs?: Spec[];
    boardTasks?: BoardTask[];
    sprints?: Sprint[];
    exists?: boolean;
  }) => void;

  // Actions — view
  setActiveView: (view: ViewId) => void;

  // Actions — tabs
  openTab: (tab: Omit<Tab, "id">) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabClean: (id: string) => void;

  // Actions — UI
  setSelectedItem: (item: SelectedItem | null) => void;
  toggleContextPanel: () => void;

  // Actions — chat
  startThread: (targetType: ChatThread["targetType"], targetId: string, threadId?: string) => string;
  appendChatDelta: (threadId: string, content: string) => void;
  finishChatStream: (threadId: string) => void;
  addChatUserMessage: (threadId: string, content: string) => void;
  setActiveThread: (threadId: string | null) => void;

  // Actions — activity
  addActivity: (event: SoftieEvent) => void;

  // Actions — WS
  setWsConnected: (connected: boolean) => void;
  setMilestoneQuestion: (question: string | null) => void;

  // Actions — notifications
  addNotification: (notification: AppNotification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  dismissNotification: (id: string) => void;

  // Actions — tasks
  setTasks: (tasks: TaskApproval[]) => void;
  approveTask: (taskId: string) => void;
  rejectTask: (taskId: string, reason?: string) => void;
  setApprovalMode: (mode: ApprovalState["mode"]) => void;
  setBraveMode: (braveMode: boolean) => void;
}

export const useSoftieStore = create<SoftieStore>((set, get) => ({
  // Initial state
  metadata: null,
  team: null,
  plan: null,
  progress: null,
  tasks: [],
  approvalState: { mode: "granular", braveMode: false },
  projectExists: false,

  // v2 data
  specs: [],
  boardTasks: [],
  sprints: [],

  // UI state
  activeView: "dashboard" as ViewId,
  openTabs: [],
  activeTabId: null,
  selectedItem: null,
  contextPanelOpen: true,
  sidebarWidth: 240,
  contextPanelWidth: 350,

  chatThreads: {},
  activeThreadId: null,

  activities: [],
  isRunning: false,
  currentActivity: null,
  fileVersion: 0,
  wsConnected: false,
  totalCost: 0,
  milestoneQuestion: null,
  notifications: [],

  setProjectState: (data) =>
    set((state) => ({
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      ...(data.team !== undefined ? { team: data.team } : {}),
      ...(data.plan !== undefined ? { plan: data.plan } : {}),
      ...(data.progress !== undefined ? { progress: data.progress } : {}),
      ...(data.tasks !== undefined ? { tasks: data.tasks } : {}),
      ...(data.approvalState !== undefined ? { approvalState: data.approvalState } : {}),
      ...(data.specs !== undefined ? { specs: data.specs } : {}),
      ...(data.boardTasks !== undefined ? { boardTasks: data.boardTasks } : {}),
      ...(data.sprints !== undefined ? { sprints: data.sprints } : {}),
      ...(data.exists !== undefined ? { projectExists: data.exists } : {}),
      totalCost: data.progress?.totalCostUsd ?? state.totalCost,
    })),

  setActiveView: (view) => set({ activeView: view }),

  openTab: (tabData) =>
    set((state) => {
      // Check if tab for this file is already open
      const existing = state.openTabs.find(
        (t) => t.filePath === tabData.filePath && t.type === tabData.type
      );
      if (existing) return { activeTabId: existing.id };
      const newTab: Tab = { ...tabData, id: randomId() };
      return {
        openTabs: [...state.openTabs, newTab],
        activeTabId: newTab.id,
      };
    }),

  closeTab: (id) =>
    set((state) => {
      const remaining = state.openTabs.filter((t) => t.id !== id);
      let activeTabId = state.activeTabId;
      if (activeTabId === id) {
        const idx = state.openTabs.findIndex((t) => t.id === id);
        activeTabId = remaining[Math.max(0, idx - 1)]?.id ?? null;
      }
      return { openTabs: remaining, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabContent: (id, content) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === id ? { ...t, content, isDirty: true } : t
      ),
    })),

  markTabClean: (id) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === id ? { ...t, isDirty: false } : t
      ),
    })),

  setSelectedItem: (item) => set({ selectedItem: item }),
  toggleContextPanel: () =>
    set((state) => ({ contextPanelOpen: !state.contextPanelOpen })),

  startThread: (targetType, targetId, threadId?: string) => {
    const id = threadId || randomId();
    set((state) => ({
      chatThreads: {
        ...state.chatThreads,
        [id]: {
          id,
          targetType,
          targetId,
          messages: [],
          isStreaming: false,
          streamBuffer: "",
        },
      },
      activeThreadId: id,
    }));
    return id;
  },

  addChatUserMessage: (threadId, content) =>
    set((state) => {
      const thread = state.chatThreads[threadId];
      if (!thread) return {};
      return {
        chatThreads: {
          ...state.chatThreads,
          [threadId]: {
            ...thread,
            messages: [
              ...thread.messages,
              { id: randomId(), role: "user", content, timestamp: new Date().toISOString() },
            ],
            isStreaming: true,
            streamBuffer: "",
          },
        },
      };
    }),

  appendChatDelta: (threadId, content) =>
    set((state) => {
      const thread = state.chatThreads[threadId];
      if (!thread) return {};
      return {
        chatThreads: {
          ...state.chatThreads,
          [threadId]: {
            ...thread,
            isStreaming: true,
            streamBuffer: thread.streamBuffer + content,
          },
        },
      };
    }),

  finishChatStream: (threadId) =>
    set((state) => {
      const thread = state.chatThreads[threadId];
      if (!thread) return {};
      const finalMessages = thread.streamBuffer
        ? [
            ...thread.messages,
            {
              id: randomId(),
              role: "assistant" as const,
              content: thread.streamBuffer,
              timestamp: new Date().toISOString(),
            },
          ]
        : thread.messages;
      return {
        chatThreads: {
          ...state.chatThreads,
          [threadId]: {
            ...thread,
            messages: finalMessages,
            isStreaming: false,
            streamBuffer: "",
          },
        },
      };
    }),

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),

  addActivity: (event) =>
    set((state) => {
      const message = eventToMessage(event);
      if (!message) return {};
      const activity: Activity = {
        id: randomId(),
        type: event.type,
        message,
        timestamp: event.timestamp,
        meta: event as unknown as Record<string, unknown>,
      };
      const activities = [activity, ...state.activities].slice(0, 200);

      let isRunning = state.isRunning;
      if (
        event.type === "phase:started" ||
        (event.type === "project:status" &&
          (event.status === "analyzing" || event.status === "executing"))
      ) {
        isRunning = true;
      } else if (
        event.type === "phase:completed" ||
        event.type === "phase:failed" ||
        (event.type === "project:status" &&
          (event.status === "completed" ||
            event.status === "failed" ||
            event.status === "team-review"))
      ) {
        isRunning = false;
      }

      const fileVersion = event.type === "file:changed" ? state.fileVersion + 1 : state.fileVersion;
      const milestoneQuestion =
        event.type === "project:status" && event.status !== "milestone-review"
          ? null
          : state.milestoneQuestion;
      return { activities, isRunning, currentActivity: activity, fileVersion, milestoneQuestion };
    }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setWsConnected: (connected) => set({ wsConnected: connected }),

  setMilestoneQuestion: (question) => set({ milestoneQuestion: question }),

  setTasks: (tasks) => set({ tasks }),

  approveTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: "approved" as const, updatedAt: new Date().toISOString() }
          : t
      ),
    })),

  rejectTask: (taskId, reason) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: "rejected" as const,
              rejectionReason: reason,
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    })),

  setApprovalMode: (mode) =>
    set((state) => ({
      approvalState: { ...state.approvalState, mode },
    })),

  setBraveMode: (braveMode) =>
    set((state) => ({
      approvalState: { ...state.approvalState, braveMode },
    })),
}));

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function eventToMessage(event: SoftieEvent): string | null {
  switch (event.type) {
    case "agent:activity":
      return `[${event.agentName}] ${stripAnsi(event.action)}`;
    case "phase:started":
      return `Phase started: ${stripAnsi(event.phaseName)}`;
    case "phase:completed":
      return `Phase complete: ${stripAnsi(event.phaseName)} ($${event.cost.toFixed(4)})`;
    case "phase:failed":
      return `Phase failed: ${stripAnsi(event.phaseName)}`;
    case "parallel:launch":
      return `Parallel launch: ${event.agentNames.map(stripAnsi).join(", ")}`;
    case "file:changed":
      return `File changed: ${stripAnsi(event.path)}`;
    case "cost:update":
      return `Cost updated: $${event.totalCostUsd.toFixed(4)}`;
    case "project:status":
      return `Project status: ${stripAnsi(event.status)}`;
    case "sdk:text":
      return `[${event.agentName}] ${event.text.slice(0, 200)}`;
    case "sdk:tool":
      return `[${event.agentName}] ${event.toolName}: ${event.summary}`;
    default:
      return null;
  }
}
