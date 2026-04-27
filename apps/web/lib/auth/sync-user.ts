import { redirect } from 'next/navigation';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect('/login');
  return user;
}

// Returns the Prisma User row. Race-safe: if two concurrent requests both try to
// create the same user (Next.js does parallel server fetches), the second one
// catches the unique-violation and re-reads instead of crashing.
export async function getOrCreateAppUser() {
  const authUser = await requireAuth();
  const email = authUser.email!.toLowerCase();
  const adminEmails = getAdminEmails();
  const isAdminEmail = adminEmails.includes(email);

  let dbUser = await prisma.user.findUnique({ where: { email } });

  if (!dbUser) {
    const totalUsers = await prisma.user.count();
    const isFirstUser = totalUsers === 0;
    const role: UserRole = isFirstUser || isAdminEmail ? UserRole.admin : UserRole.user;
    try {
      dbUser = await prisma.user.create({
        data: { email, role, creditsBalance: 5 },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        dbUser = await prisma.user.findUniqueOrThrow({ where: { email } });
      } else {
        throw err;
      }
    }
  }

  // Bootstrap: if no admin exists, promote the current user.
  // Also keep ADMIN_EMAILS in sync — anyone listed there is always admin on next login.
  const noAdminYet =
    dbUser.role !== UserRole.admin &&
    (await prisma.user.count({ where: { role: UserRole.admin } })) === 0;
  if ((isAdminEmail || noAdminYet) && dbUser.role !== UserRole.admin) {
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: { role: UserRole.admin },
    });
  }

  if (dbUser.banned) redirect('/login?error=banned');

  return { authUser, dbUser };
}

// Same as getOrCreateAppUser but redirects non-admins to /dashboard.
export async function requireAdmin() {
  const result = await getOrCreateAppUser();
  if (result.dbUser.role !== UserRole.admin) redirect('/dashboard');
  return result;
}
