"use client";

import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

// Holds a captcha payload for the next request to a path that needs one. The
// @better-auth/passkey client's `addPasskey` does not forward `fetchOptions` to
// `/passkey/generate-register-options`, so we inject the `x-captcha-response`
// header here via the global onRequest hook. Single-use: cleared after the
// matching request fires.
let pendingCaptchaForPath: { path: string; payload: string } | null = null;

export function armCaptchaForPath(path: string, payload: string) {
  pendingCaptchaForPath = { path, payload };
}

export const authClient = createAuthClient({
  plugins: [apiKeyClient(), passkeyClient(), oauthProviderClient()],
  fetchOptions: {
    onRequest: (ctx) => {
      if (!pendingCaptchaForPath) return ctx;
      const url = typeof ctx.url === "string" ? ctx.url : ctx.url.toString();
      if (!url.includes(pendingCaptchaForPath.path)) return ctx;
      ctx.headers.set("x-captcha-response", pendingCaptchaForPath.payload);
      pendingCaptchaForPath = null;
      return ctx;
    },
  },
});

export const { signIn, signOut, signUp, useSession } = authClient;
