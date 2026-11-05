import { appLinkResponse, appleAppSiteAssociation } from "@/lib/app-links";

export const dynamic = "force-dynamic";

export function GET() {
  return appLinkResponse(appleAppSiteAssociation());
}
