<div align="center">

# tachles

### `מודעות וידאו שמוכרות. תכל'ס.`

**Hebrew-first AI platform for Israeli UGC product video ads.**
*From a product URL to a finished 9:16 MP4 ad in 4–7 minutes.*

<br />

[![Made for Israel](https://img.shields.io/badge/made%20for-🇮🇱%20israel-0052a5?style=for-the-badge)]()
[![Hebrew RTL](https://img.shields.io/badge/hebrew-RTL%20native-7c3aed?style=for-the-badge)]()
[![Output](https://img.shields.io/badge/output-9%3A16%20MP4-ec4899?style=for-the-badge)]()
[![Stack](https://img.shields.io/badge/stack-Next.js%2015%20%2B%20React%2019-000?style=for-the-badge&logo=nextdotjs)]()
[![License](https://img.shields.io/badge/license-Proprietary-orange?style=for-the-badge)]()

</div>

---

## ✨ What you get

> Paste a product URL. Walk away. Come back to a polished short-form video ad — voice-over, lip-sync, captions, music, all locked.

Built **specifically** for the Israeli market:

- 🇮🇱 **Hebrew-first** — natural Israeli register (תכל'ס / סבבה / וואלה), not translated American copy.
- 🎭 **25 local avatars** — regional + religious-register profiles baked in.
- 🎙️ **30 native voices** — male / female, young / older, calm / energetic.
- 🏙️ **Israeli visual cues** — real local details, not generic Pexels stock.
- 📱 **9:16 MP4 out** — TikTok / Reels / Shorts / WhatsApp Status ready.

---

## 🎬 The flow

<table>
<tr>
<td width="50">1️⃣</td>
<td><b>Paste a product URL</b><br/>We extract title, description, hero image, audience hints.</td>
</tr>
<tr>
<td>2️⃣</td>
<td><b>Pick an avatar</b><br/>25 Israeli personas across regions (TLV / JLM / Haifa) and registers (secular / traditional / religious).</td>
</tr>
<tr>
<td>3️⃣</td>
<td><b>6 scripts in parallel</b><br/>Different angles — pain/solution, skeptical, demonstration, price anchor, relatable moment, direct response. Pick or edit.</td>
</tr>
<tr>
<td>4️⃣</td>
<td><b>Generate scene images</b><br/>Israeli look & feel — real local cues, accurate clothing, environment, framing.</td>
</tr>
<tr>
<td>5️⃣</td>
<td><b>Hebrew voice-over</b><br/>30 voices, word-level timing, ready for lip-sync.</td>
</tr>
<tr>
<td>6️⃣</td>
<td><b>Animate each scene</b><br/>Static image → 5-second motion clip. Lip-sync runs automatically when faces are visible.</td>
</tr>
<tr>
<td>7️⃣</td>
<td><b>Final composition</b><br/>Concat clips, mix in background music at safe volume, burn RTL captions perfectly aligned to the audio. Ship MP4.</td>
</tr>
</table>

---

## 💳 Plans

<table align="center">
<thead><tr>
<th>Plan</th><th>Credits / mo</th><th>Price</th><th>For</th>
</tr></thead>
<tbody>
<tr><td><b>Free trial</b></td><td>30 one-time</td><td>—</td><td>Try it without commitment.</td></tr>
<tr><td><b>Creator</b></td><td>500</td><td>$49 / mo</td><td>Solo creators &amp; small brands.</td></tr>
<tr><td><b>Brand</b></td><td>1,800</td><td>$149 / mo</td><td>In-house teams running multiple campaigns.</td></tr>
<tr><td><b>Agency</b></td><td>6,000</td><td>$499 / mo</td><td>Agencies serving multiple clients.</td></tr>
</tbody>
</table>

> **First regeneration of any image or voice — free.**
> Per-user rate limits + a daily spend cap protect against runaway burn from double-clicks.

---

## ⚙️ Stack

<div align="center">

| Layer | Tech |
|:--|:--|
| **Web** | Next.js 15 (App Router) · React 19 · Tailwind 3.4 · shadcn/ui · RTL Hebrew |
| **Worker** | Node 20+ · BullMQ 5 · ioredis · Docker on Railway |
| **DB** | PostgreSQL · Prisma 6 · Supabase (Mumbai) |
| **Queue** | Redis Cloud |
| **Storage** | Cloudflare R2 (S3-compatible) |
| **Auth** | Supabase Auth |
| **Composition** | ffmpeg on the worker host → MP4 → R2 |

</div>

Hebrew rendering everywhere is **bidi-correct via libass + unicode**.
Mixed Hebrew + English captions isolate properly. The pipeline never
ships a sentence with the wrong-side punctuation.

---

## 🗂️ Project layout

```
ugc-video-platform/
├── apps/
│   ├── web/          Next.js app (App Router + API routes)
│   └── worker/       BullMQ worker (final video composition)
├── packages/
│   ├── shared/       Music library, caption builders, shared types
│   └── prompts/      Script + scene prompt templates
└── prisma/           Schema + migrations (9 models, 6 enums)
```

---

## 🚀 Development

```bash
# install
npm install

# run web + worker
npm run dev:web         # Next.js dev server (port 3000)
npm run dev:worker      # BullMQ worker, tsx watch mode

# checks
npm run typecheck       # all 4 workspaces
npm run prisma:migrate  # apply DB migrations
```

Required env vars are documented in `.env.example`.

---

## 🔐 Security

The platform takes security seriously:

- ✅ **Zero raw SQL** — all DB access is parameterized via Prisma.
- ✅ **Server-side rate limits** — per-user, per-operation.
- ✅ **Daily spend cap** — operator-tunable per user.
- ✅ **Auth on every API route** — middleware doesn't blind-trust `/api/*`.
- ✅ **Ownership checks** — every per-resource endpoint verifies the requester owns the resource.
- ✅ **SSRF-hardened scraping** — IP / hostname / redirect-chain validation against private ranges.
- ✅ **Admin-scoped routes** — separate gate for `/api/admin/*`.

Internal pipeline + architecture docs are kept private — only the
public-facing description is in this repo.

---

## 📄 License

**Proprietary.** All rights reserved.

<div align="center">
<br />
<sub>Built with care for Israeli founders, marketers, and creators.</sub>
<br />
<sub><b>תכל'ס. בלי שטויות. רק וידאו שמוכר.</b></sub>
</div>
