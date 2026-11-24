// Cloudflare Workers build config (used only by `npm run cf:build`).
// Vercel ignores this file; `next build` is unchanged.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Inlined into the browser bundle at build time, so it has to be here rather than a Worker
// secret. It is the public half of the push key pair, the same one the Vercel build uses, so a
// subscription made on either address works with the scheduled pushes. Not a secret: every
// visitor's browser receives it.
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??= "BLFIje_bsCVsBcy6XkFjytwRYMj4tYi5XIFrfsKfrj16j9VogQv2l0trqiQY_UE2JPsOyu5IpNqdnjJndbY9jRM";

export default defineCloudflareConfig({
  // Prerendered pages are served from the static assets. No R2/KV needed,
  // so this stays on the free Workers plan.
  incrementalCache: staticAssetsIncrementalCache,
});
