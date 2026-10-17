// [START] AeroCode
import { NextResponse } from "next/server";

// [START] AeroCode
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = decodeURIComponent(id || "")
      .replace(/\.(jpg|jpeg|png|webp)$/i, "")
      .trim();

    if (!cleanId) {
      return NextResponse.redirect(new URL("/icons/MainLogo.svg", request.url));
    }

    const projectId = (
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sigalmedia-social"
    ).trim();
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents/users/${encodeURIComponent(
      cleanId
    )}`;

    const docRes = await fetch(docUrl, { next: { revalidate: 60 } });
    if (!docRes.ok) {
      return NextResponse.redirect(new URL("/icons/MainLogo.svg", request.url));
    }

    const docJson = await docRes.json();
    const photoURL = docJson?.fields?.photoURL?.stringValue;

    if (!photoURL || !/^https?:\/\//i.test(photoURL)) {
      return NextResponse.redirect(new URL("/icons/MainLogo.svg", request.url));
    }

    const imgRes = await fetch(photoURL, { next: { revalidate: 3600 } });
    if (!imgRes.ok) {
      return NextResponse.redirect(new URL("/icons/MainLogo.svg", request.url));
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = await imgRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.redirect(new URL("/icons/MainLogo.svg", request.url));
  }
}
// [END] AeroCode
// [END] AeroCode
