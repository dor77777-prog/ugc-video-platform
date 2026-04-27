import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: { text: 'text-lg', dot: 'w-1.5 h-1.5' },
  md: { text: 'text-2xl', dot: 'w-2 h-2' },
  lg: { text: 'text-4xl', dot: 'w-3 h-3' },
  xl: { text: 'text-6xl', dot: 'w-5 h-5' },
} as const;

export function Logo({ className, size = 'md' }: LogoProps) {
  const s = SIZES[size];
  return (
    <div
      dir="ltr"
      className={cn(
        'inline-flex items-baseline font-bold tracking-tight text-foreground',
        s.text,
        className,
      )}
    >
      <span>tachles</span>
      <span className={cn('rounded-full bg-accent ms-0.5 self-end mb-[0.15em]', s.dot)} />
    </div>
  );
}
