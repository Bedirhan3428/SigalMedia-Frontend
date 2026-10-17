// [START] AeroCode
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// [START] AeroCode
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Oturum doğrulaması gerekli." },
        { status: 401 }
      );
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const currentUid = decodedToken.uid;

    const body = await request.json();
    const { targetUid, action = "toggle" } = body || {};

    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json(
        { error: "Hedef kullanıcı ID'si zorunludur." },
        { status: 400 }
      );
    }

    if (currentUid === targetUid) {
      return NextResponse.json(
        { error: "Kendinizi takip edemezsiniz." },
        { status: 400 }
      );
    }

    const followDocId = `${currentUid}_${targetUid}`;
    const followRef = adminDb.collection("follows").doc(followDocId);
    const followerUserRef = adminDb.collection("users").doc(currentUid);
    const targetUserRef = adminDb.collection("users").doc(targetUid);

    const result = await adminDb.runTransaction(async (transaction) => {
      const [followSnap, followerSnap, targetSnap] = await Promise.all([
        transaction.get(followRef),
        transaction.get(followerUserRef),
        transaction.get(targetUserRef),
      ]);

      if (!targetSnap.exists) {
        throw new Error("TARGET_NOT_FOUND");
      }

      const followerData = followerSnap.data() || {};
      const targetData = targetSnap.data() || {};

      const currentFollowingCount = Math.max(
        0,
        Number(followerData?.stats?.followingCount || 0)
      );
      const currentFollowersCount = Math.max(
        0,
        Number(targetData?.stats?.followersCount || 0)
      );

      const exists = followSnap.exists;
      let shouldFollow = !exists;

      if (action === "follow") shouldFollow = true;
      if (action === "unfollow") shouldFollow = false;

      if (shouldFollow && !exists) {
        transaction.set(followRef, {
          followerId: currentUid,
          followingId: targetUid,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (followerSnap.exists) {
          transaction.update(followerUserRef, {
            "stats.followingCount": FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.update(targetUserRef, {
          "stats.followersCount": FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          isFollowing: true,
          followingCount: currentFollowingCount + 1,
          followersCount: currentFollowersCount + 1,
        };
      } else if (!shouldFollow && exists) {
        transaction.delete(followRef);

        if (followerSnap.exists) {
          transaction.update(followerUserRef, {
            "stats.followingCount":
              currentFollowingCount > 0 ? FieldValue.increment(-1) : 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.update(targetUserRef, {
          "stats.followersCount":
            currentFollowersCount > 0 ? FieldValue.increment(-1) : 0,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          isFollowing: false,
          followingCount: Math.max(0, currentFollowingCount - 1),
          followersCount: Math.max(0, currentFollowersCount - 1),
        };
      }

      return {
        isFollowing: exists,
        followingCount: currentFollowingCount,
        followersCount: currentFollowersCount,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    if (error?.message === "TARGET_NOT_FOUND") {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı." },
        { status: 404 }
      );
    }
    console.error("Follow API error:", error);
    return NextResponse.json(
      { error: "Takip işlemi gerçekleştirilemedi." },
      { status: 500 }
    );
  }
}
// [END] AeroCode
// [END] AeroCode
