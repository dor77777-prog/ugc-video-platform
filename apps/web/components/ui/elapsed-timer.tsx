'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Counts seconds since first render. Resets when `keyValue` changes.
export function ElapsedTimer({
  className,
  keyValue,
}: {
  className?: string;
  keyValue?: string | number;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [keyValue]);

  return <span className={cn('font-mono tabular-nums', className)}>{seconds}s</span>;
}
