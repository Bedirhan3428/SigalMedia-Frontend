import { NextResponse } from "next/server";
import { notSupabase, requireUser } from "@/lib/supabase/account";

/** KVKK data export: GET /api/account/export returns the export_my_data() JSON as a download. */
export async function GET() {
  const unsupported = notSupabase();
  if (unsupported) return unsupported;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "export_failed" }, { status: 500 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shovrum-verilerim.json"',
      "Cache-Control": "no-store",
    },
  });
}
