import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const currentUid = decoded.uid;

    const body = await req.json();
    const { requesterUid, action } = body as {
      requesterUid?: string;
      action?: "accept" | "reject";
    };

    if (!requesterUid || !action || currentUid === requesterUid) {
      return NextResponse.json({ error: "Geçersiz parametreler" }, { status: 400 });
    }

    const reqDocId = `${requesterUid}_${currentUid}`;
    const reqRef = adminDb.collection("follow_requests").doc(reqDocId);

    if (action === "reject") {
      await reqRef.delete();
      return NextResponse.json({ success: true });
    }

    if (action === "accept") {
      await adminDb.runTransaction(async (tx) => {
        const reqSnap = await tx.get(reqRef);
        const followDocId = `${requesterUid}_${currentUid}`;
        const followRef = adminDb.collection("follows").doc(followDocId);
        const followSnap = await tx.get(followRef);

        if (reqSnap.exists) {
          tx.delete(reqRef);
        }

        if (!followSnap.exists) {
          tx.set(followRef, {
            followerId: requesterUid,
            followingId: currentUid,
            createdAt: FieldValue.serverTimestamp(),
          });

          const requesterRef = adminDb.collection("users").doc(requesterUid);
          const currentRef = adminDb.collection("users").doc(currentUid);

          tx.update(requesterRef, {
            "stats.followingCount": FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.update(currentRef, {
            "stats.followersCount": FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  } catch (error) {
    console.error("Follow request API error:", error);
    return NextResponse.json(
      { error: "İşlem sırasında bir hata oluştu" },
      { status: 500 }
    );
  }
}
