import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center space-y-4 max-w-xl">
        <h1 className="text-4xl font-bold tracking-tight">פלטפורמת מודעות UGC</h1>
        <p className="text-muted-foreground">
          הזינו כתובת מוצר וצרו מודעת וידאו מקצועית בעברית, מוכנה לפייסבוק, טיקטוק ואינסטגרם.
        </p>
      </div>

      <div className="flex gap-3">
        <Button>צור פרויקט חדש</Button>
        <Button variant="outline">היסטוריית פרויקטים</Button>
      </div>

      <div className="mt-8 text-sm text-muted-foreground border rounded-lg p-4 max-w-xl text-center">
        זהו השלד של המערכת. כרגע כל ספקי הווידאו, הקריינות והקומפוזיציה הם mocks.
        בדקו את <code className="font-mono">/api/health</code> כדי לוודא שה-DB וה-Redis מחוברים.
      </div>
    </main>
  );
}
