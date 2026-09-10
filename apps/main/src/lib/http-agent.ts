import { Agent, fetch as undiciFetch } from "undici";

const AGENT = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

export function agentFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return undiciFetch(input as never, { ...init, dispatcher: AGENT } as never) as unknown as Promise<Response>;
}
