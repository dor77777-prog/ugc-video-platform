import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

  if (!user || !user.email) {
    redirect('/login');
  }

  return user;
}

// Returns the Prisma User row. Creates one on first login.
export async function getOrCreateAppUser() {
  const authUser = await requireAuth();

  const dbUser = await prisma.user.upsert({
    where: { email: authUser.email! },
    update: {},
    create: {
      email: authUser.email!,
      // Generous starting credits while the platform is in alpha.
      creditsBalance: 5,
    },
  });

  return { authUser, dbUser };
}
