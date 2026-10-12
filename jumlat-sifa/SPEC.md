# Jumlat Ṣifa Practice: build spec

You are building a small, self-contained web activity for Arabic students (beginner level, Alif Baa / Al-Kitaab Part One). The author is an Arabic instructor and will edit the content herself; your job is the app.

## 0. Read this first

1. Run `python3 build_items.py`. It validates `items.csv`, merges `strings.json`, and writes `data.js`, `items.json`, and `preview.html`. **Never hand-edit those three generated files.** If content needs to change, change `items.csv` or `strings.json` and rebuild.
2. The app reads one global, `window.JUMLAT_SIFA = { items: [...], strings: {...} }`, from `data.js`. Do not `fetch()` JSON; the activity must work when `index.html` is opened straight from disk (`file://`).
3. Before you start, check the project folder for an existing website. If my page is built on a particular platform (static HTML, Jekyll/Hugo, WordPress, Canvas, Google Sites, etc.), **ask me** how this should be embedded. If there is no website here, deliver the default below.

**Default deliverable:** a folder containing `index.html`, `style.css`, `app.js`, `data.js`. No build step, no framework, no CDN, no npm. Plain HTML/CSS/JS (ES2018). The whole thing must also be embeddable: put everything under a root element `#jumlat-sifa-app` and prefix every CSS class with `jsp-` so it can't collide with a host page's styles.

## 1. What students learn

A **jumlat ṣifa** (adjectival clause) follows an **indefinite** noun (the **mawṣūf**), describes it, and contains a pronoun that points back to it (the **rābiṭ**). Students practice finding the clause, the noun it describes, and the rābiṭ.

- **Level 1: verbal clauses.** The clause starts with a verb. The rābiṭ is the hidden subject pronoun inside the verb (*he* in يَسكُن, *she* in تَسكُن).
- **Level 2: nominal clauses.** The clause starts with a noun. The rābiṭ is a visible pronoun suffix (ـه، ـها) on a word in the clause.

Every sentence has exactly one jumlat ṣifa. There are **no distractor sentences** in this version.

## 2. Screens

1. **Intro / level select.** Title, a short intro (`strings.intro`), a static worked example (`strings.intro.example`, rendered with the same highlight styles as the activity), and two level cards (`strings.levels`). Both levels are selectable from the start. Put a constant `LOCK_LEVEL_2 = false` at the top of `app.js`; when `true`, Level 2 is disabled until Level 1 is completed in this session.
2. **Activity.** One sentence at a time (see section 3).
3. **Level complete.** Score, list of sentences missed, buttons (section 5).

A small "What's a jumlat ṣifa?" link on every screen reopens the intro.

**Language mode** (top-right toggle): English / العَرَبيّة / Both. Default **Both**: English line first, Arabic line beneath, Arabic in `lang="ar" dir="rtl"`. Every UI string in `strings.json` has `en` and `ar`. Support URL parameters `?level=1|2` and `?lang=en|ar|both` so the instructor can deep-link from course pages. Remember nothing between sessions (no cookies, no localStorage, no analytics, no network calls).

## 3. The activity

### Rendering the sentence

- `tokens` is an array of words. Render **each token as a `<button>`** (a tile), in logical order inside an element with `lang="ar" dir="rtl"`. Index 0 is the rightmost word on screen. The browser handles RTL ordering; do not reverse anything.
- Words keep their short vowels. **Do not normalize, trim, or transform the Arabic text in any way** (no `.normalize()`; NFC/NFD can reorder vowel marks). Compare by **index only**, never by string.
- Arabic font stack that handles vowel marks well, large (about 2rem on desktop, never below 1.6rem): `"Amiri", "Noto Naskh Arabic", "Scheherazade New", "Traditional Arabic", "Geeza Pro", serif`, with generous `line-height` (about 2.2) so marks don't collide. If I allow self-hosted fonts, bundle Amiri (SIL OFL); otherwise use the stack as is.
- Show the English `gloss_en` only (a) after the item is complete, or (b) when the student presses **Show translation**.

### Steps for each item

The item is a small state machine. Prompts come from `strings.prompts`. Each step is checked **immediately**; wrong taps never lock anything.

| Step | Student does | Correct when | After correct |
|---|---|---|---|
| 1. start | Taps the first word of the clause | index = `clause_start` | Tile gets a "start" marker; show `tap_end` prompt |
| 2. end | Taps the last word of the clause | index = `clause_end` | Whole span `clause_start`..`clause_end` gets the **clause** highlight; show `tap_mawsuf` prompt |
| 3. mawṣūf | Taps the noun the clause describes | index = `mawsuf_index` | Tile gets the **mawṣūf** style |
| 4a. Level 1 | (no tap) | n/a | **Reveal** the hidden pronoun: show `rabit.pronoun_ar` (هُوَ / هِيَ) as a small label above the verb tile (index `rabit.index`), with `prompts.hidden_pronoun` as caption. Mark verb with the **rābiṭ** style. |
| 4b. Level 2 | Taps the word that carries the pronoun suffix | index = `rabit.index` | Highlight the suffix characters (see below) in the **rābiṭ** style |
| 5. done | Reads feedback | n/a | Show `feedback.correct`, `gloss_en`, `explanation_en` / `explanation_ar` (per language mode), and a **Next** button |

**Suffix highlight (Level 2):** `rabit.suffix_offset` is the character offset in the token where the suffix begins. Render `token.slice(0, offset)` plain and `token.slice(offset)` in a `<span>` with the rābiṭ style. If `suffix_offset` is `null`, highlight the whole word.

### Wrong answers and hints

No penalty, unlimited retries. A wrong tap: the tile briefly shakes (disable the shake under `prefers-reduced-motion`), `feedback.try_again` is shown, **plus the most specific hint that applies**, from `strings.feedback`:

| Situation | Hint key |
|---|---|
| Step 1, tapped the mawṣūf tile (`mawsuf_index`) | `hint_noun_first` |
| Step 1, tapped any index < `clause_start` (other than the mawṣūf) | `hint_earlier_words` |
| Step 1, any other wrong tap | none (just `try_again`) |
| Step 2, tapped `clause_start` again (or any index inside the clause before `clause_end`) | `hint_too_short` |
| Step 2, tapped an index < `clause_start` | `hint_end_before_start` |
| Step 3, wrong tap | `hint_wrong_mawsuf` |
| Step 4b, wrong tap | `hint_wrong_rabit` |

Already-completed steps are locked (their tiles are not clickable for that step).

### Item order

At the start of each play-through, shuffle the level's items (Fisher-Yates). **Exception:** in Level 2, items with `fronted: true` always come last (shuffle the non-fronted group, then the fronted group, then concatenate). The app must work for any number of items per level (at least 1), never assuming 20.

## 4. Visual and accessibility requirements

- Calm, clean, high-contrast. Large touch targets (tiles at least 44px tall). Works from 320px wide up. Light background; dark Arabic text.
- Three highlight styles that **do not rely on color alone** (each also differs in shape or weight):
  - **clause**: soft yellow background with a rounded outline
  - **mawṣūf**: blue, thick underline
  - **rābiṭ**: red/magenta, bold (plus the small pronoun label in Level 1)
- Fully keyboard-operable: tiles are real `<button>`s, visible focus ring, Enter/Space activates. Moving to the next item moves focus to the first tile.
- Feedback and prompts live in an `aria-live="polite"` region. Each tile has `lang="ar"`.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` is optional (light only is fine).
- Progress: "Sentence {n} of {total}" and a thin progress bar. Streak counter "Streak: {n}" (hidden when 0).

## 5. Scoring and completion

- An item is **clean** if the student completes it with **zero wrong taps**. Streak = number of clean items in a row; any wrong tap in an item resets the streak to 0 (once, at the first wrong tap). When streak reaches 3 or more after a clean item, briefly show `feedback.streak`.
- At the end of a level: `complete.title`; `complete.score` (clean count of total); if every item was clean, show `complete.perfect`; otherwise list the missed sentences (Arabic sentence + gloss) under `complete.review_heading`.
- Buttons: **Practice these again** (only if there were misses; replays just the missed items, shuffled), **Play the level again**, **Go to the next level** (only from Level 1), **Back to levels**.

## 6. Data schema (what `data.js` contains)

```json
{
  "id": "L1-01",
  "level": 1,
  "tokens": ["أَسكُن", "في", "بَيت", "يَقَع", "في", "شارِع", "صَغير"],
  "clause_start": 3,
  "clause_end": 6,
  "mawsuf_index": 2,
  "mawsuf_display": "بَيت",
  "rabit": { "type": "hidden", "index": 3, "pronoun_en": "he", "pronoun_ar": "هُوَ" },
  "fronted": false,
  "clause_text": "يَقَع في شارِع صَغير",
  "gloss_en": "I live in a house that's on a small street.",
  "explanation_en": "...",
  "explanation_ar": "..."
}
```

Level 2 differs only in `rabit`: `{ "type": "suffix", "index": 4, "suffix": "ه", "suffix_offset": 4, "label": "ـه" }`.

All indices are 0-based positions in `tokens` (logical order). `strings` is the parsed `strings.json`. `{n}` and `{total}` in strings are placeholders. Strings may contain `**bold**` and `*italic*` only; write a tiny safe renderer (escape HTML first, then convert those two patterns). Ignore the `_readme` key.

## 7. Tests and acceptance checks

Write a small Node or browser-console test script (`test.js`, no dependencies) that loads `data.js` and asserts, for every item:

- `0 <= mawsuf_index < clause_start <= clause_end < tokens.length`
- Level 1: `rabit.type === "hidden"` and `rabit.index === clause_start`
- Level 2: `rabit.type === "suffix"`, `clause_start <= rabit.index <= clause_end`, and `tokens[rabit.index].slice(rabit.suffix_offset)` begins with the suffix letters
- ids are unique; levels are only 1 or 2

Then verify manually (and tell me what you checked):

- [ ] Opens and runs from `file://` with no console errors
- [ ] Full play-through of one Level 1 item and one Level 2 item, including a deliberate wrong tap at every step and the right hint appearing
- [ ] Arabic vowel marks render intact on tiles (no missing or stacked marks) in Chrome and Safari
- [ ] RTL order is right: the first word is on the right
- [ ] Works at 360px wide; keyboard-only play-through works
- [ ] Language toggle: English only, Arabic only, Both
- [ ] A level can be completed, with a missed-items review round

## 8. Out of scope (do not build)

Distractor / "Is there one?" rounds, Levels 3+, audio, accounts, score saving, teacher dashboards, analytics.

## 9. When you're done

Tell me: where the files are, how to open the activity, how to embed it on my page, and how to update the content (edit `items.csv` or `strings.json`, run `python3 build_items.py`, reload).
