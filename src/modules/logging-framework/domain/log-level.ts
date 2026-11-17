/** Numeric so "is this enabled?" is one comparison. Gaps leave room for custom levels. */
export enum LogLevel {
  TRACE = 5,
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  ERROR = 40,
  FATAL = 50,
  OFF = 100,
}

export type LevelName = keyof typeof LogLevel;
export const LEVEL_NAMES = Object.keys(LogLevel).filter((k) => Number.isNaN(Number(k))) as LevelName[];

export function levelName(level: LogLevel): LevelName {
  return LogLevel[level] as LevelName;
}
