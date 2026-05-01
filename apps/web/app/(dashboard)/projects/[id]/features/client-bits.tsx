'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Plus, Trash2, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductFeature } from '@ugc-video/shared';
import { saveFeaturesAction } from './actions';

// V26.18 — interactive picker. Loads cached suggestions from the
// server prop; "Suggest" button calls the API to (re)generate. User
// toggles selection, can add custom features inline, and saves.

export function FeaturePicker({
  projectId,
  initialSuggestions,
  initialSelection,
}: {
  projectId: string;
  initialSuggestions: ProductFeature[];
  initialSelection: ProductFeature[];
}) {
  const router = useRouter();
  const [suggested, setSuggested] = useState<ProductFeature[]>(initialSuggestions);
  const [custom, setCustom] = useState<ProductFeature[]>(
    initialSelection.filter((f) => f.source === 'custom'),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelection.map((f) => f.id)),
  );
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customHook, setCustomHook] = useState('');

  const requestSuggestions = async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/features/suggest`, {
        method: 'POST',
      });
      const json = (await res.json()) as
        | { features: ProductFeature[] }
        | { error: string; message?: string };
      if (!res.ok) {
        const errMsg =
          'message' in json && json.message
            ? json.message
            : (json as { error: string }).error;
        setSuggestError(errMsg);
        return;
      }
      const next = (json as { features: ProductFeature[] }).features;
      setSuggested(next);
    } catch (err) {
      setSuggestError(`שגיאה: ${(err as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCustom = () => {
    if (!customTitle.trim()) return;
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const feature: ProductFeature = {
      id,
      title: customTitle.trim(),
      hook: customHook.trim() || customTitle.trim(),
      source: 'custom',
    };
    setCustom((prev) => [...prev, feature]);
    setSelectedIds((prev) => new Set(prev).add(id));
    setCustomTitle('');
    setCustomHook('');
    setShowCustomForm(false);
  };

  const removeCustom = (id: string) => {
    setCustom((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const allFeatures = [...suggested, ...custom];
  const selectedFeatures = allFeatures.filter((f) => selectedIds.has(f.id));
  const canContinue = selectedFeatures.length >= 1 && !saving;

  const handleContinue = () => {
    startSave(async () => {
      const res = await saveFeaturesAction(projectId, selectedFeatures);
      if (res.ok) router.push(`/projects/${projectId}/scripts`);
    });
  };

  const isEmpty = suggested.length === 0;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          {selectedFeatures.length === 0 ? (
            <span className="text-muted-foreground">בחר תכונה אחת לפחות כדי להמשיך.</span>
          ) : (
            <span className="text-foreground font-medium">
              נבחרו {selectedFeatures.length} תכונות
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestSuggestions}
          disabled={suggesting}
        >
          {suggesting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 me-1.5 animate-spin" />
              מחלץ…
            </>
          ) : isEmpty ? (
            <>
              <Sparkles className="w-3.5 h-3.5 me-1.5" />
              חלץ תכונות מהמוצר
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5 me-1.5" />
              חלץ מחדש
            </>
          )}
        </Button>
      </div>

      {suggestError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {suggestError}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !suggesting && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground" />
            <div className="text-sm font-semibold">לחץ "חלץ תכונות מהמוצר"</div>
            <div className="text-xs text-muted-foreground">
              ה-AI יקרא את פרטי המוצר וימצא 3-4 זוויות שיווקיות חזקות.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested feature grid */}
      {allFeatures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {allFeatures.map((f) => {
            const picked = selectedIds.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                className={cn(
                  'text-right rounded-xl border-2 p-4 transition-colors relative',
                  picked
                    ? 'border-primary bg-primary/[0.06] shadow-sm'
                    : 'border-border hover:border-foreground/30 hover:bg-muted/30',
                )}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      'shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center',
                      picked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {picked && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{f.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {f.hook}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-mono',
                          f.source === 'llm'
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-accent/20 text-accent',
                        )}
                      >
                        {f.source === 'llm' ? 'הוצע ע״י AI' : 'משלך'}
                      </span>
                      {f.source === 'custom' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustom(f.id);
                          }}
                          className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          מחק
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Custom feature add */}
      {!showCustomForm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowCustomForm(true)}
        >
          <Plus className="w-3.5 h-3.5 me-1.5" />
          הוסף תכונה משלך
        </Button>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">תכונה משלך</div>
            <Input
              placeholder="כותרת קצרה (2-5 מילים)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="למה זה מוכר? (משפט אחד, אופציונלי)"
              value={customHook}
              onChange={(e) => setCustomHook(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCustomForm(false);
                  setCustomTitle('');
                  setCustomHook('');
                }}
              >
                בטל
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={addCustom}
                disabled={!customTitle.trim()}
              >
                הוסף
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue */}
      <div className="flex justify-end pt-2 border-t border-border">
        <Button
          type="button"
          size="lg"
          onClick={handleContinue}
          disabled={!canContinue}
        >
          {saving ? 'שומר…' : 'המשך לתסריטים →'}
        </Button>
      </div>
    </div>
  );
}
