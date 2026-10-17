export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isVerbose = false;

  setVerbose(verbose: boolean): void {
    this.isVerbose = verbose;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.isVerbose) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    console.log(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, error?: unknown): void {
    if (this.isVerbose && error instanceof Error && error.stack) {
      console.error(`[ERROR] ${message}\n${error.stack}`);
    } else if (error instanceof Error) {
      console.error(`[ERROR] ${message}: ${error.message}`);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }
}

export const logger = new Logger();
