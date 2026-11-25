import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBackend } from "../src/lib/backend.ts";
import { safeNextPath } from "../src/lib/supabase/redirect.ts";
import { AuthServiceError, mapFirebaseAuthError, mapSupabaseAuthError } from "../src/services/auth/errors.ts";
import { createSupabaseAuthService } from "../src/services/auth/supabaseAuth.ts";

type Listener = (event: string, session: { user: Record<string, unknown> } | null) => void;

function fakeClient(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string, result: unknown) => async (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
    return result;
  };
  let listener: Listener | null = null;
  let unsubscribed = false;
  const client = {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => (unsubscribed = true) } } };
      },
      getSession: rec("getSession", { data: { session: { access_token: "tok" } } }),
      signInWithOAuth: rec("signInWithOAuth", { data: {}, error: null }),
      signInWithPassword: rec("signInWithPassword", { data: { user: { id: "u1", email: "a@b.co", email_confirmed_at: "x" } }, error: null }),
      signUp: rec("signUp", { data: { user: { id: "u2", email: "n@b.co", identities: [{}] }, session: null }, error: null }),
      signOut: rec("signOut", { error: null }),
      resend: rec("resend", { error: null }),
      resetPasswordForEmail: rec("resetPasswordForEmail", { data: {}, error: null }),
      updateUser: rec("updateUser", { data: {}, error: null }),
      ...overrides,
    },
  };
  return { client: client as never, calls, emit: (e: string, s: { user: Record<string, unknown> } | null) => listener?.(e, s), isUnsubscribed: () => unsubscribed };
}

const opts = { getOrigin: () => "https://app.test" };
const tick = () => new Promise((r) => setTimeout(r, 5));
const sbUser = (id: string, extra: Record<string, unknown> = {}) => ({
  id, email: `${id}@x.co`, email_confirmed_at: "2026-01-01", updated_at: "t1",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "Ada L", avatar_url: "https://img/a.png" }, ...extra,
});

test("flag resolves: unset/unknown -> firebase, supabase only when exact", () => {
  assert.equal(resolveBackend(undefined), "firebase");
  assert.equal(resolveBackend(""), "firebase");
  assert.equal(resolveBackend("nonsense"), "firebase");
  assert.equal(resolveBackend("supabase"), "supabase");
  assert.equal(resolveBackend(" Supabase "), "supabase");
});

test("auth state: sign-in emits mapped user, token refresh is ignored, sign-out emits null, unsubscribe works", async () => {
  const f = fakeClient();
  const svc = createSupabaseAuthService(f.client, opts);
  const seen: (string | null)[] = [];
  const off = svc.onAuthStateChanged((u) => seen.push(u?.uid ?? null));

  f.emit("INITIAL_SESSION", null);
  f.emit("SIGNED_IN", { user: sbUser("u1") });
  f.emit("TOKEN_REFRESHED", { user: sbUser("u1", { updated_at: "t2" }) });
  f.emit("SIGNED_IN", { user: sbUser("u1") }); // tab refocus duplicate
  await tick();
  assert.deepEqual(seen, [null, "u1"]);
  const u = svc.getCurrentUser();
  assert.equal(u?.displayName, "Ada L");
  assert.equal(u?.photoURL, "https://img/a.png");
  assert.equal(u?.emailVerified, true);
  assert.deepEqual(u?.providerData, [{ providerId: "google.com" }]);
  assert.equal(await u?.getIdToken(), "tok");

  f.emit("SIGNED_OUT", null);
  await tick();
  assert.deepEqual(seen, [null, "u1", null]);
  assert.equal(svc.getCurrentUser(), null);
  off();
  assert.equal(f.isUnsubscribed(), true);
});

test("google sign-in builds the OAuth call with the callback redirect", async () => {
  const f = fakeClient();
  await createSupabaseAuthService(f.client, opts).signInWithGoogle();
  const args = (f.calls.signInWithOAuth[0] as [{ provider: string; options: { redirectTo: string } }])[0];
  assert.equal(args.provider, "google");
  assert.equal(args.options.redirectTo, "https://app.test/auth/callback?next=%2F");
});

test("email sign-in returns the user; bad credentials and unconfirmed email are mapped", async () => {
  const ok = createSupabaseAuthService(fakeClient().client, opts);
  assert.equal((await ok.signInWithEmail("a@b.co", "pw")).uid, "u1");

  const bad = createSupabaseAuthService(
    fakeClient({ signInWithPassword: async () => ({ data: { user: null }, error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } }) }).client, opts);
  await assert.rejects(() => bad.signInWithEmail("a@b.co", "x"), (e: AuthServiceError) => e.code === "invalid-credential");

  const unconfirmed = createSupabaseAuthService(
    fakeClient({ signInWithPassword: async () => ({ data: { user: null }, error: { code: "email_not_confirmed", status: 400, message: "Email not confirmed" } }) }).client, opts);
  await assert.rejects(() => unconfirmed.signInWithEmail("a@b.co", "x"), (e: AuthServiceError) => e.code === "email-not-confirmed");
});

test("sign-up: confirmation required, existing address detected, weak password mapped", async () => {
  const f = fakeClient();
  const res = await createSupabaseAuthService(f.client, opts).signUpWithEmail("n@b.co", "Passw0rdX");
  assert.equal(res.needsEmailConfirmation, true);
  const args = (f.calls.signUp[0] as [{ options: { emailRedirectTo: string } }])[0];
  assert.equal(args.options.emailRedirectTo, "https://app.test/auth/callback?next=%2Fonboarding");

  const dup = createSupabaseAuthService(
    fakeClient({ signUp: async () => ({ data: { user: { id: "z", identities: [] }, session: null }, error: null }) }).client, opts);
  await assert.rejects(() => dup.signUpWithEmail("n@b.co", "Passw0rdX"), (e: AuthServiceError) => e.code === "email-already-in-use");

  const weak = createSupabaseAuthService(
    fakeClient({ signUp: async () => ({ data: { user: null, session: null }, error: { code: "weak_password", status: 422, message: "weak" } }) }).client, opts);
  await assert.rejects(() => weak.signUpWithEmail("n@b.co", "a"), (e: AuthServiceError) => e.code === "weak-password");
});

test("password reset sends the redirect to the reset page and maps rate limits", async () => {
  const f = fakeClient();
  await createSupabaseAuthService(f.client, opts).sendPasswordReset("a@b.co");
  const [email, o] = f.calls.resetPasswordForEmail[0] as [string, { redirectTo: string }];
  assert.equal(email, "a@b.co");
  assert.equal(o.redirectTo, "https://app.test/auth/callback?next=%2Fauth%2Freset-password");

  const limited = createSupabaseAuthService(
    fakeClient({ resetPasswordForEmail: async () => ({ data: null, error: { code: "over_email_send_rate_limit", status: 429, message: "x" } }) }).client, opts);
  await assert.rejects(() => limited.sendPasswordReset("a@b.co"), (e: AuthServiceError) => e.code === "rate-limited");
});

test("sign-out and update password call the client", async () => {
  const f = fakeClient();
  const svc = createSupabaseAuthService(f.client, opts);
  await svc.updatePassword("NewPassw0rd");
  await svc.signOut();
  assert.deepEqual((f.calls.updateUser as unknown[][])[0], [{ password: "NewPassw0rd" }]);
  assert.equal(f.calls.signOut.length, 1);
});

test("error mappers and redirect guard", () => {
  assert.equal(mapFirebaseAuthError({ code: "auth/wrong-password" }).code, "invalid-credential");
  assert.equal(mapFirebaseAuthError({ code: "auth/popup-closed-by-user" }).code, "popup-closed");
  assert.equal(mapFirebaseAuthError({ code: "auth/email-already-in-use" }).code, "email-already-in-use");
  assert.equal(mapFirebaseAuthError(new Error("x")).code, "unknown");
  assert.equal(mapSupabaseAuthError({ status: 429 }).code, "rate-limited");
  assert.equal(mapSupabaseAuthError({ code: "otp_expired" }).code, "expired-link");
  assert.equal(safeNextPath("/onboarding"), "/onboarding");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath(null, "/x"), "/x");
});
