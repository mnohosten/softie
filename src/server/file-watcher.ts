import { watch } from "chokidar";
import { eventBus } from "../core/event-bus.js";

export function setupFileWatcher(softieDirPath: string): void {
  const watcher = watch(softieDirPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      /node_modules/,
      /\.jsonl$/,     // ignore log files (too noisy)
    ],
  });

  const notify = (path: string) => {
    // Make path relative to .softie dir for the event
    const relative = path.replace(softieDirPath, "").replace(/^\//, "");
    eventBus.emit_event({
      type: "file:changed",
      path: relative,
      timestamp: new Date().toISOString(),
    });
  };

  watcher.on("change", notify);
  watcher.on("add", notify);
  watcher.on("unlink", (path) => {
    const relative = path.replace(softieDirPath, "").replace(/^\//, "");
    eventBus.emit_event({
      type: "file:changed",
      path: relative,
      timestamp: new Date().toISOString(),
    });
  });
}
