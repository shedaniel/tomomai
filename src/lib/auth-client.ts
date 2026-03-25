"use client";

import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [apiKeyClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
