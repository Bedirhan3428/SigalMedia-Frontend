import { NextResponse, type NextRequest } from "next/server";
import { notSupabase, requireUser, sameOrigin } from "@/lib/supabase/account";

/** KVKK account deletion: DELETE /api/account with { confirmUsername }. Calls the delete_my_account RPC as the signed-in user. */
export async function DELETE(request: NextRequest) {
  const unsupported = notSupabase();
  if (unsupported) return unsupported;
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  let confirm = "";
  try {
    confirm = String(((await request.json()) as { confirmUsername?: unknown })?.confirmUsername ?? "").trim().replace(/^@/, "").toLowerCase();
  } catch {
    // handled below
  }
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  const username = profile?.username?.toLowerCase();
  if (!username || confirm !== username) {
    return NextResponse.json({ error: "confirmation_mismatch" }, { status: 400 });
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  // The auth user is gone; drop the session cookies (server-side revoke may fail, which is fine).
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
