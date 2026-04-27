import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';

export default async function FinishPlaceholder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">סיום</div>
        <h1 className="text-3xl font-bold tracking-tight">הרכבה סופית</h1>
      </div>
      <Stepper current={6} done={[1, 3]} />
      <Card className="border-dashed">
        <CardContent className="p-12 text-center space-y-3">
          <div className="text-5xl">📦</div>
          <h2 className="text-xl font-semibold">בקרוב — Creatomate composition</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            כל הקליפים, הקריינות, מוזיקת הרקע והכתוביות מורכבים לקובץ MP4 אחד מוכן להורדה.
          </p>
          <div className="pt-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${id}/videos`}>← חזרה</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
