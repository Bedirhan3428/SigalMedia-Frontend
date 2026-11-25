// Integration checks against a REAL Supabase project with the schema applied (docs/SUPABASE_PLAN.md section 8).
// Skipped unless SUPABASE_E2E=1. It signs in with a disposable test account you create by hand:
//   SUPABASE_E2E=1 SUPABASE_E2E_EMAIL=... SUPABASE_E2E_PASSWORD=... npm test
// Never run this against production data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseProfileService } from "../src/services/profile/supabaseProfile.ts";
import { createSupabaseAuthService } from "../src/services/auth/supabaseAuth.ts";

const enabled = process.env.SUPABASE_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const email = process.env.SUPABASE_E2E_EMAIL ?? "";
const password = process.env.SUPABASE_E2E_PASSWORD ?? "";

test("supabase auth + profile round trip", { skip: !enabled || !url || !key || !email || !password }, async () => {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const auth = createSupabaseAuthService(client, { getOrigin: () => "http://localhost:3000" });
  const user = await auth.signInWithEmail(email, password);
  assert.ok(user.uid);

  const profiles = createSupabaseProfileService(client as never);
  const mine = await profiles.get(user.uid);
  assert.ok(mine, "profile row is created by the on_auth_user_created trigger");
  assert.equal(await profiles.checkUsernameAvailable("admin"), false); // reserved
  assert.equal(await profiles.checkUsernameAvailable("x"), false); // too short

  await profiles.update(user.uid, { bio: "e2e" });
  assert.equal((await profiles.get(user.uid))?.bio, "e2e");

  await auth.signOut();
});
