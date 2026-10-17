import { redactSensitiveText } from './security.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isVerbose = false;

  setVerbose(verbose: boolean): void {
    this.isVerbose = verbose;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.isVerbose) {
      console.log(`[DEBUG] ${redactSensitiveText(message)}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    console.log(redactSensitiveText(message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${redactSensitiveText(message)}`, ...args);
  }

  error(message: string, error?: unknown): void {
    const cleanMessage = redactSensitiveText(message);
    if (this.isVerbose && error instanceof Error && error.stack) {
      console.error(`[ERROR] ${cleanMessage}\n${redactSensitiveText(error.stack)}`);
    } else if (error instanceof Error) {
      console.error(`[ERROR] ${cleanMessage}: ${redactSensitiveText(error.message)}`);
    } else {
      console.error(`[ERROR] ${cleanMessage}`);
    }
  }
}

export const logger = new Logger();

