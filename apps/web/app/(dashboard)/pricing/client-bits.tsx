'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { selectPlanAction, type SelectPlanState } from './actions';

// Per-plan upgrade button. Two-step click: first press shows a confirm
// inline ("you sure?"), second press submits the action. Avoids the
// foot-gun of an accidental click silently flipping the plan + granting
// credits before Stripe is wired.
export function SelectPlanButton({
  plan,
  label,
  isPopular,
}: {
  plan: string;
  label: string;
  isPopular: boolean;
}) {
  const [state, formAction, pending] = useActionState<SelectPlanState, FormData>(
    selectPlanAction,
    undefined,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="plan" value={plan} />
      {!confirming ? (
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          variant={isPopular ? 'default' : 'outline'}
          className="w-full"
          disabled={pending}
        >
          {label}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-center text-muted-foreground">
            לאשר שדרוג ל-{plan}?
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={isPopular ? 'default' : 'outline'}
              className="flex-1"
              disabled={pending}
            >
              {pending ? 'משדרג…' : 'אישור'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              ביטול
            </Button>
          </div>
        </div>
      )}
      {state?.error && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5">
          {state.error}
        </div>
      )}
    </form>
  );
}
