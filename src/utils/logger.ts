/**
 * Safe, Production-Ready Logger
 * Prevents console flooding and stores recent diagnostic events
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown;
}

class Logger {
  private static readonly MAX_ENTRIES = 100;
  private entries: LogEntry[] = [];
  public isDebug = false;

  public debug(message: string, data?: unknown): void {
    if (!this.isDebug) return;
    this.record('DEBUG', message, data);
    console.debug(`[DEBUG] ${message}`, data ?? '');
  }

  public info(message: string, data?: unknown): void {
    this.record('INFO', message, data);
    console.info(`[INFO] ${message}`, data ?? '');
  }

  public warn(message: string, data?: unknown): void {
    this.record('WARN', message, data);
    console.warn(`[WARN] ${message}`, data ?? '');
  }

  public error(message: string, data?: unknown): void {
    this.record('ERROR', message, data);
    console.error(`[ERROR] ${message}`, data ?? '');
  }

  private record(level: LogLevel, message: string, data?: unknown): void {
    if (this.entries.length >= Logger.MAX_ENTRIES) {
      this.entries.shift();
    }
    this.entries.push({ timestamp: Date.now(), level, message, data });
  }

  public getRecentLogs(): readonly LogEntry[] {
    return this.entries;
  }
}

export const logger = new Logger();
