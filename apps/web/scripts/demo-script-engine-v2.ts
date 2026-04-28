// One-fixture demo for Script Engine V2 — prints a single script in full so
// the user can see the V2 output shape (creative_strategy, hook_options,
// scene_goal per scene, quality_score breakdown).

import dotenv from 'dotenv';
import path from 'path';
import { generateScripts } from '../lib/llm/scripts';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing in .env');
    process.exit(1);
  }

  const out = await generateScripts({
    productName: 'סרום ויטמין C מוקצף',
    brand: 'Glow Lab',
    description:
      'סרום פנים יומי המבוסס על ויטמין C יציב בריכוז 15%, חומצה היאלורונית ופרוביוטיקה. מיועד לעור עייף, להפחתת כתמי שמש, חידוש קולגן והבהרה כללית. מתאים לבוקר, מתחת לקרם לחות. בקבוקון 30 מ"ל.',
    targetAudience: 'נשים 28-45 שמרגישות שהעור איבד את הזוהר אחרי לידות / שינה לקויה',
    durationSeconds: 30,
    price: '189',
    currency: 'שקלים',
    avatarDescription: 'late-twenties Israeli woman (region: Tel Aviv, style: casual)',
    categoryId: 'skincare',
    categoryLabel: 'skincare',
    categoryGuidance: 'mirror selfies, vanity, bathroom. אור בוקר רך.',
  });

  // Pick the highest-scoring script for the demo.
  const top = [...out.scripts].sort(
    (a, b) => b.qualityScore.overall - a.qualityScore.overall,
  )[0]!;
  console.log(JSON.stringify(top, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
