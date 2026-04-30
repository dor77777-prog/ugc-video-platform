// V13.2 — admin guard for API route handlers.
//
// `requireAdmin` (lib/auth/sync-user.ts) is for pages — it redirects
// non-admins to /dashboard. API endpoints can't redirect; they need
// to return JSON with a 401/403. This helper does that, and is what
// every /api/admin/* route should use.

import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AdminAuthOk {
  ok: true;
  userId: string;
  email: string;
}

export type AdminAuthResult =
  | AdminAuthOk
  | { ok: false; response: NextResponse };

export async function requireAdminApi(): Promise<AdminAuthResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'auth not configured' }, { status: 401 }),
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { id: true, email: true, role: true, banned: true },
  });
  if (!dbUser || dbUser.banned) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }
  if (dbUser.role !== UserRole.admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'admin only' }, { status: 403 }),
    };
  }
  return { ok: true, userId: dbUser.id, email: dbUser.email };
}
