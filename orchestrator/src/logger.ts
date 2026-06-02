import type { LogEntry, StageName } from "./types.js";

export type LogListener = (entry: LogEntry) => void;

/** Collects structured logs and fans them out to listeners (e.g. the UI SSE stream). */
export class Logger {
  private entries: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();

  log(stage: StageName | "pipeline", level: LogEntry["level"], message: string): LogEntry {
    const entry: LogEntry = { ts: new Date().toISOString(), stage, level, message };
    this.entries.push(entry);
    for (const l of this.listeners) l(entry);
    // Mirror to stdout so CI captures the trace.
    const tag = `[${stage}]`;
    if (level === "error") console.error(tag, message);
    else if (level === "warn") console.warn(tag, message);
    else console.log(tag, message);
    return entry;
  }

  info(stage: StageName | "pipeline", message: string) {
    return this.log(stage, "info", message);
  }
  warn(stage: StageName | "pipeline", message: string) {
    return this.log(stage, "warn", message);
  }
  error(stage: StageName | "pipeline", message: string) {
    return this.log(stage, "error", message);
  }

  onLog(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  all(): LogEntry[] {
    return [...this.entries];
  }
}
