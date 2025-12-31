import { createServerSideTRPC } from "@/lib/trpc-server";
import { TRPCError } from "@trpc/server";
import { Region } from "@/lib/types";
import { ProfilePage } from "@/components/profile-page";
import { notFound } from "next/navigation";
import { Metadata } from "next";

// Mark this page as dynamic to avoid conflicts with cookie usage in layout
export const dynamic = 'force-dynamic';

interface RegionProfilePageProps {
  params: Promise<{
    username: string;
    region: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
}

export async function generateMetadata({ params }: RegionProfilePageProps): Promise<Metadata> {
  const { username, region } = await params;

  // Validate region
  if (!isValidRegion(region)) {
    return {
      title: "Profile Not Found | tomomai ともマイ",
      description: "The profile you're looking for doesn't exist.",
    };
  }

  try {
    const trpc = await createServerSideTRPC();

    const snapshotData = await trpc.user.getPublicSnapshotData({
      username: decodeURIComponent(username),
      region,
    });

    const regionName = region === 'intl' ? 'International' : 'Japan';

    const title = `${username} | tomomai ともマイ`;
    const description = `View ${username}'s maimai profile for ${regionName}. Track and analyze maimai scores with friends.`;

    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const profileUrl = `${baseUrl}/profile/${encodeURIComponent(username)}/${region}`;

    const userIcon = snapshotData.snapshot.iconUrl || `${baseUrl}/favicon.ico`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: profileUrl,
        siteName: 'tomomai ともマイ',
        type: 'profile',
        images: [
          {
            url: userIcon,
            width: 512,
            height: 512,
            alt: `${username}'s maimai icon`,
          },
        ],
      },
      twitter: {
        card: 'summary',
        title,
        description,
        images: [userIcon],
      },
      alternates: {
        canonical: profileUrl,
      },
    };
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      return {
        title: "Profile Not Found | tomomai ともマイ",
        description: "The profile you're looking for doesn't exist or is not publicly accessible.",
      };
    }

    return {
      title: "Error | tomomai ともマイ",
      description: "An error occurred while loading this profile.",
    };
  }
}

// Validate region parameter
function isValidRegion(region: string): region is Region {
  return region === 'intl' || region === 'jp';
}

export default async function RegionProfilePage({ params, searchParams }: RegionProfilePageProps) {
  const { username, region } = await params;
  const { tab } = await searchParams;

  // Validate region
  if (!isValidRegion(region)) {
    notFound();
  }

  try {
    const trpc = await createServerSideTRPC();

    // Get the user's profile data
    const profileData = await trpc.user.getPublicProfile({
      username: decodeURIComponent(username),
    });

    // Get the user's snapshot data for the specified region
    const snapshotData = await trpc.user.getPublicSnapshotData({
      username: decodeURIComponent(username),
      region,
    });

    return (
      <ProfilePage
        profileData={profileData}
        snapshotData={snapshotData}
        region={region}
        username={decodeURIComponent(username)}
        initialTab={tab}
      />
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      notFound();
    }

    // Re-throw other errors
    throw error;
  }
}
