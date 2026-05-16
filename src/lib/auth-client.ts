"use client";

import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [apiKeyClient(), passkeyClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
