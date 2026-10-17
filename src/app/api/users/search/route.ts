import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const excludeUid = searchParams.get("excludeUid") || "";

    const usersSnap = await adminDb
      .collection("users")
      .where("onboardingCompleted", "==", true)
      .limit(50)
      .get();

    const results: Array<{
      uid: string;
      username: string;
      displayName: string;
      photoURL: string;
      bio: string;
      followersCount: number;
    }> = [];

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      if (uid === excludeUid) return;

      const username = String(data.username || "");
      const usernameLower = String(data.username_lowercase || username.toLowerCase());
      const displayName = String(data.displayName || "");

      if (
        !q ||
        usernameLower.includes(q) ||
        displayName.toLowerCase().includes(q)
      ) {
        results.push({
          uid,
          username,
          displayName,
          photoURL: data.photoURL || "",
          bio: data.bio || "",
          followersCount: Number(data?.stats?.followersCount || 0),
        });
      }
    });

    return NextResponse.json({ users: results.slice(0, 25) });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}
