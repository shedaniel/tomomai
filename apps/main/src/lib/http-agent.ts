import { Agent, fetch as undiciFetch } from "undici";

const AGENT = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

// A single keep-alive connection, so every request lands on the same upstream backend.
export function createPinnedAgent(): Agent {
  return new Agent({
    connections: 1,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
    connect: {
      rejectUnauthorized: false
    }
  });
}

export function agentFetch(input: string | URL, init?: RequestInit, dispatcher: Agent = AGENT): Promise<Response> {
  return undiciFetch(input as never, { ...init, dispatcher } as never) as unknown as Promise<Response>;
}
