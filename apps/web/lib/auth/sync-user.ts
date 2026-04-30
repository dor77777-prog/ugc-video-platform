import { redirect } from 'next/navigation';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { timed } from '@/lib/timing';
import { getCachedUser, setCachedUser } from './user-cache';

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Returns the Supabase auth user. Redirects to /login if unauthenticated
// or if Supabase isn't configured.
export async function requireAuth() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/login');
  }
  const supabase = await timed('auth:createServerClient', () => createSupabaseServerClient());
  const {
    data: { user },
  } = await timed('auth:getUser', () => supabase.auth.getUser());
  if (!user || !user.email) redirect('/login');
  return user;
}

// Returns the Prisma User row. Race-safe: if two concurrent requests both try to
// create the same user (Next.js does parallel server fetches), the second one
// catches the unique-violation and re-reads instead of crashing.
//
// V14.2-A: short-lived in-process cache (10s TTL) keyed by Supabase auth id.
// Hot polling endpoints get a cache hit on every tick after the first; ban
// changes + role promotions become eventually-consistent within 10s, and
// credit mutations explicitly invalidate via invalidateUserCacheById from
// `lib/usage/credits.ts` so a deduction is reflected immediately.
export async function getOrCreateAppUser() {
  return timed('auth:getOrCreateAppUser:total', async () => {
    const authUser = await requireAuth();

    // Cache fast-path — skips email-keyed user lookup + admin promotion +
    // ban check entirely. Cached entries are bounded by TTL (user-cache.ts).
    const cached = getCachedUser(authUser.id);
    if (cached) {
      if (cached.banned) redirect('/login?error=banned');
      return { authUser, dbUser: cached };
    }

    const email = authUser.email!.toLowerCase();
    const adminEmails = getAdminEmails();
    const isAdminEmail = adminEmails.includes(email);

    let dbUser = await timed('auth:user.findUnique', () =>
      prisma.user.findUnique({ where: { email } }),
    );

    if (!dbUser) {
      const totalUsers = await timed('auth:user.count', () => prisma.user.count());
      const isFirstUser = totalUsers === 0;
      const role: UserRole = isFirstUser || isAdminEmail ? UserRole.admin : UserRole.user;
      try {
        dbUser = await timed('auth:user.create', () =>
          prisma.user.create({ data: { email, role, creditsBalance: 5 } }),
        );
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          dbUser = await timed('auth:user.findOrThrow', () =>
            prisma.user.findUniqueOrThrow({ where: { email } }),
          );
        } else {
          throw err;
        }
      }
    }

    // Bootstrap: if no admin exists, promote the current user.
    const noAdminYet =
      dbUser.role !== UserRole.admin &&
      (await timed('auth:adminCount', () =>
        prisma.user.count({ where: { role: UserRole.admin } }),
      )) === 0;
    if ((isAdminEmail || noAdminYet) && dbUser.role !== UserRole.admin) {
      dbUser = await timed('auth:user.promoteToAdmin', () =>
        prisma.user.update({ where: { id: dbUser!.id }, data: { role: UserRole.admin } }),
      );
    }

    if (dbUser.banned) redirect('/login?error=banned');

    // Cache for the next 10s. Mutations elsewhere call
    // invalidateUserCacheById() to drop this entry early.
    setCachedUser(authUser.id, dbUser);

    return { authUser, dbUser };
  });
}

// Same as getOrCreateAppUser but redirects non-admins to /dashboard.
export async function requireAdmin() {
  const result = await getOrCreateAppUser();
  if (result.dbUser.role !== UserRole.admin) redirect('/dashboard');
  return result;
}
