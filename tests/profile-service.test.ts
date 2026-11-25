import assert from "node:assert/strict";
import { test } from "node:test";
import { mapProfileError, ProfileServiceError } from "../src/services/profile/errors.ts";
import { createSupabaseProfileService, profileRowToUserProfile } from "../src/services/profile/supabaseProfile.ts";

const row = {
  id: "11111111-1111-4111-8111-111111111111", username: "ada", display_name: "Ada", bio: "hi", avatar_key: "avatars/u/a.jpg",
  is_verified: false, is_private: true, who_can_message: "following", read_receipts: false, show_online_status: true,
  profile_style: { v: 1 }, role: "moderator", onboarding_completed: true, followers_count: 3, following_count: 4, posts_count: 5,
  last_seen_at: null, created_at: "c", updated_at: "u",
};
const media = (k: string | null | undefined) => (k ? `https://m/${k}` : undefined);

function fake(rpcResult: { data?: unknown; error?: unknown } = { data: null, error: null }, tableResult: { data?: unknown; error?: unknown } = { data: row, error: null }) {
  const calls: { rpc: [string, unknown][]; update: unknown[]; eq: unknown[][] } = { rpc: [], update: [], eq: [] };
  const query = {
    select: () => query,
    eq: (...a: unknown[]) => { calls.eq.push(a); return query; },
    maybeSingle: async () => tableResult,
    update: (v: unknown) => { calls.update.push(v); return query; },
    then: (res: (v: unknown) => unknown) => res(tableResult),
  };
  const client = { rpc: async (n: string, a: unknown) => { calls.rpc.push([n, a]); return rpcResult; }, from: () => query };
  return { svc: createSupabaseProfileService(client as never, media), calls };
}

test("row mapping: avatar url from key, privacy/message flags, role, stats", () => {
  const p = profileRowToUserProfile(row as never, media);
  assert.equal(p.uid, row.id);
  assert.equal(p.photoURL, "https://m/avatars/u/a.jpg");
  assert.equal(p.isPrivate, true);
  assert.deepEqual(p.messageSettings, { whoCanMessage: "following", readReceipts: false, showOnlineStatus: true });
  assert.equal(p.role, "user"); // moderator is not an app "admin"
  assert.deepEqual(p.stats, { postsCount: 5, followersCount: 3, followingCount: 4 });
  assert.equal(profileRowToUserProfile({ ...row, avatar_key: null } as never, media).photoURL, "");
});

test("RPC error mapping: username taken, too young, rate limit, auth", () => {
  assert.equal(mapProfileError({ code: "23505", message: "username_unavailable" }).code, "username-unavailable");
  assert.equal(mapProfileError({ code: "P0001", message: "too_young" }).code, "too-young");
  assert.equal(mapProfileError({ code: "P0429", message: "rate_limited" }).code, "rate-limited");
  assert.equal(mapProfileError({ code: "28000", message: "not_authenticated" }).code, "not-authenticated");
  assert.equal(mapProfileError({ message: "boom" }).code, "unknown");
});

test("completeOnboarding sends the RPC args; server errors surface as typed errors", async () => {
  const ok = fake();
  await ok.svc.completeOnboarding({ uid: "u", email: "a@b.co", username: "Ada_1", displayName: " Ada ", birthDate: "2008-05-01", age: 18 });
  assert.deepEqual(ok.calls.rpc[0], ["complete_onboarding", { p_username: "ada_1", p_display_name: "Ada", p_birth_date: "2008-05-01" }]);

  const taken = fake({ error: { code: "23505", message: "username_unavailable" } });
  await assert.rejects(
    () => taken.svc.completeOnboarding({ uid: "u", email: null, username: "ada", displayName: "A", birthDate: "2000-01-01", age: 26 }),
    (e: ProfileServiceError) => e.code === "username-unavailable",
  );

  const young = fake({ error: { code: "P0001", message: "too_young" } });
  await assert.rejects(
    () => young.svc.completeOnboarding({ uid: "u", email: null, username: "ada", displayName: "A", birthDate: "2000-01-01", age: 20 }),
    (e: ProfileServiceError) => e.code === "too-young",
  );
});

test("under 13 is refused before any network call; bad usernames too", async () => {
  const f = fake();
  await assert.rejects(
    () => f.svc.completeOnboarding({ uid: "u", email: null, username: "kid_1", displayName: "K", birthDate: "2018-01-01", age: 8 }),
    (e: ProfileServiceError) => e.code === "too-young",
  );
  await assert.rejects(
    () => f.svc.completeOnboarding({ uid: "u", email: null, username: "A b", displayName: "K", birthDate: "2000-01-01", age: 26 }),
    (e: ProfileServiceError) => e.code === "invalid-username",
  );
  assert.equal(f.calls.rpc.length, 0);
});

test("checkUsernameAvailable: format guard, RPC result", async () => {
  const yes = fake({ data: true, error: null });
  assert.equal(await yes.svc.checkUsernameAvailable("Ada_1"), true);
  assert.deepEqual(yes.calls.rpc[0], ["check_username_available", { p_username: "ada_1" }]);
  const no = fake({ data: false, error: null });
  assert.equal(await no.svc.checkUsernameAvailable("taken"), false);
  assert.equal(await no.svc.checkUsernameAvailable("x"), false);
  assert.equal(no.calls.rpc.length, 1);
});

test("get / getByIdOrUsername / update", async () => {
  const f = fake();
  assert.equal((await f.svc.get(row.id))?.username, "ada");
  assert.equal((await f.svc.getByIdOrUsername("@Ada"))?.username, "ada");
  assert.deepEqual(f.calls.eq.at(-1), ["username", "ada"]);
  await f.svc.getByIdOrUsername(row.id);
  assert.deepEqual(f.calls.eq.at(-1), ["id", row.id]);
  assert.equal(await f.svc.getByIdOrUsername("!!"), null);

  await f.svc.update(row.id, { displayName: "New", bio: "b", isPrivate: false, messageSettings: { whoCanMessage: "none", readReceipts: true, showOnlineStatus: false } });
  assert.deepEqual(f.calls.update[0], { display_name: "New", bio: "b", is_private: false, who_can_message: "none", read_receipts: true, show_online_status: false });

  const none = fake({}, { error: null, data: null });
  assert.equal(await none.svc.get("x"), null);
  const failing = fake({}, { error: { message: "x" }, data: null });
  await assert.rejects(() => failing.svc.update("x", { bio: "b" }), ProfileServiceError);
});
