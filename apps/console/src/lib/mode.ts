export type ConsoleMode = "platform" | "hosted";

export const CONSOLE_MODE: ConsoleMode =
  (process.env.CONSOLE_MODE as ConsoleMode) || "platform";

export const isPlatform = CONSOLE_MODE === "platform";
export const isHosted = CONSOLE_MODE === "hosted";
