import { expect, it, vi } from "vitest";

vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://tomomai.test" }));

import { GET } from "./route";

it("posts only the OTP, the signed authorization and the gateway cookie", async () => {
  const script = await (await GET()).text();
  expect(script).toContain("post(BASE_URL+'/api/login',{otp,user,token:clal.trim()})");
  expect(script).not.toContain("region");
});
