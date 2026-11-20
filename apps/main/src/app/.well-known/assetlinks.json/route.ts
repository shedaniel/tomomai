import { androidAssetLinks, appLinkResponse } from "@/lib/app-links";

export const dynamic = "force-dynamic";

export function GET() {
  return appLinkResponse(androidAssetLinks());
}
