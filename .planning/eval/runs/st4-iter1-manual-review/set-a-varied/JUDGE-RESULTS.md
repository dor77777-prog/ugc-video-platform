# V28.0.ST4 Manual Review — Judge Scoreboard

**⚠ DO NOT OPEN until you've made your 5 guesses.**

**Sonnet judge result on this 5-script sample:** 5/5 correct (100%).

For comparison: full 9-product iter 1 eval scored 0.444 (4/9 correct on average across pick=2 expansions per product).

## Per-script results

| # | Product | Actual framework | Judge guess | Correct? | Judge reasoning (Hebrew) |
|---|---|---|---|---|---|
| 1 | cosmetics-1 | `problem_agitation_solution` | `problem_agitation_solution` | ✓ | הסצנה פותחת בבעיה (פנים כבויות בבוקר), מחריפה אותה ברגע ההסתכלות במראה, ואז מציגה את הסרום כפתרון. |
| 2 | cosmetics-3 | `skeptical_testimonial` | `skeptical_testimonial` | ✓ | הסצנה נפתחת בספקנות מפורשת ('חשבתי שזה שטות') ומסתיימת בעדות אישית אחרי ניסיון. |
| 3 | electronics-2 | `demonstration_proof` | `demonstration_proof` | ✓ | הסצנות מציגות הוכחה ויזואלית מעשית של המוצר — מספרים, מסך LCD, וזמן טעינה בפועל. |
| 4 | electronics-3 | `price_alternative_anchor` | `price_alternative_anchor` | ✓ | הסצנה הראשונה פותחת מיד עם עוגן מחיר (459 ש״ח) ומשווה אותו לכאב ראש של אירוע, וכל התסריט מסתובב סביב… |
| 5 | food-2 | `relatable_israeli_moment` | `relatable_israeli_moment` | ✓ | הסצנה הראשונה פותחת בפנייה ישירה לרגע יומיומי מוכר (הפסקת 10:00 עם תה), וכל הנרטיב בנוי על הזדהות עם… |

## Decision rule (from INDEX.md)

- Your hit rate 4-5/5 → Option F (replace judge)
- Your hit rate 2-3/5 → Option A modified (recalibrate + Sub-task 6 mandatory)
- Your hit rate 0-1/5 → Option D (rollback)