'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const params = useSearchParams();
  const redirectTo = params.get('redirect') ?? '/dashboard';
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ברוכים השבים</CardTitle>
        <CardDescription>התחברו כדי ליצור מודעות וידאו חדשות</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="redirect" value={redirectTo} />

          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              name="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {state.error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'מתחבר…' : 'התחברות'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          אין לך חשבון?{' '}
          <Link href="/register" className="text-primary font-medium hover:underline">
            הירשם עכשיו
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
