// [START] AeroCode
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

interface PublicProfilePreview {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string;
  bio: string;
}

// [START] AeroCode
async function fetchProfileViaRest(
  rawId: string
): Promise<PublicProfilePreview | null> {
  const decodedId = decodeURIComponent(rawId || "").trim();
  if (!decodedId) return null;

  const projectId = (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sigalmedia-social"
  ).trim();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents`;

  let resolvedUid = decodedId;

  const getDocFields = async (collectionName: string, docId: string) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `${baseUrl}/${collectionName}/${encodeURIComponent(docId)}`,
        {
          signal: controller.signal,
          next: { revalidate: 60 },
        }
      );
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.fields || null;
    } catch {
      return null;
    }
  };

  let userFields = await getDocFields("users", resolvedUid);

  if (!userFields) {
    const cleanUsername = resolvedUid.replace(/^@/, "").toLowerCase();
    const usernameFields = await getDocFields("usernames", cleanUsername);
    const mappedUid = usernameFields?.uid?.stringValue;
    if (mappedUid) {
      resolvedUid = mappedUid;
      userFields = await getDocFields("users", resolvedUid);
    }
  }

  if (!userFields) return null;

  return {
    uid: userFields.uid?.stringValue || resolvedUid,
    username: userFields.username?.stringValue || "kullanici",
    displayName:
      userFields.displayName?.stringValue ||
      userFields.username?.stringValue ||
      "Kullanıcı",
    photoURL: userFields.photoURL?.stringValue || "",
    bio: userFields.bio?.stringValue || "",
  };
}
// [END] AeroCode

// [START] AeroCode
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await fetchProfileViaRest(id);
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://sigalmedia.com.tr"
  ).trim();
  const metadataBase = new URL(appUrl);

  if (!profile) {
    return {
      metadataBase,
      title: "Kullanıcı Profili | SigalMedia",
      description: "SigalMedia kullanıcı profili.",
    };
  }

  const title = `${profile.displayName} (@${profile.username})`;
  const description = profile.bio
    ? `${profile.bio}`
    : `${profile.displayName} (@${profile.username}) • SigalMedia`;
  const profileUrl = `${appUrl}/profile/${profile.uid}`;
  const hasHttpPhoto =
    Boolean(profile.photoURL) && /^https?:\/\//i.test(profile.photoURL);
  const ogImage = hasHttpPhoto
    ? `${appUrl}/api/users/avatar/${profile.uid}`
    : `${appUrl}/icons/MainLogo.svg`;

  return {
    metadataBase,
    title: `${title} | SigalMedia`,
    description,
    alternates: {
      canonical: profileUrl,
    },
    openGraph: {
      title,
      description,
      url: profileUrl,
      siteName: "SigalMedia",
      type: "website",
      images: [
        {
          url: ogImage,
          secureUrl: ogImage,
          type: "image/jpeg",
          width: 400,
          height: 400,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [ogImage],
    },
  };
}
// [END] AeroCode

// [START] AeroCode
async function DynamicConnectionMarker() {
  await connection();
  return null;
}
// [END] AeroCode

// [START] AeroCode
export default function ProfileIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <DynamicConnectionMarker />
      </Suspense>
      {children}
    </>
  );
}
// [END] AeroCode
// [END] AeroCode
