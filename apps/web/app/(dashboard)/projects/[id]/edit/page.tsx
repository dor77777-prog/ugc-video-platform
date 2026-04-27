import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}

export default async function ProjectEditPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { step } = await searchParams;
  const currentStep = parseInt(step ?? '2', 10);

  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id, userId: dbUser.id },
  });
  if (!project) notFound();

  const data = (project.productData ?? {}) as Record<string, unknown>;

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            עריכת פרויקט · שלב {currentStep} מתוך 7
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{project.productName}</h1>
        </div>
        <Badge variant="success">שלב 1 הושלם</Badge>
      </div>

      <Card className="bg-accent/10 border-accent/30">
        <CardContent className="p-6 space-y-3">
          <h3 className="font-semibold">פרטי המוצר נשמרו</h3>
          <div className="text-sm space-y-1.5 text-muted-foreground">
            {typeof data.brand === 'string' && data.brand && (
              <div>מותג: <span className="text-foreground font-medium">{data.brand}</span></div>
            )}
            {typeof data.aspectRatio === 'string' && (
              <div>יחס מסך: <span className="font-mono">{data.aspectRatio}</span> · אורך: <span className="font-mono">{String(data.durationSeconds ?? '?')}s</span></div>
            )}
            {typeof data.heroImageUrl === 'string' && data.heroImageUrl && (
              <div className="flex items-center gap-3 mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.heroImageUrl} alt="hero" className="w-20 h-20 rounded object-cover border border-border" />
                <div className="text-xs">תמונת רפרנס שתשמש לכל הסצנות</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-12 text-center space-y-3">
          <div className="text-4xl">🚧</div>
          <h2 className="text-xl font-semibold">שלב {currentStep} בבנייה</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            השלבים הבאים (LLM Script Engine, אווטארים, סצנות תמונות, סצנות וידאו, הרכבה סופית)
            יחוברו בקומיטים הבאים. כל אחד מהם נבנה כמודול נפרד.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard">חזרה לדאשבורד</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
