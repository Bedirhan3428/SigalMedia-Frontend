import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
    const followerUid = decodedToken.uid;

    const body = await request.json();
    const { targetUid, action = "toggle" } = body || {};

    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json(
        { error: "Hedef kullanıcı ID'si zorunludur." },
        { status: 400 }
      );
    }

    if (followerUid === targetUid) {
      return NextResponse.json(
        { error: "Kendinizi takip edemezsiniz." },
        { status: 400 }
      );
    }

    const followDocId = `${followerUid}_${targetUid}`;
    const followRef = adminDb.collection("follows").doc(followDocId);
    const followerUserRef = adminDb.collection("users").doc(followerUid);
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
          followerId: followerUid,
          followingId: targetUid,
          createdAt: FieldValue.serverTimestamp(),
        });

        const nextFollowingCount = currentFollowingCount + 1;
        const nextFollowersCount = currentFollowersCount + 1;

        if (followerSnap.exists) {
          transaction.update(followerUserRef, {
            "stats.followingCount": nextFollowingCount,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.update(targetUserRef, {
          "stats.followersCount": nextFollowersCount,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          isFollowing: true,
          followingCount: nextFollowingCount,
          followersCount: nextFollowersCount,
        };
      } else if (!shouldFollow && exists) {
        transaction.delete(followRef);

        const nextFollowingCount = Math.max(0, currentFollowingCount - 1);
        const nextFollowersCount = Math.max(0, currentFollowersCount - 1);

        if (followerSnap.exists) {
          transaction.update(followerUserRef, {
            "stats.followingCount": nextFollowingCount,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.update(targetUserRef, {
          "stats.followersCount": nextFollowersCount,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          isFollowing: false,
          followingCount: nextFollowingCount,
          followersCount: nextFollowersCount,
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
