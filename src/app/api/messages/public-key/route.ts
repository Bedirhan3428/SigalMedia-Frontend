// [START] CREATED BY Umut
import { NextResponse } from "next/server";
import { getServerPublicKeySpkiBase64 } from "@/lib/serverCrypto";

export async function GET() {
  try {
    const publicKey = getServerPublicKeySpkiBase64();
    return NextResponse.json({ publicKey });
  } catch (error) {
    console.error("Public key endpoint error:", error);
    return NextResponse.json(
      { error: "Genel anahtar oluşturulamadı" },
      { status: 500 }
    );
  }
}
// [END] CREATED BY Umut
