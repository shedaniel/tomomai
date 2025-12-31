import { notFound, redirect } from "next/navigation";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { TRPCError } from "@trpc/server";

interface ProfilePageProps {
  params: Promise<{
    username: string;
  }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;

  try {
    // Get the user's profile to find their main region
    const trpc = await createServerSideTRPC();
    const profileData = await trpc.user.getPublicProfile({
      username: decodeURIComponent(username),
    });

    // Redirect to the specific region page using the user's main region
    redirect(`/profile/${username}/${profileData.profileMainRegion}`);
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      notFound();
    }

    // Re-throw other errors
    throw error;
  }
}
