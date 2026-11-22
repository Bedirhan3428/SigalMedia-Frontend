import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { removeSubscription } from "@/lib/push/server";

export async function POST(req: NextRequest) {
  try {
    const h = req.headers.get("authorization");
    if (!h?.startsWith("Bearer ")) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(h.slice(7)).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Geçersiz oturum" }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (typeof body?.endpoint !== "string" || !body.endpoint) {
      return NextResponse.json({ error: "endpoint gerekli" }, { status: 400 });
    }
    await removeSubscription(decoded.uid, body.endpoint);
    return NextResponse.json({ status: "ok" });
  } catch (e) {
    console.error("push unsubscribe error:", e);
    return NextResponse.json({ error: "Abonelik silinemedi" }, { status: 500 });
  }
}
