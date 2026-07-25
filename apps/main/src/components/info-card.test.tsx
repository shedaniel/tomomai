import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfilePrivacySettings, SnapshotWithSongs } from "@/lib/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.username ? `${key}:${String(values.username)}` : key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => false,
}));

vi.mock("@tomomai/markdown", () => ({
  MarkdownContent: ({ value }: { value: string }) => <div data-markdown>{value}</div>,
  MarkdownEditor: () => <div data-editor />,
  measureMarkdown: (value: string) => ({ characters: value.length, utf8Bytes: value.length }),
  PROFILE_MARKDOWN_POLICY: {},
  videoEmbedExtension: {},
}));

vi.mock("@/components/profile-report-dialog", () => ({
  ProfileReportDialog: ({
    username,
    profileUserId,
  }: {
    username: string;
    profileUserId: string;
  }) => (
    <button type="button" data-profile-report data-profile-user-id={profileUserId}>
      Report {username}
    </button>
  ),
}));

const mutateAsync = vi.fn();
const setData = vi.fn();

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ user: { getProfileSettings: { setData } } }),
    user: {
      getProfileSettings: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      updateProfileDescription: { useMutation: () => ({ mutateAsync, isPending: false }) },
      updatePublishProfile: { useMutation: () => ({ mutateAsync, isPending: false }) },
      updateProfileMainRegion: { useMutation: () => ({ mutateAsync, isPending: false }) },
      updateProfilePrivacySettings: { useMutation: () => ({ mutateAsync, isPending: false }) },
    },
  },
}));

import { InfoCard } from "./info-card";

const snapshotData = {
  snapshot: {
    id: "snapshot-id",
    fetchedAt: new Date("2026-01-01T00:00:00Z"),
    rating: 15000,
    displayName: "Player",
    gameVersion: 0,
    courseRankUrl: "",
    classRankUrl: "",
    stars: 10,
    versionPlayCount: 20,
    totalPlayCount: 30,
    iconUrl: "https://example.com/icon.png",
    title: "Title",
    titleType: "normal",
  },
  songs: [],
} as SnapshotWithSongs;

const privacySettings: ProfilePrivacySettings = {
  profileShowAllScores: true,
  profileShowScoreDetails: true,
  profileShowPlates: true,
  profileShowPlayCounts: true,
  profileShowEvents: true,
  profileShowInSearch: true,
};

function renderInfoCard({
  isOwner,
  profileDescription,
  profileUserId = "immutable-user-id",
}: {
  isOwner: boolean;
  profileDescription: string | null;
  profileUserId?: string | null;
}) {
  return renderToStaticMarkup(
    <InfoCard
      selectedSnapshotData={snapshotData}
      visitableProfileAt="alice"
      profileUsername="alice"
      profileUserId={profileUserId}
      profileDescription={profileDescription}
      isOwner={isOwner}
      privacySettings={privacySettings}
      publishProfile
      descriptionDraft={profileDescription ?? ""}
      isDescriptionEditing={false}
      onDescriptionDraftChange={vi.fn()}
      onDescriptionEditingChange={vi.fn()}
      onProfileDescriptionChange={vi.fn()}
      onPrivacySettingsChange={vi.fn()}
      onPublishProfileChange={vi.fn()}
    />,
  );
}

describe("InfoCard About heading action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("places the report action in About for a non-owner with a description", () => {
    const html = renderInfoCard({ isOwner: false, profileDescription: "Hello" });

    expect(html).toContain('id="profile-about-heading"');
    expect(html).toContain("data-profile-report");
    expect(html).toContain('data-profile-user-id="immutable-user-id"');
    expect(html.indexOf('id="profile-about-heading"')).toBeLessThan(html.indexOf("data-profile-report"));
    expect(html).not.toContain("publicProfile.descriptionEditor.edit");
  });

  it("keeps Edit/Add owner-only and never renders Report for owners", () => {
    const withDescription = renderInfoCard({ isOwner: true, profileDescription: "Hello" });
    const withoutDescription = renderInfoCard({ isOwner: true, profileDescription: null });

    expect(withDescription).toContain("publicProfile.descriptionEditor.edit");
    expect(withoutDescription).toContain("publicProfile.descriptionEditor.add");
    expect(withDescription).not.toContain("data-profile-report");
    expect(withoutDescription).not.toContain("data-profile-report");
  });

  it("omits About and Report for a non-owner without a description", () => {
    const html = renderInfoCard({ isOwner: false, profileDescription: null });

    expect(html).not.toContain('id="profile-about-heading"');
    expect(html).not.toContain("data-profile-report");
  });
});
