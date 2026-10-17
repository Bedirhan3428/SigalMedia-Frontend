// [START] NexusAI
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
    const { targetUid, action } = body as {
      targetUid?: string;
      action?: "block" | "unblock";
    };

    if (!targetUid || !action || currentUid === targetUid) {
      return NextResponse.json({ error: "Geçersiz parametreler" }, { status: 400 });
    }

    const blockDocId = `${currentUid}_${targetUid}`;
    const blockRef = adminDb.collection("blocks").doc(blockDocId);

    if (action === "unblock") {
      await blockRef.delete();
      return NextResponse.json({ success: true, isBlocked: false });
    }

    if (action === "block") {
      await adminDb.runTransaction(async (tx) => {
        const followABRef = adminDb.collection("follows").doc(`${currentUid}_${targetUid}`);
        const followBARef = adminDb.collection("follows").doc(`${targetUid}_${currentUid}`);
        const reqABRef = adminDb.collection("follow_requests").doc(`${currentUid}_${targetUid}`);
        const reqBARef = adminDb.collection("follow_requests").doc(`${targetUid}_${currentUid}`);
        const currentUserRef = adminDb.collection("users").doc(currentUid);
        const targetUserRef = adminDb.collection("users").doc(targetUid);

        const [followABSnap, followBASnap, reqABSnap, reqBASnap] = await Promise.all([
          tx.get(followABRef),
          tx.get(followBARef),
          tx.get(reqABRef),
          tx.get(reqBARef),
        ]);

        // 1. Engel dokümanını oluştur
        tx.set(blockRef, {
          blockerUid: currentUid,
          blockedUid: targetUid,
          createdAt: FieldValue.serverTimestamp(),
        });

        // 2. A -> B takibi varsa sil ve sayaçları düşür
        if (followABSnap.exists) {
          tx.delete(followABRef);
          tx.update(currentUserRef, {
            "stats.followingCount": FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.update(targetUserRef, {
            "stats.followersCount": FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // 3. B -> A takibi varsa sil ve sayaçları düşür
        if (followBASnap.exists) {
          tx.delete(followBARef);
          tx.update(targetUserRef, {
            "stats.followingCount": FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.update(currentUserRef, {
            "stats.followersCount": FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // 4. Bekleyen takip isteklerini temizle
        if (reqABSnap.exists) {
          tx.delete(reqABRef);
        }
        if (reqBASnap.exists) {
          tx.delete(reqBARef);
        }
      });

      return NextResponse.json({ success: true, isBlocked: true });
    }

    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  } catch (error) {
    console.error("Block API error:", error);
    return NextResponse.json(
      { error: "İşlem sırasında bir hata oluştu" },
      { status: 500 }
    );
  }
}
// [END] NexusAI
