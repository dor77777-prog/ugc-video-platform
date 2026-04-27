'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ElapsedTimer } from '@/components/ui/elapsed-timer';
import { cn } from '@/lib/utils';
import {
  generateSceneImageAction,
  updateScenePromptAction,
  type GenerateSceneImageState,
} from './actions';

interface SceneCardProps {
  sceneId: string;
  sceneOrder: number;
  totalScenes: number;
  sceneType: string;
  textHebrew: string;
  visualPromptEnglish: string;
  durationSeconds: number;
  imageUrl: string | null;
  imageGenerationCount: number;
  // Locked = previous scene doesn't have an image yet.
  locked: boolean;
}

const SCENE_TYPE_LABEL: Record<string, string> = {
  hook: 'הוק',
  problem: 'בעיה',
  product_demo: 'הדגמת מוצר',
  benefit: 'תועלת',
  cta: 'קריאה לפעולה',
  other: 'אחר',
};

export function SceneCard(props: SceneCardProps) {
  const action = generateSceneImageAction.bind(null, props.sceneId);
  const [state, formAction, pending] = useActionState<GenerateSceneImageState, FormData>(
    action,
    undefined,
  );
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(props.visualPromptEnglish);
  const [savingPrompt, startSaving] = useTransition();

  const hasImage = !!props.imageUrl;

  const savePrompt = () => {
    const fd = new FormData();
    fd.set('sceneId', props.sceneId);
    fd.set('visualPromptEnglish', draftPrompt);
    startSaving(async () => {
      await updateScenePromptAction(fd);
      setEditingPrompt(false);
    });
  };

  return (
    <Card className={cn(props.locked && 'opacity-60', hasImage && 'border-accent/40')}>
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Badge variant={hasImage ? 'success' : 'outline'}>
              סצנה {props.sceneOrder + 1}/{props.totalScenes}
            </Badge>
            <Badge variant="muted" className="ms-2">
              {SCENE_TYPE_LABEL[props.sceneType] ?? props.sceneType}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {props.durationSeconds}s
          </div>
        </div>

        {/* Hebrew voiceover text */}
        <div className="text-sm leading-relaxed border-s-2 border-primary ps-3">
          <div className="text-xs text-muted-foreground mb-1">קריינות:</div>
          {props.textHebrew}
        </div>

        {/* Image area */}
        <div className="relative aspect-[9/16] rounded-md bg-muted overflow-hidden border border-border">
          {hasImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.imageUrl!}
              alt={`Scene ${props.sceneOrder + 1}`}
              className="w-full h-full object-cover"
            />
          )}
          {!hasImage && !pending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
              {props.locked ? (
                <>
                  <span className="text-3xl opacity-40">🔒</span>
                  <span className="text-xs text-muted-foreground">
                    פתח את הסצנה הקודמת קודם
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl opacity-40">🖼️</span>
                  <span className="text-xs text-muted-foreground">תמונה עדיין לא נוצרה</span>
                </>
              )}
            </div>
          )}
          {pending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-4 bg-primary/5 backdrop-blur-[1px]">
              <div className="text-4xl animate-shimmer-overlay">✨</div>
              <div className="text-sm font-semibold">ה-AI יוצר תמונה…</div>
              <div className="w-3/4">
                <ProgressBar variant="accent" />
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>זמן שעבר:</span>
                <ElapsedTimer keyValue={props.sceneId + props.imageGenerationCount} />
              </div>
              <div className="text-[10px] text-muted-foreground/70 max-w-[80%]">
                gpt-image-2 לוקח בדרך כלל 10–30 שניות עם תמונות רפרנס.
              </div>
            </div>
          )}
        </div>

        {/* Visual prompt — editable */}
        {!editingPrompt ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">תיאור ויזואלי (אנגלית):</div>
            <div
              className="text-xs text-muted-foreground/80 line-clamp-3 cursor-pointer hover:text-foreground"
              onClick={() => setEditingPrompt(true)}
              dir="ltr"
            >
              {props.visualPromptEnglish}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              dir="ltr"
              rows={4}
              className="text-xs"
            />
            <div className="flex gap-2 justify-end" dir="ltr">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftPrompt(props.visualPromptEnglish);
                  setEditingPrompt(false);
                }}
              >
                בטל
              </Button>
              <Button type="button" size="sm" onClick={savePrompt} disabled={savingPrompt}>
                {savingPrompt ? 'שומר…' : 'שמור'}
              </Button>
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {props.imageGenerationCount > 0 ? `${props.imageGenerationCount} ניסיונות` : ''}
          </div>
          <form action={formAction}>
            <Button
              type="submit"
              size="sm"
              variant={hasImage ? 'outline' : 'default'}
              disabled={pending || props.locked}
            >
              {pending
                ? 'יוצר…'
                : hasImage
                  ? '↻ צור מחדש (1 קרדיט)'
                  : '✨ צור תמונה (1 קרדיט)'}
            </Button>
          </form>
        </div>

        {state?.error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
            {state.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
