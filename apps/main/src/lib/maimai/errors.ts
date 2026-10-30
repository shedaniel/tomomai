function retryHint(retryAfterSeconds?: number): string {
  if (!retryAfterSeconds) return "in a few minutes";
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// ERROR CODE 200001: "There are too many access within a short period, the
// connection has been locked currently." Every further request extends the
// lock, so nothing is retried once it shows up.
export class MaimaiLockedError extends Error {
  constructor(retryAfterSeconds?: number) {
    super(`maimai DX NET has temporarily locked the connection after too many requests (ERROR CODE 200001). Please try again ${retryHint(retryAfterSeconds)}.`);
    this.name = "MaimaiLockedError";
  }
}

// The shared request budget stayed exhausted for longer than a request may wait.
export class MaimaiBusyError extends Error {
  constructor() {
    super("maimai DX NET is busy with other fetches right now. Please try again in a few minutes.");
    this.name = "MaimaiBusyError";
  }
}
