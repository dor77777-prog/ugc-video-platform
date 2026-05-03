# V28.0.ST4 Manual Review — Judge Scoreboard

**⚠ DO NOT OPEN until you've made your 5 guesses.**

**Sonnet judge result on this 5-script sample:** 4/5 correct (80%).

For comparison: full 9-product iter 1 eval scored 0.444 (4/9 correct on average across pick=2 expansions per product).

## Per-script results

| # | Product | Actual framework | Judge guess | Correct? | Judge reasoning (Hebrew) |
|---|---|---|---|---|---|
| 1 | cosmetics-1 | `problem_agitation_solution` | `skeptical_testimonial` | ✗ | הסצנה נפתחת עם 'אני נשבעת' — ניסוח שמשדר ספקנות קודמת שהופרכה, ואז מתארת ניסיון אישי שהפתיע לטובה. |
| 2 | cosmetics-3 | `skeptical_testimonial` | `skeptical_testimonial` | ✓ | הסצנה פותחת בספקנות מפורשת ('חשבתי שזה עוד גימיק') ועוברת להמלצה אישית אמינה. |
| 3 | electronics-2 | `demonstration_proof` | `demonstration_proof` | ✓ | התסריט בנוי סביב הוכחה ויזואלית מעשית – המשתמשת מציגה בזמן אמת את תכונות המוצר (תצוגת אחוזים, טעינה)… |
| 4 | electronics-3 | `price_alternative_anchor` | `price_alternative_anchor` | ✓ | התסריט פותח וחותם במחיר הספציפי ומשווה אותו לעלות האלטרנטיבה (ויכוח בכביש, מוסך, איש מקצוע). |
| 5 | food-2 | `relatable_israeli_moment` | `relatable_israeli_moment` | ✓ | הסצנה הראשונה פותחת ברגע מוכר ואוניברסלי של אמא ישראלית עייפה אחרי שהילדים יצאו, עם כיור מלא כלים. |

## Decision rule (from INDEX.md)

- Your hit rate 4-5/5 → Option F (replace judge)
- Your hit rate 2-3/5 → Option A modified (recalibrate + Sub-task 6 mandatory)
- Your hit rate 0-1/5 → Option D (rollback)