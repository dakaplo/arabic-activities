#!/usr/bin/env python3
"""
build_items.py: turns items.csv (+ strings.json) into the files the app uses.

    python3 build_items.py

Reads : items.csv, strings.json
Writes: data.js       items + UI strings, loaded by the app as window.JUMLAT_SIFA
        items.json    the processed items (for tests and inspection)
        preview.html  open in a browser to proofread every item

If any row has a problem, nothing is written and every problem is listed
with its row id. No third-party packages needed (Python 3.8+).
"""
import csv
import html
import io
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- Arabic helpers

# vowel marks, Quranic marks, superscript alef (NOT letters)
MARKS = re.compile("[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]")
TATWEEL = "\u0640"
# invisible direction marks that sneak in when copying from Word/Excel
INVISIBLE = re.compile("[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]")

# pronoun suffixes the rābiṭ may be (longest first)
SUFFIXES = ["هما", "كما", "هم", "هن", "ها", "كم", "كن", "نا", "ه", "ك", "ي"]


def clean(s):
    """Strip invisible marks, non-breaking spaces, doubled spaces."""
    s = INVISIBLE.sub("", s or "").replace("\u00a0", " ")
    return " ".join(s.split())


def skeleton(s):
    """Compare Arabic words ignoring vowels and alef/yā' spelling variants."""
    s = MARKS.sub("", s).replace(TATWEEL, "")
    s = re.sub("[\u0623\u0625\u0622\u0671]", "\u0627", s)      # أ إ آ ٱ -> ا
    return s.replace("\u0649", "\u064a").replace("\u06cc", "\u064a").replace("\u06a9", "\u0643")


def strip_trailing_marks(t):
    while t and MARKS.match(t[-1]):
        t = t[:-1]
    return t


def bare_noun(token):
    """كِتابا -> كِتاب (drop the spelling-alef of indefinite accusative)."""
    t = strip_trailing_marks(token)
    if t.endswith("\u0627") and len(skeleton(t)) >= 3:
        t = t[:-1]
    return strip_trailing_marks(t)


def suffix_offset(token, suffix):
    """Character offset in `token` where the pronoun suffix begins, or None."""
    need = list(suffix)
    i = len(token)
    while need:
        i -= 1
        if i < 0:
            return None
        ch = token[i]
        if MARKS.match(ch):
            continue
        if skeleton(ch) == need[-1]:
            need.pop()
        else:
            return None
    return i


def find_sub(seq, sub):
    n = len(sub)
    return [i for i in range(len(seq) - n + 1) if seq[i:i + n] == sub]


# ---------------------------------------------------------------- read the CSV

def read_rows():
    raw = (HERE / "items.csv").read_text(encoding="utf-8-sig")
    first = raw.splitlines()[0] if raw.strip() else ""
    delim = max(",;\t", key=first.count)          # Excel in some locales uses ;
    reader = csv.DictReader(io.StringIO(raw), delimiter=delim)
    rows = []
    for r in reader:
        r = {(k or "").strip().lower(): clean(v) for k, v in r.items() if k}
        if not any(r.values()):
            continue
        rows.append(r)
    return rows


# ---------------------------------------------------------------- build items

def build_item(r, errors):
    rid = r.get("id") or "(no id)"

    def err(msg):
        errors.append(f"{rid}: {msg}")

    if rid.startswith("#"):
        return None                                   # disabled row
    if not r.get("id"):
        err("missing id")
        return None
    try:
        level = int(r.get("level", ""))
        assert level in (1, 2)
    except Exception:
        err("level must be 1 or 2")
        return None
    sentence = r.get("sentence", "").rstrip(".،؟?!۔ ")
    clause = r.get("clause", "").rstrip(".،؟?!۔ ")
    gloss = r.get("gloss_en", "")
    for name, val in (("sentence", sentence), ("clause", clause), ("gloss_en", gloss)):
        if not val:
            err(f"'{name}' is empty")
    if not (sentence and clause and gloss):
        return None

    tokens = sentence.split()
    ctoks = clause.split()
    sk = [skeleton(t) for t in tokens]
    csk = [skeleton(t) for t in ctoks]

    hits = find_sub(sk, csk)
    if not hits:
        err("the 'clause' words were not found, in order, in the 'sentence'")
        return None
    if len(hits) > 1:
        err("the clause appears more than once in the sentence; reword so it is unambiguous")
        return None
    cs = hits[0]
    ce = cs + len(ctoks) - 1
    if cs == 0:
        err("the clause is at the very start of the sentence, so there is no noun before it to describe")
        return None

    # --- mawṣūf
    mw = r.get("mawsuf_word", "")
    if mw:
        cands = [i for i in range(cs) if sk[i] == skeleton(mw)]
        if not cands:
            err(f"mawsuf_word '{mw}' was not found before the clause")
            return None
        mi = cands[-1]
    else:
        mi = cs - 1
    mdisp = r.get("mawsuf_display") or bare_noun(tokens[mi])

    # --- rābiṭ
    rab_cell = r.get("rabit_word", "")
    fronted = r.get("fronted", "").lower() in ("y", "yes", "1", "true", "x")
    verb = tokens[cs]
    if level == 1:
        if rab_cell.lower() in ("he", "she"):
            pron_en = rab_cell.lower()
        elif rab_cell:
            err("for Level 1 leave rabit_word blank, or type 'he' or 'she'")
            return None
        elif skeleton(verb)[:1] == "\u064a":          # ي
            pron_en = "he"
        elif skeleton(verb)[:1] == "\u062a":          # ت
            pron_en = "she"
        else:
            err("the clause doesn't start with a verb beginning in ي or ت; type 'he' or 'she' in rabit_word")
            return None
        rabit = {
            "type": "hidden",
            "index": cs,
            "pronoun_en": pron_en,
            "pronoun_ar": "هُوَ" if pron_en == "he" else "هِيَ",
        }
        if fronted:
            err("'fronted' only applies to Level 2")
            return None
        ex_en = (f"\u201c{clause}\u201d describes {mdisp}, which is indefinite. "
                 f"The rābiṭ is the hidden {pron_en} inside {verb}.")
        ex_ar = (f"\u00ab{clause}\u00bb جُملة صِفة لِـ\u00ab{mdisp}\u00bb، وَهُوَ نَكِرة. "
                 f"الرابِط هُوَ الضَمير المُستَتِر ({rabit['pronoun_ar']}) في \u00ab{verb}\u00bb.")
    else:
        if not rab_cell:
            err("Level 2 needs rabit_word (copy the word that carries the pronoun suffix)")
            return None
        ri = [i for i in range(cs, ce + 1) if sk[i] == skeleton(rab_cell)]
        if not ri:
            err(f"rabit_word '{rab_cell}' was not found inside the clause")
            return None
        ri = ri[0]
        word_sk = sk[ri]
        suffix = next((s for s in SUFFIXES if word_sk.endswith(s) and len(word_sk) > len(s)), None)
        if not suffix:
            err(f"'{rab_cell}' doesn't end in a recognised pronoun suffix {SUFFIXES}")
            return None
        off = suffix_offset(tokens[ri], suffix)
        label = "\u0640" + suffix
        rabit = {"type": "suffix", "index": ri, "suffix": suffix,
                 "suffix_offset": off, "label": label}
        word = tokens[ri]
        if fronted:
            ex_en = (f"\u201c{clause}\u201d describes {mdisp}, which is indefinite. "
                     f"The rābiṭ is {label} in {word}; the clause is a fronted predicate plus its subject.")
            ex_ar = (f"\u00ab{clause}\u00bb جُملة صِفة لِـ\u00ab{mdisp}\u00bb، وَهُوَ نَكِرة. "
                     f"الرابِط هُوَ \u00ab{label}\u00bb في \u00ab{word}\u00bb؛ الخَبَر مُقَدَّم وَالمُبتَدَأ مُؤَخَّر.")
        else:
            ex_en = (f"\u201c{clause}\u201d describes {mdisp}, which is indefinite. "
                     f"The rābiṭ is {label} in {word}, referring back to {mdisp}.")
            ex_ar = (f"\u00ab{clause}\u00bb جُملة صِفة لِـ\u00ab{mdisp}\u00bb، وَهُوَ نَكِرة. "
                     f"الرابِط هُوَ \u00ab{label}\u00bb في \u00ab{word}\u00bb، وَيَرجِع إلى \u00ab{mdisp}\u00bb.")

    return {
        "id": r["id"],
        "level": level,
        "tokens": tokens,
        "clause_start": cs,
        "clause_end": ce,
        "mawsuf_index": mi,
        "mawsuf_display": mdisp,
        "rabit": rabit,
        "fronted": fronted,
        "clause_text": " ".join(tokens[cs:ce + 1]),
        "gloss_en": gloss,
        "explanation_en": r.get("explanation_en") or ex_en,
        "explanation_ar": r.get("explanation_ar") or ex_ar,
    }


# ---------------------------------------------------------------- preview page

def render_preview(items):
    css = """
body{font:16px/1.5 system-ui,sans-serif;margin:1.5rem;color:#222}
h1{font-size:1.3rem} table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:.5rem .7rem;vertical-align:top;text-align:left}
th{background:#f3f3f3} td.ar{direction:rtl;text-align:right;
font:1.7rem/2.2 Amiri,"Noto Naskh Arabic","Traditional Arabic","Geeza Pro",serif}
.clause{background:#fff2b3;border-radius:.3rem;padding:0 .15rem}
.mawsuf{border-bottom:3px solid #1a5fd0}
.rabit{color:#c0152a;font-weight:bold}
.pron{font-size:.8rem;vertical-align:super;color:#c0152a}
.legend span{margin-right:1.2rem} .small{font-size:.9rem;color:#555}
.fronted{font-size:.8rem;background:#e8e8e8;border-radius:.3rem;padding:0 .3rem}
"""
    def cell(it):
        out = []
        for i, t in enumerate(it["tokens"]):
            inner = html.escape(t)
            rb = it["rabit"]
            if i == rb["index"]:
                if rb["type"] == "suffix" and rb["suffix_offset"] is not None:
                    o = rb["suffix_offset"]
                    inner = html.escape(t[:o]) + '<span class="rabit">' + html.escape(t[o:]) + "</span>"
                elif rb["type"] == "hidden":
                    inner = f'<span class="rabit">{html.escape(t)}</span><span class="pron">{rb["pronoun_ar"]}</span>'
            cls = []
            if it["clause_start"] <= i <= it["clause_end"]:
                cls.append("clause")
            if i == it["mawsuf_index"]:
                cls.append("mawsuf")
            out.append(f'<span class="{" ".join(cls)}">{inner}</span>' if cls else inner)
        return " ".join(out)

    rows = []
    for it in items:
        tag = ' <span class="fronted">fronted</span>' if it["fronted"] else ""
        rows.append(
            f'<tr><td>{html.escape(it["id"])}{tag}</td>'
            f'<td class="ar" lang="ar" dir="rtl">{cell(it)}</td>'
            f'<td>{html.escape(it["gloss_en"])}<div class="small">{html.escape(it["explanation_en"])}</div></td></tr>'
        )
    return (
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Preview</title>'
        f"<style>{css}</style><h1>Jumlat Ṣifa Practice: proofreading preview</h1>"
        '<p class="legend"><span><b class="clause">Clause</b></span>'
        '<span><b class="mawsuf">Mawṣūf</b></span>'
        '<span><b class="rabit">Rābiṭ</b> (hidden pronouns shown as small superscripts)</span></p>'
        "<table><tr><th>ID</th><th>Sentence</th><th>Gloss and auto-explanation</th></tr>"
        + "".join(rows) + "</table></html>"
    )


# ---------------------------------------------------------------- main

def main():
    errors = []
    items, seen = [], set()
    for r in read_rows():
        it = build_item(r, errors)
        if it:
            if it["id"] in seen:
                errors.append(f"{it['id']}: duplicate id")
            seen.add(it["id"])
            items.append(it)
    if errors:
        print("Problems found. Nothing was written.\n")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    if not items:
        print("No items found in items.csv")
        sys.exit(1)

    strings = json.loads((HERE / "strings.json").read_text(encoding="utf-8"))
    payload = {"count": len(items), "items": items}
    (HERE / "items.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    bundle = {"items": items, "strings": strings}
    (HERE / "data.js").write_text(
        "// Generated by build_items.py. Do not edit; edit items.csv / strings.json and rebuild.\n"
        "window.JUMLAT_SIFA = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8")
    (HERE / "preview.html").write_text(render_preview(items), encoding="utf-8")

    n1 = sum(i["level"] == 1 for i in items)
    n2 = sum(i["level"] == 2 for i in items)
    print(f"OK: {len(items)} items ({n1} in Level 1, {n2} in Level 2)")
    print("Wrote data.js, items.json, preview.html")


if __name__ == "__main__":
    main()
