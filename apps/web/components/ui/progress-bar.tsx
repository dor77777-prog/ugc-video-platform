import { cn } from '@/lib/utils';

// Indeterminate progress bar (we don't have real % from the AI provider).
// Renders a thin track with an animated bar sliding across it.
export function ProgressBar({
  active = true,
  variant = 'primary',
  className,
}: {
  active?: boolean;
  variant?: 'primary' | 'accent';
  className?: string;
}) {
  const barClasses =
    variant === 'accent'
      ? 'bg-gradient-to-r from-transparent via-ai to-transparent'
      : 'bg-gradient-to-r from-transparent via-primary to-transparent';
  return (
    <div className={cn('relative h-1 w-full overflow-hidden rounded-full bg-muted', className)}>
      {active && (
        <div className={cn('absolute inset-y-0 w-1/2 motion-shimmer', barClasses)} />
      )}
    </div>
  );
}
