'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = String(formData.get('redirect') ?? '/dashboard');

  if (!email || !password) {
    return { error: 'נא למלא אימייל וסיסמה' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  revalidatePath('/', 'layout');
  redirect(redirectTo.startsWith('/') ? redirectTo : '/dashboard');
}

function translateAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'אימייל או סיסמה שגויים';
  if (msg.includes('Email not confirmed')) return 'נא לאשר את האימייל לפני התחברות';
  return msg;
}
