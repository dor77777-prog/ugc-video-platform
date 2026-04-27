import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scrape, ScrapeFetchError } from '@/lib/scraper';
import { requireAuth } from '@/lib/auth/sync-user';

const bodySchema = z.object({
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  await requireAuth();

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await scrape(parsed.data.url);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ScrapeFetchError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === 'private_host' || err.code === 'invalid_url' ? 400 : 502 },
      );
    }
    return NextResponse.json(
      { error: 'scrape_failed', message: (err as Error).message },
      { status: 500 },
    );
  }
}
