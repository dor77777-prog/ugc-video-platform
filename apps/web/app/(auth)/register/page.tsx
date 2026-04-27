'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction, type RegisterState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(
    registerAction,
    undefined,
  );

  if (state?.needsEmailConfirmation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>בדקו את האימייל שלכם</CardTitle>
          <CardDescription>שלחנו לכם קישור אישור. לחצו עליו כדי להפעיל את החשבון.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="text-primary font-medium hover:underline">
            חזרה להתחברות
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>הרשמה</CardTitle>
        <CardDescription>צרו חשבון חדש וקבלו 5 קרדיטים בחינם להתחלה</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
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
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="לפחות 8 תווים"
            />
          </div>

          {state?.error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {state.error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'יוצר חשבון…' : 'צור חשבון'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          כבר יש לך חשבון?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            התחבר
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
