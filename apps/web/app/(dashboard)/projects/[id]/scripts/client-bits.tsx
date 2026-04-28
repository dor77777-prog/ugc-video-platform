'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ElapsedTimer } from '@/components/ui/elapsed-timer';
import { cn } from '@/lib/utils';
import { generateScriptsAction, updateScriptAction, type GenerateState } from './actions';

export function GenerateButton({
  projectId,
  regenerate = false,
}: {
  projectId: string;
  regenerate?: boolean;
}) {
  const action = generateScriptsAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    action,
    undefined,
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <Button
          size={regenerate ? 'default' : 'lg'}
          variant={regenerate ? 'outline' : 'default'}
          disabled={pending}
        >
          {pending
            ? 'ה-AI חושב…'
            : regenerate
              ? '↻ צור תסריטים מחדש'
              : '✨ צור 6 תסריטים'}
        </Button>
      </form>

      {pending && (
        <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-4 max-w-md mx-auto space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="animate-shimmer-overlay text-lg">✨</span>
            <span>ה-AI כותב 6 תסריטים בעברית, בזוויות שונות…</span>
          </div>
          <ProgressBar />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>בדרך כלל לוקח 5–15 שניות</span>
            <ElapsedTimer />
          </div>
        </div>
      )}

      {state?.error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 max-w-md mx-auto">
          {state.error}
        </div>
      )}
    </div>
  );
}

interface ScriptCardScene {
  id: string;
  sceneOrder: number;
  sceneGoal: string | null;
  textHebrew: string;
  onScreenCaption: string;
  cameraDirection: string;
  performanceNote: string;
  durationSeconds: number;
}

interface ScriptCardProps {
  scriptId: string;
  projectId: string;
  angleLabel: string;
  hook: string;
  cta: string;
  estimatedDurationSeconds: number;
  qualityScoreOverall: number | null;
  hookOptions: string[];
  hookReason: string;
  creativeStrategy: Record<string, unknown> | null;
  qualityScore: Record<string, unknown> | null;
  scenes: ScriptCardScene[];
  isSelected: boolean;
  selectAction: (formData: FormData) => Promise<void>;
}

const SCENE_GOAL_LABEL: Record<string, string> = {
  stop_scroll: 'עוצר גלילה',
  establish_pain: 'מבסס כאב',
  introduce_product: 'מכניס מוצר',
  prove_it_works: 'מוכיח שעובד',
  decision_push: 'דחיפה לפעולה',
  other: 'אחר',
};

const STRATEGY_LABEL: Record<string, string> = {
  coreInsight: 'תובנה מרכזית',
  audiencePain: 'הכאב של הקהל',
  emotionalTrigger: 'טריגר רגשי',
  productMechanism: 'איך זה עובד',
  mainObjection: 'ההתנגדות העיקרית',
  persuasionAngle: 'זווית שכנוע',
  whyThisWouldStopScroll: 'למה זה עוצר גלילה',
  ugcSituation: 'הסיטואציה הישראלית',
  hookType: 'סוג Hook',
  scriptPromise: 'ההבטחה לצופה',
  conversionGoal: 'מטרת הקונברסיה',
};

const QUALITY_LABEL: Record<string, string> = {
  hookStrength: 'Hook',
  specificity: 'ספציפיות',
  israeliAuthenticity: 'אותנטיות ישראלית',
  emotionalPull: 'משיכה רגשית',
  visualClarity: 'בהירות ויזואלית',
  conversionPotential: 'פוטנציאל המרה',
  ttsNaturalness: 'תוסס TTS',
  noGenericCliches: 'ללא קלישאות',
};

export function ScriptCard(props: ScriptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showStrategy, setShowStrategy] = useState(false);
  const [draftHook, setDraftHook] = useState(props.hook);
  const [draftCta, setDraftCta] = useState(props.cta);
  const [draftScenes, setDraftScenes] = useState(props.scenes.map((s) => ({ ...s })));
  const [saving, startSave] = useTransition();

  const startEdit = () => {
    setDraftHook(props.hook);
    setDraftCta(props.cta);
    setDraftScenes(props.scenes.map((s) => ({ ...s })));
    setEditing(true);
    setExpanded(true);
  };

  const cancelEdit = () => setEditing(false);

  const save = () => {
    const fd = new FormData();
    fd.set('scriptId', props.scriptId);
    fd.set('hook', draftHook);
    fd.set('cta', draftCta);
    fd.set('scenes', JSON.stringify(draftScenes.map((s) => ({
      id: s.id,
      textHebrew: s.textHebrew,
      durationSeconds: s.durationSeconds,
    }))));
    startSave(async () => {
      await updateScriptAction(fd);
      setEditing(false);
    });
  };

  const updateScene = (idx: number, patch: Partial<typeof draftScenes[number]>) => {
    setDraftScenes((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <Card
      className={cn(
        'transition-all',
        props.isSelected
          ? 'border-primary border-2 shadow-md ring-4 ring-primary/15'
          : 'hover:border-primary/40',
        editing && 'ring-4 ring-accent/30',
      )}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={props.isSelected ? 'default' : 'outline'}>{props.angleLabel}</Badge>
            {props.qualityScoreOverall !== null && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] font-mono',
                  props.qualityScoreOverall >= 8.5 && 'bg-emerald-500/15 text-emerald-700',
                  props.qualityScoreOverall >= 8 && props.qualityScoreOverall < 8.5 && 'bg-amber-500/15 text-amber-700',
                  props.qualityScoreOverall < 8 && 'bg-rose-500/15 text-rose-700',
                )}
                title="ציון איכות עצמי שה-LLM נתן לתסריט"
              >
                ★ {props.qualityScoreOverall.toFixed(1)}/10
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {props.estimatedDurationSeconds}s · {props.scenes.length} סצנות
          </div>
        </div>

        {/* Hook (read or edit) */}
        {editing ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Hook (משפט פתיחה):</Label>
            <Input value={draftHook} onChange={(e) => setDraftHook(e.target.value)} />
          </div>
        ) : (
          <h3 className="text-xl font-bold leading-snug">{props.hook}</h3>
        )}

        {/* First-scene preview when collapsed */}
        {!editing && !expanded && (
          <div className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">
            {props.scenes[0]?.textHebrew}
          </div>
        )}

        {/* Expanded view */}
        {expanded && (
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Hook options + reason — V2 metadata, read-only */}
            {!editing && props.hookOptions.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 space-y-1.5 text-xs">
                <div className="font-semibold text-muted-foreground uppercase tracking-wide">
                  3 אופציות hook שנשקלו:
                </div>
                <ul className="space-y-1">
                  {props.hookOptions.map((h, i) => (
                    <li
                      key={i}
                      className={cn(
                        'leading-relaxed',
                        h === props.hook && 'font-semibold text-foreground',
                      )}
                    >
                      {h === props.hook ? '✓' : '○'} {h}
                    </li>
                  ))}
                </ul>
                {props.hookReason && (
                  <div className="text-muted-foreground pt-1 border-t border-border">
                    <span className="font-semibold">למה נבחר: </span>
                    {props.hookReason}
                  </div>
                )}
              </div>
            )}

            {(editing ? draftScenes : props.scenes).map((s, idx) => (
              <div key={s.id} className="text-sm space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">סצנה {s.sceneOrder + 1}</span>
                    {s.sceneGoal && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {SCENE_GOAL_LABEL[s.sceneGoal] ?? s.sceneGoal}
                      </span>
                    )}
                  </div>
                  {editing ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={2}
                        max={20}
                        value={s.durationSeconds}
                        onChange={(e) =>
                          updateScene(idx, { durationSeconds: parseInt(e.target.value || '0', 10) })
                        }
                        className="w-16 h-7 text-xs"
                      />
                      <span>s</span>
                    </div>
                  ) : (
                    <span className="font-mono">{s.durationSeconds}s</span>
                  )}
                </div>
                {editing ? (
                  <Textarea
                    value={s.textHebrew}
                    onChange={(e) => updateScene(idx, { textHebrew: e.target.value })}
                    rows={3}
                    className="text-sm"
                  />
                ) : (
                  <>
                    <div className="leading-relaxed">{s.textHebrew}</div>
                    {(s.onScreenCaption || s.cameraDirection || s.performanceNote) && (
                      <div className="text-[11px] text-muted-foreground space-y-0.5 ps-2 border-s-2 border-border">
                        {s.onScreenCaption && (
                          <div>
                            <span className="font-semibold">כתובית: </span>
                            {s.onScreenCaption}
                          </div>
                        )}
                        {s.cameraDirection && (
                          <div className="font-mono">
                            <span className="font-semibold">camera: </span>
                            {s.cameraDirection}
                          </div>
                        )}
                        {s.performanceNote && (
                          <div>
                            <span className="font-semibold">בימוי: </span>
                            {s.performanceNote}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* CTA */}
            <div className="border-t border-border pt-3">
              {editing ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">CTA (קריאה לפעולה):</Label>
                  <Input value={draftCta} onChange={(e) => setDraftCta(e.target.value)} />
                </div>
              ) : (
                props.cta && (
                  <div className="text-sm font-semibold text-primary">CTA: {props.cta}</div>
                )
              )}
            </div>

            {/* Creative Strategy block — collapsible */}
            {!editing && props.creativeStrategy && (
              <div className="border-t border-border pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowStrategy((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showStrategy ? '× הסתר Creative Strategy' : '📋 ראה Creative Strategy'}
                </button>
                {showStrategy && (
                  <div className="rounded-md bg-muted/40 p-3 space-y-1.5 text-xs">
                    {Object.entries(props.creativeStrategy).map(([k, v]) => {
                      if (k === 'assumptions') {
                        const arr = Array.isArray(v) ? (v as string[]) : [];
                        if (arr.length === 0) return null;
                        return (
                          <div key={k}>
                            <span className="font-semibold">הנחות שנעשו: </span>
                            {arr.join(' · ')}
                          </div>
                        );
                      }
                      if (typeof v !== 'string' || !v) return null;
                      return (
                        <div key={k}>
                          <span className="font-semibold">{STRATEGY_LABEL[k] ?? k}: </span>
                          <span className="text-muted-foreground">{v}</span>
                        </div>
                      );
                    })}
                    {props.qualityScore && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-2 border-t border-border font-mono text-[11px]">
                        {Object.entries(props.qualityScore).map(([k, v]) => {
                          if (typeof v !== 'number' || k === 'overall') return null;
                          const label = QUALITY_LABEL[k] ?? k;
                          return (
                            <div key={k} className="flex justify-between">
                              <span className="text-muted-foreground">{label}</span>
                              <span className={cn(v >= 8 ? 'text-emerald-700' : 'text-rose-700')}>
                                {v}/10
                              </span>
                            </div>
                          );
                        })}
                        {typeof props.qualityScore.weaknessNote === 'string' &&
                          props.qualityScore.weaknessNote && (
                            <div className="col-span-2 pt-1 mt-1 border-t border-border text-[11px] text-muted-foreground font-sans">
                              <span className="font-semibold">חולשה שזוהתה: </span>
                              {props.qualityScore.weaknessNote as string}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action row */}
        <div className="flex justify-between items-center gap-2 pt-2 flex-wrap">
          {!editing ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {expanded ? 'הסתר' : 'ראה תסריט מלא'}
                </button>
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ערוך ✏️
                </button>
              </div>

              <form action={props.selectAction}>
                <input type="hidden" name="projectId" value={props.projectId} />
                <input type="hidden" name="scriptId" value={props.scriptId} />
                <Button
                  type="submit"
                  variant={props.isSelected ? 'default' : 'secondary'}
                  size="sm"
                >
                  {props.isSelected ? '✓ נבחר' : 'בחר תסריט זה'}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex items-center gap-2 ms-auto" dir="ltr">
              <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                בטל
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={saving}>
                {saving ? 'שומר…' : 'שמור עריכות'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
