"use client";

import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  plugins: [apiKeyClient(), passkeyClient(), oauthProviderClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
