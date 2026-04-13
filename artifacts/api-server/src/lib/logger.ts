/**
 * Centralized logger that ensures all logs are immediately visible
 * Writes to both stdout and stderr with immediate flushing
 */

export interface LogContext {
  module?: string;
  component?: string;
  requestId?: string;
}

class Logger {
  private context: LogContext = {};

  setContext(ctx: Partial<LogContext>) {
    this.context = { ...this.context, ...ctx };
  }

  private formatMessage(message: string): string {
    const parts = [message];
    if (this.context.requestId) {
      parts.push(`[req: ${this.context.requestId}]`);
    }
    return parts.join(" ");
  }

  // Info level - write to stdout
  info(category: string, message: string, data?: unknown) {
    const formatted = `\x1b[36m[${category}]\x1b[0m ${this.formatMessage(message)}`;
    console.log(formatted, data ?? "");
    process.stdout.write(""); // Force flush
  }

  // Warn level - write to stderr
  warn(category: string, message: string, data?: unknown) {
    const formatted = `\x1b[33m[${category}]\x1b[0m ${this.formatMessage(message)}`;
    console.warn(formatted, data ?? "");
    process.stderr.write(""); // Force flush
  }

  // Error level - write to stderr
  error(category: string, message: string, error?: unknown) {
    const formatted = `\x1b[31m[${category}]\x1b[0m ${this.formatMessage(message)}`;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(formatted, errorMsg);
    process.stderr.write(""); // Force flush
  }

  // Success level - write to stdout with green
  success(category: string, message: string, data?: unknown) {
    const formatted = `\x1b[32m[${category}]\x1b[0m ${this.formatMessage(message)}`;
    console.log(formatted, data ?? "");
    process.stdout.write(""); // Force flush
  }

  // Debug/HTTP level - detailed output
  debug(category: string, message: string, data?: unknown) {
    const formatted = `\x1b[36m[${category}]\x1b[0m ${this.formatMessage(message)}`;
    console.log(formatted, data ?? "");
    process.stdout.write(""); // Force flush
  }

  // Request level - HTTP request/response
  request(method: string, path: string, statusCode: number, duration: number) {
    const color = statusCode >= 500
      ? "\x1b[31m" // red
      : statusCode >= 400
        ? "\x1b[33m" // yellow
        : statusCode >= 300
          ? "\x1b[36m" // cyan
          : "\x1b[32m"; // green
    const formatted = `${color}${method}\x1b[0m ${path} → ${statusCode} (${duration}ms)`;
    console.log(formatted);
    process.stdout.write(""); // Force flush
  }
}

export const logger = new Logger();

// Ensure immediate output in non-TTY environments
if (!process.stdout.isTTY) {
  // When piped, set synchronous writes
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = function (...args: unknown[]) {
    originalLog.apply(console, args as Parameters<typeof console.log>);
    if (process.stdout.write) {
      process.stdout.write("");
    }
  };

  console.error = function (...args: unknown[]) {
    originalError.apply(console, args as Parameters<typeof console.error>);
    if (process.stderr.write) {
      process.stderr.write("");
    }
  };

  console.warn = function (...args: unknown[]) {
    originalWarn.apply(console, args as Parameters<typeof console.warn>);
    if (process.stderr.write) {
      process.stderr.write("");
    }
  };
}
