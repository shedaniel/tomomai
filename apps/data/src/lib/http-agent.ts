import { Agent } from "undici";

export const AGENT = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});
