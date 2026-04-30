// Curated Hebrew error messages — V13 PR5.
//
// Mapping from machine-readable error code → human-readable Hebrew
// explanation that the wizard can show users when something goes
// wrong. Per V13 §14.2 spec.
//
// The codes follow `<stage>.<reason>` convention so they're
// grep-able alongside the [stage:scope] log lines from PR4. Stages:
// scrape · intelligence · script · scene-plan · image-brief ·
// image-gen · voice · motion · animation-plan · kling · face-gate ·
// pixverse · render.
//
// When a new error code surfaces, prefer adding it here over throwing a
// raw Error string from deep inside a provider. The wizard falls back
// to a generic message for unknown codes; a curated entry just upgrades
// the user experience.

/** Shape returned by the wizard when displaying a scene error. */
export interface SceneErrorMessage {
  /** Hebrew explanation suitable for direct display in a card. */
  hebrew: string;
  /** Optional retry hint shown next to a "נסה שוב" button. */
  retryHint?: string;
  /** When true, retrying without the user changing anything is unlikely
   *  to help — the wizard surfaces a "edit & retry" hint instead of a
   *  plain "try again". */
  needsUserEdit?: boolean;
}

export const SCENE_ERROR_MESSAGES: Record<string, SceneErrorMessage> = {
  // ── scrape ────────────────────────────────────────────────────────────
  'scrape.timeout': {
    hebrew: 'אתר המוצר לא הגיב בזמן. נסה שוב — אם זה חוזר, ייתכן שהאתר חוסם בוטים.',
    retryHint: 'נסה שוב בעוד מספר רגעים',
  },
  'scrape.weak_description': {
    hebrew: 'הסקרייפר מצא רק תיאור קצר על האתר. תוכל להוסיף ידנית פרטים נוספים על המוצר בשלב 1 לתוצאות טובות יותר.',
    needsUserEdit: true,
  },
  'scrape.no_hero_image': {
    hebrew: 'לא נמצאה תמונת מוצר באתר. העלה ידנית תמונת hero בשלב 1.',
    needsUserEdit: true,
  },

  // ── intelligence (dossier / visual analysis / audience) ──────────────
  'intelligence.dossier_failed': {
    hebrew: 'בניית פרופיל המוצר נכשלה — נסה ללחוץ "נתח מחדש את המוצר" בשלב 1.',
    retryHint: 'לחץ על "נתח מחדש" בשלב 1',
  },
  'intelligence.visual_analysis_failed': {
    hebrew: 'לא הצלחנו לנתח את תמונת המוצר. ייתכן שהתמונה לא נגישה — בדוק את ה-URL בשלב 1.',
    needsUserEdit: true,
  },

  // ── script ──────────────────────────────────────────────────────────
  'script.openai_rate_limit': {
    hebrew: 'הגעת למגבלת הקצב של OpenAI. המתן דקה ונסה שוב.',
    retryHint: 'המתן ~60 שניות',
  },
  'script.json_parse_failed': {
    hebrew: 'מודל הסקריפטים החזיר תגובה שלא הצלחנו לפענח. נסה שוב — זה לרוב חולף.',
    retryHint: 'נסה שוב',
  },

  // ── scene-plan ──────────────────────────────────────────────────────
  'scene-plan.missing_intelligence': {
    hebrew: 'חסר מידע על המוצר. חזור לשלב 1 ולחץ "נתח מחדש את המוצר".',
    needsUserEdit: true,
  },
  'scene-plan.missing_required_field': {
    hebrew: 'תוכנית הסצנה חסרה שדה הכרחי. נסה לייצר את הסקריפטים מחדש.',
  },

  // ── image-brief ─────────────────────────────────────────────────────
  'image-brief.missing_intelligence': {
    hebrew: 'לא נבנה פרופיל מוצר עדיין — חזור לשלב 1 ולחץ "נתח מחדש".',
    needsUserEdit: true,
  },

  // ── image-gen ───────────────────────────────────────────────────────
  'image-gen.timeout': {
    hebrew: 'OpenAI לא הגיב תוך 3 דקות לסצנה הזו. נסה שוב — אם חוזר על עצמו יש להם עומס.',
    retryHint: 'נסה שוב',
  },
  'image-gen.safety_rejected': {
    hebrew: 'OpenAI סירבו ליצור את הסצנה. ערוך ידנית את ה-visual_prompt_english (הסר מילים כמו bodysuit / shaper / lingerie / sexy / revealing) ונסה שוב.',
    needsUserEdit: true,
  },
  'image-gen.rate_limit': {
    hebrew: 'הגעת למגבלת הקצב של OpenAI. המתן דקה ונסה שוב.',
    retryHint: 'המתן ~60 שניות',
  },
  'image-gen.config': {
    hebrew: 'מפתח OpenAI לא מוגדר נכון. בדוק את ה-env vars.',
    needsUserEdit: true,
  },
  'image-gen.generic': {
    hebrew: 'יצירת התמונה נכשלה. נסה שוב.',
    retryHint: 'נסה שוב',
  },

  // ── voice ────────────────────────────────────────────────────────────
  'voice.elevenlabs_timeout': {
    hebrew: 'ElevenLabs לא הגיב בזמן. נסה שוב.',
    retryHint: 'נסה שוב',
  },
  'voice.character_limit': {
    hebrew: 'חרגת ממגבלת התווים החודשית של ElevenLabs. שדרג את החבילה או המתן לאיפוס.',
    needsUserEdit: true,
  },
  'voice.config': {
    hebrew: 'מפתח ElevenLabs לא מוגדר. בדוק את ה-env vars.',
    needsUserEdit: true,
  },
  'voice.no_voice_selected': {
    hebrew: 'עדיין לא נבחר קול לפרויקט. בחר קול בראש העמוד לפני שמייצרים voice-over.',
    needsUserEdit: true,
  },
  'voice.empty_text': {
    hebrew: 'טקסט הסצנה ריק — אין מה להקריא.',
    needsUserEdit: true,
  },

  // ── motion (motion-analysis vision call) ────────────────────────────
  'motion.analysis_failed': {
    hebrew: 'ניתוח התנועה של התמונה נכשל. הקליפ עדיין יווצר עם פרומט תנועה גנרי.',
  },

  // ── animation-plan ──────────────────────────────────────────────────
  'animation-plan.missing_required_field': {
    hebrew: 'תוכנית האנימציה חסרה שדה הכרחי. נסה לחזור לשלב הסצנות.',
  },

  // ── kling ────────────────────────────────────────────────────────────
  'kling.timeout': {
    hebrew: 'Kling לא הצליח לסיים תוך 15 דקות — ייתכן שהתמונה מורכבת מדי. נסה לייצר מחדש את התמונה עם פרומט פשוט יותר.',
    needsUserEdit: true,
  },
  'kling.task_failed': {
    hebrew: 'Kling דחה את הבקשה. בדוק שהתמונה לא מכילה תוכן רגיש או טקסט מורכב.',
    needsUserEdit: true,
  },
  'kling.insufficient_credits': {
    hebrew: 'נגמר לחבילת Kling ה-resource pack. כנס ל-/admin/costs כדי לראות מצב הפאקים.',
    needsUserEdit: true,
  },
  'kling.config': {
    hebrew: 'מפתחות Kling לא מוגדרים. בדוק את ה-env vars KLING_ACCESS_KEY / KLING_SECRET_KEY.',
    needsUserEdit: true,
  },
  'kling.network': {
    hebrew: 'תקלת רשת מול Kling. נסה שוב.',
    retryHint: 'נסה שוב',
  },

  // ── face-gate ────────────────────────────────────────────────────────
  'face-gate.no_face_detected': {
    hebrew: 'לא זוהו פנים בסצנה — סנכרון השפתיים דולג, הסצנה נשמרה עם וידאו שקט + קול.',
  },
  'face-gate.failed': {
    hebrew: 'בדיקת הפנים נכשלה. הסצנה תיווצר ללא lipsync לבטיחות.',
  },

  // ── pixverse ─────────────────────────────────────────────────────────
  'pixverse.upload_failed': {
    hebrew: 'PixVerse נכשל בהעלאת הוידאו. ייתכן ש-PUBLIC_BASE_URL לא נגיש מבחוץ — בדוק את ה-tunnel.',
    needsUserEdit: true,
  },
  'pixverse.timeout': {
    hebrew: 'PixVerse לא סיים בזמן. הסצנה תיווצר ללא lipsync — נסה שוב מאוחר יותר.',
    retryHint: 'נסה שוב',
  },
  'pixverse.public_url_unavailable': {
    hebrew: 'PUBLIC_BASE_URL לא מוגדר. הסצנה תיווצר ללא lipsync. הגדר tunnel (cloudflared / ngrok) ב-dev, או PUBLIC_BASE_URL בייצור.',
    needsUserEdit: true,
  },
  'pixverse.provider_error': {
    hebrew: 'PixVerse דחה את הבקשה. הסצנה תיווצר ללא lipsync.',
  },

  // ── render ──────────────────────────────────────────────────────────
  'render.ffmpeg_failed': {
    hebrew: 'ה-render נכשל. בדוק שכל הסצנות הושלמו בהצלחה לפני הגשת הוידאו הסופי.',
    retryHint: 'נסה שוב',
  },
  'render.queue_unavailable': {
    hebrew: 'התור לא זמין כרגע. נסה שוב בעוד דקה.',
    retryHint: 'המתן ~60 שניות',
  },
  'render.scene_missing_clip': {
    hebrew: 'אחת הסצנות לא הסתיימה — חסר clipUrl. סיים את כל הסצנות לפני שיוגרים render.',
    needsUserEdit: true,
  },

  // ── credits / rate / spend cap (cross-stage) ────────────────────────
  'credits.insufficient': {
    hebrew: 'אין מספיק קרדיטים לפעולה הזו. שדרג את החבילה.',
    needsUserEdit: true,
  },
  'rate-limit.exceeded': {
    hebrew: 'הגעת למגבלת הקצב. המתן ונסה שוב.',
    retryHint: 'המתן ~60 שניות',
  },
  'spend-cap.exceeded': {
    hebrew: 'הגעת למגבלת ההוצאה היומית. המתן עד מחר או הרם את ה-spendCapUsd ב-/admin/users.',
    needsUserEdit: true,
  },
};

/** Returns the curated Hebrew message for a code, or a generic fallback
 *  with the raw error visible in `<details>`. */
export function getSceneErrorMessage(
  code: string,
  rawError?: string,
): SceneErrorMessage & { code: string; raw?: string; isFallback: boolean } {
  const entry = SCENE_ERROR_MESSAGES[code];
  if (entry) {
    return { ...entry, code, raw: rawError, isFallback: false };
  }
  return {
    hebrew: 'משהו השתבש. נסה שוב — אם חוזר על עצמו, פרטי השגיאה למטה יעזרו לאבחן.',
    retryHint: 'נסה שוב',
    code,
    raw: rawError,
    isFallback: true,
  };
}

/** Convenience for callers that need just the Hebrew string. */
export function sceneErrorHebrew(code: string): string {
  return SCENE_ERROR_MESSAGES[code]?.hebrew ?? 'משהו השתבש. נסה שוב.';
}

/** Whether a given code is curated (vs falling through to the generic). */
export function isCuratedSceneError(code: string): boolean {
  return code in SCENE_ERROR_MESSAGES;
}

/** All known codes — useful for tests + the admin debug panel. */
export function listSceneErrorCodes(): string[] {
  return Object.keys(SCENE_ERROR_MESSAGES);
}
