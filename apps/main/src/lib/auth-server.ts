import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";

export async function getServerSession() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    return session;
  } catch (error) {
    logger.error({ err: error, context: "auth-server" }, "Failed to get server session");
    return null;
  }
}
