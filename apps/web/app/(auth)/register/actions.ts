'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type RegisterState =
  | { error?: string; success?: boolean; needsEmailConfirmation?: boolean }
  | undefined;

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'נא למלא אימייל וסיסמה' };
  if (password.length < 8) return { error: 'הסיסמה צריכה להיות באורך 8 תווים לפחות' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (error) return { error: translateAuthError(error.message) };

  // If email confirmation is OFF (Supabase default for new projects can vary),
  // a session is returned immediately. Otherwise, the user must confirm by email first.
  if (data.session) {
    revalidatePath('/', 'layout');
    redirect('/dashboard');
  }

  return { success: true, needsEmailConfirmation: true };
}

function translateAuthError(msg: string): string {
  if (msg.includes('User already registered')) return 'אימייל זה כבר רשום במערכת';
  if (msg.includes('Password should be at least')) return 'הסיסמה צריכה להיות לפחות 6 תווים';
  return msg;
}
