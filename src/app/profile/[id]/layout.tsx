// [START] AeroCode
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

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
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sigalmedia-social";
  const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "default";
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

  let resolvedUid = rawId;

  const getDocFields = async (collectionName: string, docId: string) => {
    const res = await fetch(
      `${baseUrl}/${collectionName}/${encodeURIComponent(docId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.fields || null;
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
async function getProfileForPreview(
  rawId: string
): Promise<PublicProfilePreview | null> {
  const decodedId = decodeURIComponent(rawId || "").trim();
  if (!decodedId) return null;

  try {
    const restData = await fetchProfileViaRest(decodedId);
    if (restData) return restData;
  } catch {
    // Fallback to adminDb below
  }

  try {
    let resolvedUid = decodedId;
    let userSnap = await adminDb.collection("users").doc(resolvedUid).get();

    if (!userSnap.exists) {
      const cleanUsername = resolvedUid.replace(/^@/, "").toLowerCase();
      const usernameSnap = await adminDb
        .collection("usernames")
        .doc(cleanUsername)
        .get();
      if (usernameSnap.exists) {
        resolvedUid = String(usernameSnap.data()?.uid || "");
        if (resolvedUid) {
          userSnap = await adminDb.collection("users").doc(resolvedUid).get();
        }
      }
    }

    if (!userSnap.exists) return null;
    const data = userSnap.data() || {};

    return {
      uid: String(data.uid || resolvedUid),
      username: String(data.username || "kullanici"),
      displayName: String(data.displayName || data.username || "Kullanıcı"),
      photoURL: String(data.photoURL || ""),
      bio: String(data.bio || ""),
    };
  } catch {
    return null;
  }
}
// [END] AeroCode

// [START] AeroCode
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const profile = await getProfileForPreview(id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sigalmedia.com.tr";
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
    ? profile.bio
    : `${profile.displayName} (@${profile.username}) SigalMedia profili`;
  const profileUrl = `${appUrl}/profile/${profile.uid}`;
  const hasHttpPhoto =
    Boolean(profile.photoURL) && /^https?:\/\//i.test(profile.photoURL);
  const ogImage = hasHttpPhoto
    ? profile.photoURL
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
      type: "profile",
      username: profile.username,
      images: [
        {
          url: ogImage,
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
async function DynamicProfileConnectionMarker({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getProfileForPreview(id);

  if (!profile) return null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              identifier: profile.uid,
              name: profile.displayName,
              alternateName: `@${profile.username}`,
              description: profile.bio || undefined,
              image: profile.photoURL || undefined,
            },
          }),
        }}
      />
      <article className="sr-only" aria-hidden="true">
        {profile.photoURL && (
          <img
            src={profile.photoURL}
            alt={`${profile.displayName} (@${profile.username})`}
          />
        )}
        <h1>{profile.displayName}</h1>
        <p>@{profile.username}</p>
        {profile.bio && <p>{profile.bio}</p>}
      </article>
    </>
  );
}
// [END] AeroCode

// [START] AeroCode
export default function ProfileIdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DynamicProfileConnectionMarker params={params} />
      {children}
    </Suspense>
  );
}
// [END] AeroCode
// [END] AeroCode
