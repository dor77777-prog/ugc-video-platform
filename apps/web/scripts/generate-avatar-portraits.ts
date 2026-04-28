// One-time script: generate 16 distinct AI portraits to seed the avatar catalog.
//
// Why: gpt-image-2 has built-in safeguards that avoid producing close
// likenesses of real-people input photos (the previous catalog used real
// stock photos), so we replace them with AI-generated portraits which the
// model will preserve faithfully across scene generations.
//
// Run from apps/web:
//   npx tsx scripts/generate-avatar-portraits.ts
//
// Idempotent: skips files that already exist in public/avatars/.

import dotenv from 'dotenv';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface AvatarSpec {
  id: string;
  prompt: string;
}

const SPECS: AvatarSpec[] = [
  {
    id: 'noa',
    prompt: `Photorealistic candid portrait, vertical 9:16, shot on a real phone in natural daylight. A 22-year-old Israeli woman in her sun-lit Tel Aviv apartment kitchen. Light olive skin, wavy chestnut-brown hair down to her shoulders, warm brown eyes, slight relaxed smile. She wears a soft cream T-shirt. Eye-level framing, soft window light from the side, mid-morning. No glamour, no studio polish — she looks like a real person caught mid-conversation. Single subject centered, no text, no logos, no watermark.`,
  },
  {
    id: 'shira',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 23-year-old athletic Israeli woman on a Tel Aviv rooftop in the late morning. Tan skin, sun-bleached dirty-blonde hair tied in a high ponytail with a few loose strands, hazel-green eyes, bright direct gaze. She wears a fitted black sports tank top. Eye-level, bright natural sunlight, slightly windswept hair. Confident, real, unposed. No text, no logos, no watermark.`,
  },
  {
    id: 'tamar',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 27-year-old Israeli woman seated at a Tel Aviv café. Olive skin, dark almond-shaped eyes, shoulder-length straight dark brown hair tucked behind one ear, small silver hoop earrings. She wears an oversized cream button-up shirt over a white tee. Warm afternoon café light, soft bokeh of an espresso machine and wood texture behind her. Calm, slightly amused expression. No text, no logos.`,
  },
  {
    id: 'maya',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 28-year-old Israeli woman with a free-spirited lifestyle look, on a balcony in Haifa overlooking the bay. Medium light-brown skin, voluminous curly black hair, hazel eyes, small gold hoop earrings. She wears a flowy ivory linen dress with a tiny floral print. Late afternoon golden-hour light catching her hair, sea haze in the distance. Genuine warm grin. No text, no logos.`,
  },
  {
    id: 'liat',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 35-year-old Israeli professional woman in a modern Tel Aviv co-working space. Light olive skin, sleek dark brown hair pulled into a low neat bun, subtle tortoise-shell glasses, focused brown eyes, no smile. She wears a tailored navy blazer over a plain white tee. Soft directional window light from her left, blurred clean office in the background. Composed, intelligent. No text, no logos.`,
  },
  {
    id: 'ortal',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 36-year-old Israeli woman in her Ramat Gan apartment, soft mid-morning light. Olive skin with light freckles across the nose, shoulder-length wavy auburn hair with subtle natural highlights, expressive gray-green eyes, dimples when she smiles slightly. She wears a chunky oatmeal-colored knit sweater. Warm lived-in vibe, real apartment behind her with bookshelves slightly out of focus. No text, no logos.`,
  },
  {
    id: 'einat',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 45-year-old Israeli woman, professional look, in a clean office environment. Olive skin with very fine laugh lines around the eyes, neat shoulder-length dark brown hair with a few visible silver strands at the temples, dark-rimmed cat-eye glasses, hazel eyes. She wears a fitted charcoal-gray blouse. Confident, kind expression. Soft indirect light, neutral background. No text, no logos.`,
  },
  {
    id: 'galit',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 56-year-old Israeli woman on a Jerusalem-stone balcony with potted herbs and a few bougainvillea. Warm tan skin, natural silver-gray hair styled in a soft layered cut, warm brown eyes, deep laugh lines, gentle smile. She wears a comfortable terracotta cardigan over a beige tee, simple silver chain. Late afternoon golden light. Welcoming, lived-in expression. No text, no logos.`,
  },
  {
    id: 'yoav',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 24-year-old Israeli man in his Tel Aviv apartment. Olive skin, short dark brown hair with a slight wave on top, a light 3-day stubble, deep warm brown eyes, relaxed expression. He wears a faded heather-gray T-shirt. Natural side light from a window, casual unposed posture. No text, no logos.`,
  },
  {
    id: 'omri',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 23-year-old athletic Israeli man at an urban gym. Light brown skin, shaved head, defined jawline with a thin trimmed beard, focused dark eyes, slight sweat sheen. He wears a plain black sleeveless training tank. Mid-workout candid, direct strong gaze. Industrial gym backdrop with rubber mats and dumbbells out of focus. No text, no logos.`,
  },
  {
    id: 'ron',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 28-year-old Israeli man on a balcony with potted plants in Tel Aviv. Olive skin, medium-length curly dark brown hair, full neat dark beard, warm brown eyes, slight smile. He wears a plain forest-green T-shirt. Soft warm morning light, relaxed seated posture. No text, no logos.`,
  },
  {
    id: 'ido',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 27-year-old Israeli man at a Haifa café in a coastal afternoon. Tan skin, slightly tousled medium-length wavy black hair, light scruff, expressive dark eyes. He wears a soft denim button-up over a plain white tee. Soft outdoor café light, faint ocean haze in the distant background. Thoughtful, with a slight smirk. No text, no logos.`,
  },
  {
    id: 'eran',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 35-year-old Israeli professional man in a modern co-working space. Light olive skin, neat short dark hair with a clean side part, fine wire-frame glasses, well-groomed short beard. He wears a crisp light-blue button-up shirt. Indirect soft window light from the side. Confident, slightly amused expression. No text, no logos.`,
  },
  {
    id: 'avi',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 38-year-old Israeli man at home in Ramat Gan. Tan skin, shaved head, full thick black beard with a few gray streaks, warm brown eyes, calm expression. He wears a worn-in plain black T-shirt with no logo. Soft afternoon light from a window. Relaxed, slightly tired in a real-life way, totally natural. No text, no logos.`,
  },
  {
    id: 'gil',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 47-year-old Israeli man in a professional setting. Tan skin, salt-and-pepper short hair, dark trim beard with visible gray patches, intelligent dark eyes, subtle reading glasses pushed up on his forehead. He wears a deep-navy blazer over a charcoal henley. Soft directional light. Composed, deliberate. No text, no logos.`,
  },
  {
    id: 'moshe',
    prompt: `Photorealistic candid portrait, vertical 9:16. A 58-year-old Israeli man in a Jerusalem courtyard with cream stone walls and bougainvillea behind him. Warm light olive skin, short clean white hair, full thick white beard, kind crinkly blue-gray eyes, soft warm smile. He wears a soft red flannel shirt. Late afternoon warm light. Wise, kind, lived-in. No text, no logos.`,
  },

  // ── New diverse Israeli additions ──────────────────────────────────────────
  // Each prompt opens with explicit phone-camera framing (awesome-gpt-image-2
  // No.8 pattern) and asks for bio-fidelity skin so gpt-image-2 doesn't
  // smooth/airbrush the face — important when these portraits become the
  // identity reference for every downstream scene generation.
  {
    id: 'yael',
    prompt: `Photorealistic candid portrait, vertical 9:16, shot on a real phone (iPhone 17 Pro vibe, ~35mm, f/4, authentic phone-camera grain). A 19-year-old Israeli woman with a Mizrahi look, in her sun-lit Be'er Sheva student apartment with a desk and books slightly out of focus behind her. Warm tan-olive skin, very long dark almost-black wavy hair past her shoulders, deep dark brown eyes, full natural eyebrows, a tiny silver nose stud, a relaxed half-smile. She wears an oversized cream university sweatshirt. Eye-level framing, soft side window light, late morning. Bio-fidelity skin: visible pores, faint cheek freckles, real micro-detail, no airbrush. Single subject centered. No text, no logos, no watermark.`,
  },
  {
    id: 'adi',
    prompt: `Photorealistic candid portrait, vertical 9:16, real phone camera (~35mm, f/4, authentic grain). A 21-year-old Ethiopian-Israeli woman on the Tel Aviv promenade after a morning run. Rich deep-brown skin, natural Type-4 coily hair pulled into a high puff with a thin black headband and a few escaping curls at the hairline, warm dark brown eyes, full lips, light sweat sheen on her temples, a delicate gold pendant on a thin chain, bright easy smile. She wears a fitted white tech-tank. Eye-level, mid-morning Mediterranean sunlight, blurred palm trees and a strip of sea behind her. Bio-fidelity skin: visible pores, hydrated highlights, real shine — no smoothing. Single subject centered. No text, no logos.`,
  },
  {
    id: 'inbar',
    prompt: `Photorealistic candid portrait, vertical 9:16, iPhone-camera realism (~35mm, f/4, soft authentic grain). A 24-year-old Russian-Israeli woman in a bright north-Tel-Aviv apartment with floor-to-ceiling windows. Very fair pale skin with cool undertone, long straight ash-blonde hair past her collarbones with a soft middle part, pale icy-blue eyes, faint freckles across the bridge of her nose, calm slightly serious expression, no makeup. She wears a plain pearl-gray fitted long-sleeve tee. Eye-level, soft overcast window light from her left. Bio-fidelity skin: vellus hair on cheeks, real pore texture, refined natural highlights — totally unretouched. Single subject centered. No text, no logos.`,
  },
  {
    id: 'avigail',
    prompt: `Photorealistic candid portrait, vertical 9:16, real phone camera (~35mm, f/4, authentic grain). A 29-year-old Israeli woman in a modest traditional dati-leumi style, in a bright Modi'in apartment with white walls and warm wood accents. Warm light olive skin, hair fully covered by a soft cream knit-tichel headwrap, a few stray light-brown strands at the temples, calm hazel-brown eyes, thin gold stud earrings, a small natural beauty mark near her right cheek, a composed half-smile. She wears a high-neck soft mauve long-sleeve top. Eye-level framing, soft afternoon window light. Bio-fidelity skin: visible pores, refined highlights, real hydration — no airbrush, no glamour. Single subject centered. No text, no logos.`,
  },
  {
    id: 'sapir',
    prompt: `Photorealistic candid portrait, vertical 9:16, iPhone 17 Pro vibe (~35mm, f/4, authentic grain). A 32-year-old Yemeni-Israeli woman in her sun-lit Florentin apartment in Tel Aviv. Warm deep olive skin, thick almost-black curly hair down past her shoulders with natural volume and frizz at the edges, large expressive dark brown eyes, defined dark eyebrows, a delicate gold filigree pendant on a thin chain, gentle genuine smile. She wears a relaxed black ribbed tank. Eye-level framing, late-afternoon golden window light catching the curls. Bio-fidelity skin: pores, faint laugh lines, real shine, no smoothing. Single subject centered. No text, no logos.`,
  },
  {
    id: 'hila',
    prompt: `Photorealistic candid portrait, vertical 9:16, real phone camera (~35mm, f/4, soft authentic grain). A 42-year-old Israeli woman on the porch of her Galilee kibbutz home, with olive trees and herb pots slightly blurred behind her. Warm tanned outdoors skin, sun-lightened wavy chestnut-brown hair to her shoulders with a few sun-bleached strands and faint flyaways, hazel-green eyes, fine sun-lines at the corners, no makeup, natural relaxed smile. She wears a faded sage-green linen button-up over a plain tee. Eye-level framing, late-afternoon golden hour. Bio-fidelity skin: pores, real freckles, sun-warmth — totally unretouched. Single subject centered. No text, no logos.`,
  },
  {
    id: 'tomer',
    prompt: `Photorealistic candid portrait, vertical 9:16, iPhone-camera realism (~35mm, f/4, authentic phone-camera grain). A 19-year-old Israeli man with a southern surfer look, on an Eilat beach late afternoon. Sun-tanned olive skin, sun-bleached medium-length wavy dark-blonde hair slightly damp from the sea, light hazel-green eyes, very faint stubble, a relaxed easy half-smile, a hint of salt and sand on his shoulders. He wears a soft sun-faded coral T-shirt. Eye-level framing, low warm Eilat sun lighting his face from the side, Red Sea blur in the background. Bio-fidelity skin: pores, real sun glow, fine sun-lines at the temples — no studio polish. Single subject centered. No text, no logos.`,
  },
  {
    id: 'itay',
    prompt: `Photorealistic candid portrait, vertical 9:16, real phone camera (~35mm, f/4, authentic grain). A 33-year-old Israeli man at home in a Haifa apartment with warm afternoon light. Light olive skin, short dark brown hair with a slight side wave and a couple of premature gray strands at the temples, neat short beard, warm brown eyes, a calm tired-but-content dad expression, a thin band ring on his left hand. He wears a soft heather-gray long-sleeve tee. Eye-level framing, soft side window light from the right. Bio-fidelity skin: pores, fine fatigue lines under the eyes, real warmth — totally unposed. Single subject centered. No text, no logos.`,
  },
  {
    id: 'yosef',
    prompt: `Photorealistic candid portrait, vertical 9:16, iPhone 17 Pro vibe (~35mm, f/4, authentic grain). A 52-year-old Israeli man with a Mizrahi look, in a Jerusalem-stone courtyard with a small lemon tree behind him. Warm tan-bronze skin, neat short salt-and-pepper hair (mostly dark with silver at the temples), full thick dark beard with visible gray patches, warm hazel-brown eyes, deep laugh lines, a small Star-of-David pendant on a leather cord, a gentle dignified smile. He wears a soft charcoal henley. Eye-level framing, late-afternoon warm light bouncing off cream stone walls. Bio-fidelity skin: pores, real sun lines, character — no airbrush. Single subject centered. No text, no logos.`,
  },
];

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'avatars');
const SIZE = '1024x1536' as const; // portrait — costs $0.041 medium, fine for catalog use
const QUALITY = 'medium' as const;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set in .env');
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`\nGenerating up to ${SPECS.length} avatars (${SIZE} ${QUALITY}) using ${model}\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const PRICE_PER_IMAGE = 0.041;

  for (const spec of SPECS) {
    const filePath = path.join(OUTPUT_DIR, `${spec.id}.png`);
    try {
      await fs.access(filePath);
      console.log(`⏭  ${spec.id.padEnd(8)} already exists, skipping`);
      skipped++;
      continue;
    } catch {
      // file doesn't exist — generate
    }

    const startedAt = Date.now();
    try {
      const result = await openai.images.generate({
        model,
        prompt: spec.prompt,
        size: SIZE,
        quality: QUALITY,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('no base64 in response');

      await fs.writeFile(filePath, Buffer.from(b64, 'base64'));
      generated++;
      const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`✅ ${spec.id.padEnd(8)} saved (${dur}s)`);
    } catch (err) {
      failed++;
      console.error(`❌ ${spec.id.padEnd(8)} failed: ${(err as Error).message}`);
    }
  }

  const totalSpent = generated * PRICE_PER_IMAGE;
  console.log(
    `\nDone. generated=${generated}  skipped=${skipped}  failed=${failed}  ` +
      `total=$${totalSpent.toFixed(2)}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
