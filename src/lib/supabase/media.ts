/**
 * Placeholder media URL helper. Media lives in Cloudflare R2 and the DB stores object keys only.
 * Later phases replace this with presigned GET URLs (docs/SUPABASE_PLAN.md section 4); until then a
 * configured NEXT_PUBLIC_MEDIA_BASE_URL is used and a missing one yields undefined (no avatar).
 */
export function mediaUrl(key: string | null | undefined, base: string | undefined = process.env.NEXT_PUBLIC_MEDIA_BASE_URL): string | undefined {
  return key && base ? `${base.replace(/\/$/, "")}/${key}` : undefined;
}
