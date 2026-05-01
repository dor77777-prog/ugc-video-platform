---
name: xai-video-api
description: xAI / Grok video generation API reference — image-to-video for tachles V26 alongside Kling. Source of truth when implementing or debugging the Grok provider.
license: docs scraped from docs.x.ai (May 2026)
---

# xAI Video Generation API

## Auth

```
Authorization: Bearer {XAI_API_KEY}
Content-Type: application/json
```

`XAI_API_KEY` is in `apps/web` env (Vercel + Railway + .env). Never log or commit.

## Models

- **`grok-imagine-video`** — only model exposed for video as of May 2026. Supports text-to-video, image-to-video, reference-to-video, video-editing, video-extension.

## Endpoints

| Operation | Verb + Path |
|---|---|
| Submit (text/image/reference → video) | `POST https://api.x.ai/v1/videos/generations` |
| Edit existing video | `POST https://api.x.ai/v1/videos/edits` |
| Extend existing video | `POST https://api.x.ai/v1/videos/extensions` |
| Poll status | `GET https://api.x.ai/v1/videos/{request_id}` |

## Submit (image-to-video — tachles primary use)

```jsonc
{
  "model": "grok-imagine-video",
  "prompt": "Hebrew/English motion description",
  "image": "https://pub-eb116....r2.dev/scenes/.../image.png",  // OR base64 data URI
  "duration": 5,                    // 1-15 seconds (generation); 2-10 (extensions)
  "aspect_ratio": "9:16",          // 1:1 | 16:9 | 9:16 | 4:3 | 3:4 | 3:2 | 2:3
  "resolution": "720p"             // "480p" (default, faster) | "720p" (HD)
}
```

Image input accepts:
- **Public HTTPS URL** (R2 CDN URLs work — that's what we use).
- **Base64 data URI** (`data:image/jpeg;base64,...`) for uploading from a buffer.

## Submit response (async)

```json
{ "request_id": "..." }
```

**Always async — must poll.**

## Poll response

```jsonc
{
  "status": "pending" | "done" | "expired" | "failed",
  "model": "grok-imagine-video",
  "video": {                       // only present when status = "done"
    "url": "https://vidgen.x.ai/.../video.mp4",
    "duration": 5,
    "respect_moderation": true
  }
}
```

**URLs are EPHEMERAL** — download the MP4 to R2 immediately on success; don't store the xAI URL long-term.

## Reference-to-video

Up to N reference images, prompt uses `<IMAGE_1>` / `<IMAGE_2>` placeholders:

```jsonc
{
  "model": "grok-imagine-video",
  "prompt": "<IMAGE_1> walks toward <IMAGE_2>",
  "reference_images": [
    { "url": "https://..." },
    { "url": "https://..." }
  ],
  "duration": 5,
  "aspect_ratio": "9:16"
}
```

## Edit / Extend

```jsonc
// edit
{ "model": "grok-imagine-video", "prompt": "...", "video_url": "https://..." }
// duration / aspect_ratio / resolution inherited from source (capped 720p)

// extend
{ "model": "grok-imagine-video", "prompt": "...", "duration": 5, "video": { "url": "..." } }
// duration is the EXTENSION length; final = original + extension
```

## Tachles integration notes

- For step-5 image-to-video: use `POST /v1/videos/generations` with `image: <R2 URL>` and `aspect_ratio: "9:16"`.
- Default `duration: 5` matches Kling's clip length; default `resolution: "720p"` for premium output.
- Poll every 3-5s. Cap at 5 min wall-clock (matches `clipInFlightAt` TTL).
- On `status: "done"`, fetch `video.url`, upload to R2 (it's ephemeral), persist URL on `Scene.clipUrl`.
- On `status: "failed"` or `"expired"`, refund the credit and surface the curated Hebrew error.

## No balance API

Like Google's Generative Language API, xAI doesn't expose a per-key billing endpoint. Admin /admin/costs uses the V12.6 ProviderFallbackCard with local ApiCall aggregates.

## Pricing (placeholder — verify in xAI Console)

xAI publishes per-second pricing for video. As of docs scrape (May 2026) numbers weren't on the public page; verify in the xAI Console → Billing.

Tachles defaults (override via env vars):
- 480p: `XAI_VIDEO_PRICE_PER_SEC_480P_USD` default `0.08`
- 720p: `XAI_VIDEO_PRICE_PER_SEC_720P_USD` default `0.15`

A 5s clip at 720p ≈ $0.75, comparable to Kling's $0.79 — designed so per-credit pricing stays roughly the same across providers.
