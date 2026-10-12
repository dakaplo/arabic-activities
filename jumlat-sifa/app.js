(function () {
  'use strict';

  var LOCK_LEVEL_2 = false;

  var DATA = window.JUMLAT_SIFA;
  var S = DATA.strings;
  var root = document.getElementById('jumlat-sifa-app');

  var state = {
    lang: 'both',
    screen: 'intro',
    introOpen: false,
    level: 1,
    queue: [],
    pos: 0,
    step: 'start',
    wrong: false,
    streak: 0,
    cleanCount: 0,
    missed: [],
    level1Done: false,
    feedback: null,
    showGloss: false,
    streakMsg: false
  };

  var live = document.createElement('div');
  live.className = 'jsp-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function md(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? vars[k] : m;
    });
  }

  function pick(obj, path) {
    var o = obj;
    path.split('.').forEach(function (k) { o = o[k]; });
    return o;
  }

  function lines(en, ar, tag) {
    tag = tag || 'div';
    var out = '';
    if (state.lang !== 'ar') out += '<' + tag + ' class="jsp-line" lang="en">' + en + '</' + tag + '>';
    if (state.lang !== 'en') out += '<' + tag + ' class="jsp-line jsp-ar" lang="ar" dir="rtl">' + ar + '</' + tag + '>';
    return out;
  }

  function T(obj, vars) {
    return lines(md(fill(obj.en, vars)), md(fill(obj.ar, vars)));
  }

  function tp(path, vars) { return T(pick(S, path), vars); }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function orderItems(items, level) {
    if (level === 2) {
      return shuffle(items.filter(function (i) { return !i.fronted; }))
        .concat(shuffle(items.filter(function (i) { return i.fronted; })));
    }
    return shuffle(items);
  }

  function levelItems(level) {
    return DATA.items.filter(function (i) { return i.level === level; });
  }

  function cur() { return state.queue[state.pos]; }

  function level2Locked() { return LOCK_LEVEL_2 && !state.level1Done; }

  function startRun(level, items) {
    state.level = level;
    state.queue = orderItems(items, level);
    state.pos = 0;
    state.streak = 0;
    state.cleanCount = 0;
    state.missed = [];
    state.screen = 'activity';
    state.introOpen = false;
    beginItem();
  }

  function beginItem() {
    state.step = 'start';
    state.wrong = false;
    state.showGloss = false;
    state.streakMsg = false;
    state.feedback = null;
    render({ focusTile: 0 });
  }

  function header() {
    var title = '<h1 class="jsp-title">' + lines(esc(S.title.en), esc(S.title.ar)) + '</h1>';
    var langs = [['en', S.ui.lang_english, false], ['ar', S.ui.lang_arabic, true], ['both', S.ui.lang_both, false]];
    var btns = langs.map(function (l) {
      return '<button type="button" data-lang="' + l[0] + '" aria-pressed="' + (state.lang === l[0]) + '"' +
        (l[2] ? ' class="jsp-ar-label" lang="ar"' : '') + '>' + esc(l[1].en) + '</button>';
    }).join('');
    var toggle = '<div class="jsp-langs" role="group" aria-label="' + esc(S.ui.language.en + ' / ' + S.ui.language.ar) + '">' + btns + '</div>';
    var link = '<p class="jsp-linkbar"><button type="button" class="jsp-link" data-act="intro">' +
      lines(esc(S.ui.show_intro.en), esc(S.ui.show_intro.ar), 'span') + '</button></p>';
    return '<div class="jsp-header">' + title + toggle + '</div>' + link;
  }

  function sentenceHTML(tokens, o) {
    var html = '';
    tokens.forEach(function (tok, i) {
      var cls = ['jsp-tile'];
      if (o.clauseSpan && i >= o.start && i <= o.end) cls.push('jsp-clause');
      if (o.startMark === i && !o.clauseSpan) cls.push('jsp-start');
      if (o.mawsuf === i) cls.push('jsp-mawsuf');
      var inner = esc(tok);
      var label = '';
      if (o.rabit && o.rabit.index === i) {
        if (o.rabit.type === 'hidden') {
          cls.push('jsp-rabit');
          label = '<span class="jsp-pron" lang="ar">' + esc(o.rabit.pronoun_ar) + '</span>';
        } else if (o.rabit.suffix_offset === null || o.rabit.suffix_offset === undefined) {
          cls.push('jsp-rabit');
        } else {
          inner = esc(tok.slice(0, o.rabit.suffix_offset)) +
            '<span class="jsp-rabit jsp-suffix">' + esc(tok.slice(o.rabit.suffix_offset)) + '</span>';
        }
      }
      html += '<span class="jsp-slot">' + label +
        '<button type="button" class="' + cls.join(' ') + '" lang="ar" data-i="' + i + '"' +
        (o.disabled ? ' disabled' : '') + '>' + inner + '</button></span>';
    });
    return html;
  }

  function wrongHint(item, idx) {
    var f = state.step;
    if (f === 'start') {
      if (idx === item.mawsuf_index) return 'hint_noun_first';
      if (idx < item.clause_start) return 'hint_earlier_words';
    } else if (f === 'end') {
      if (idx < item.clause_start) return 'hint_end_before_start';
      if (idx >= item.clause_start && idx < item.clause_end) return 'hint_too_short';
    } else if (f === 'mawsuf') {
      return 'hint_wrong_mawsuf';
    } else if (f === 'rabit') {
      return 'hint_wrong_rabit';
    }
    return null;
  }

  function onTile(idx, btn) {
    var item = cur();
    if (state.step === 'done') return;
    var ok;
    if (state.step === 'start') ok = idx === item.clause_start;
    else if (state.step === 'end') ok = idx === item.clause_end;
    else if (state.step === 'mawsuf') ok = idx === item.mawsuf_index;
    else ok = idx === item.rabit.index;

    if (!ok) {
      if (!state.wrong) { state.wrong = true; state.streak = 0; }
      state.feedback = { bad: true, hint: wrongHint(item, idx) };
      render({ focusTile: idx, shake: idx });
      return;
    }

    state.feedback = null;
    if (state.step === 'start') state.step = 'end';
    else if (state.step === 'end') state.step = 'mawsuf';
    else if (state.step === 'mawsuf') state.step = item.rabit.type === 'hidden' ? 'done' : 'rabit';
    else state.step = 'done';

    if (state.step === 'done') finishItem(item);
    render(state.step === 'done' ? { focusNext: true } : { focusTile: idx });
  }

  function finishItem(item) {
    if (!state.wrong) {
      state.cleanCount++;
      state.streak++;
      state.streakMsg = state.streak >= 3;
    } else {
      state.missed.push(item);
    }
  }

  function activityHTML() {
    var item = cur();
    var total = state.queue.length;
    var step = state.step;
    var o = {
      start: item.clause_start,
      end: item.clause_end,
      startMark: step === 'end' ? item.clause_start : -1,
      clauseSpan: step !== 'start' && step !== 'end',
      mawsuf: (step === 'rabit' || step === 'done') ? item.mawsuf_index : -1,
      rabit: step === 'done' ? item.rabit : null,
      disabled: step === 'done'
    };
    if (step === 'mawsuf') o.mawsuf = -1;
    var pct = Math.round((state.pos + (step === 'done' ? 1 : 0)) / total * 100);

    var html = '<div class="jsp-progress"><span>' +
      lines(esc(fill(S.ui.item_counter.en, { n: state.pos + 1, total: total })), esc(fill(S.ui.item_counter.ar, { n: state.pos + 1, total: total })), 'span') +
      '</span>' + (state.streak > 0 ? '<span class="jsp-streak">' +
        lines(esc(fill(S.ui.streak_counter.en, { n: state.streak })), esc(fill(S.ui.streak_counter.ar, { n: state.streak })), 'span') + '</span>' : '') +
      '</div><div class="jsp-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>';

    html += '<div class="jsp-sentence" lang="ar" dir="rtl">' + sentenceHTML(item.tokens, o) + '</div>';
    html += '<div class="jsp-slot-live"></div>';
    html += '<div class="jsp-actions">';
    if (step === 'done') {
      html += '<button type="button" class="jsp-btn jsp-primary" data-act="next">' + lines(esc(S.ui.next.en), esc(S.ui.next.ar), 'span') + '</button>';
    } else if (!state.showGloss) {
      html += '<button type="button" class="jsp-btn" data-act="gloss">' + lines(esc(S.ui.show_translation.en), esc(S.ui.show_translation.ar), 'span') + '</button>';
    }
    html += '<button type="button" class="jsp-btn" data-act="levels">' + lines(esc(S.ui.back_to_levels.en), esc(S.ui.back_to_levels.ar), 'span') + '</button>';
    html += '</div>';
    return html;
  }

  function liveHTML() {
    var item = cur();
    var step = state.step;
    var h = '';
    if (state.feedback && state.feedback.bad) {
      h += '<div class="jsp-bad">' + tp('feedback.try_again') + '</div>';
      if (state.feedback.hint) h += '<div class="jsp-hint">' + tp('feedback.' + state.feedback.hint) + '</div>';
    }
    if (step === 'start') h += '<div class="jsp-prompt">' + tp('prompts.tap_start') + '</div>';
    else if (step === 'end') h += '<div class="jsp-prompt">' + tp('prompts.tap_end') + '</div>';
    else if (step === 'mawsuf') h += '<div class="jsp-prompt">' + tp('prompts.tap_mawsuf') + '</div>';
    else if (step === 'rabit') h += '<div class="jsp-prompt">' + tp('prompts.tap_rabit') + '</div>';
    else {
      if (item.rabit.type === 'hidden') {
        h += '<div class="jsp-caption">' + lines(
          esc(S.prompts.hidden_pronoun.en) + ' <span lang="ar" class="jsp-ar">' + esc(item.rabit.pronoun_ar) + '</span> (' + esc(item.rabit.pronoun_en) + ')',
          esc(S.prompts.hidden_pronoun.ar) + ' <span lang="ar">' + esc(item.rabit.pronoun_ar) + '</span>') + '</div>';
      }
      h += '<div class="jsp-good">' + tp('feedback.correct') + '</div>';
      if (state.streakMsg) h += '<div class="jsp-streakmsg">' + tp('feedback.streak') + '</div>';
    }
    if (step === 'done' || state.showGloss) {
      h += '<div class="jsp-gloss" lang="en">' + esc(item.gloss_en) + '</div>';
    }
    if (step === 'done') {
      h += '<div class="jsp-expl">' + lines(esc(item.explanation_en), esc(item.explanation_ar)) + '</div>';
    }
    return h;
  }

  function introBlock(withCards) {
    var I = S.intro;
    var ex = I.example;
    var h = '<h2 class="jsp-h2">' + T(I.heading) + '</h2>';
    h += '<div class="jsp-card">' + T(I.lead);
    h += '<div style="margin-top:8px">' + T(I.look_for) + '</div>';
    h += '<ul class="jsp-points" lang="en"' + (state.lang === 'ar' ? ' hidden' : '') + '>' +
      I.points.en.map(function (p) { return '<li>' + md(p) + '</li>'; }).join('') + '</ul>';
    h += '<ul class="jsp-ar" lang="ar" dir="rtl"' + (state.lang === 'en' ? ' hidden' : '') + '>' +
      I.points.ar.map(function (p) { return '<li>' + md(p) + '</li>'; }).join('') + '</ul>';
    h += '</div>';

    var exRabit = { type: 'hidden', index: ex.rabit_index, pronoun_ar: 'هُوَ' };
    h += '<div class="jsp-card"><div class="jsp-sentence" lang="ar" dir="rtl">' +
      sentenceHTML(ex.tokens, { start: ex.clause_start, end: ex.clause_end, clauseSpan: true, mawsuf: ex.mawsuf_index, rabit: exRabit, disabled: true }) +
      '</div><div class="jsp-gloss" lang="en" style="font-style:italic">' + esc(ex.gloss_en) + '</div>' +
      '<div class="jsp-expl" style="margin-top:8px">' + lines(md(ex.explanation.en), md(ex.explanation.ar)) + '</div></div>';
    h += '<div class="jsp-card">' + T(I.heads_up) + '</div>';

    if (withCards) {
      h += '<div class="jsp-levels">';
      ['1', '2'].forEach(function (k) {
        var L = S.levels[k];
        var locked = k === '2' && level2Locked();
        var n = levelItems(Number(k)).length;
        h += '<button type="button" class="jsp-levelcard" data-level="' + k + '"' + (locked ? ' disabled' : '') + '>' +
          '<strong class="jsp-lt">' + lines(md(L.title.en), md(L.title.ar), 'span') + '</strong>' +
          T(L.blurb) +
          '<span class="jsp-line" style="display:block;margin-top:6px"><strong>' + esc(S.ui.start.en) + (state.lang !== 'en' ? ' / <span lang="ar" class="jsp-ar">' + esc(S.ui.start.ar) + '</span>' : '') + ' (' + n + ')</strong></span>' +
          '</button>';
      });
      h += '</div>';
    } else {
      h += '<div class="jsp-actions"><button type="button" class="jsp-btn jsp-primary" data-act="close">' + lines(esc(S.ui.close.en), esc(S.ui.close.ar), 'span') + '</button></div>';
    }
    return h;
  }

  function completeHTML() {
    var total = state.queue.length;
    var h = '<h2 class="jsp-h2">' + tp('complete.title') + '</h2>';
    h += '<div class="jsp-score">' + tp('complete.score', { n: state.cleanCount, total: total }) + '</div>';
    if (!state.missed.length) {
      h += '<div class="jsp-card jsp-good">' + tp('complete.perfect') + '</div>';
    } else {
      h += '<h3 class="jsp-h2" style="font-size:1.1rem">' + tp('complete.review_heading') + '</h3><ul class="jsp-review">';
      state.missed.forEach(function (it) {
        h += '<li><div class="jsp-ar" lang="ar" dir="rtl">' + esc(it.tokens.join(' ')) + '</div><div lang="en">' + esc(it.gloss_en) + '</div></li>';
      });
      h += '</ul>';
    }
    h += '<div class="jsp-actions">';
    function b(act, key, primary) {
      var o = key.indexOf('.') > -1 ? pick(S, key) : S.ui[key];
      return '<button type="button" class="jsp-btn' + (primary ? ' jsp-primary' : '') + '" data-act="' + act + '">' + lines(esc(o.en), esc(o.ar), 'span') + '</button>';
    }
    if (state.missed.length) h += b('review', 'complete.review_button', true);
    h += b('replay', 'complete.replay_button', !state.missed.length);
    if (state.level === 1) h += b('nextlevel', 'complete.next_level_button', false);
    h += b('levels', 'back_to_levels', false);
    h += '</div>';
    return h;
  }

  function render(opts) {
    opts = opts || {};
    var body;
    if (state.introOpen) body = introBlock(state.screen === 'intro');
    else if (state.screen === 'intro') body = introBlock(true);
    else if (state.screen === 'activity') body = activityHTML();
    else body = completeHTML();

    root.innerHTML = header() + '<main class="jsp-main">' + body + '</main>';

    var slot = root.querySelector('.jsp-slot-live');
    if (slot && !state.introOpen) {
      slot.appendChild(live);
      live.innerHTML = liveHTML();
    }

    if (state.screen === 'activity' && !state.introOpen) {
      var tiles = root.querySelectorAll('.jsp-main .jsp-sentence .jsp-tile');
      if (opts.shake !== undefined && tiles[opts.shake]) tiles[opts.shake].classList.add('jsp-shake');
      if (opts.focusNext) {
        var nb = root.querySelector('[data-act="next"]');
        if (nb) nb.focus();
      } else if (opts.focusTile !== undefined && tiles[opts.focusTile]) {
        tiles[opts.focusTile].focus();
      }
    }
  }

  function goLevels() {
    state.screen = 'intro';
    state.introOpen = false;
    render();
    window.scrollTo(0, 0);
  }

  function completeRun() {
    if (state.level === 1) state.level1Done = true;
    state.screen = 'complete';
    render();
    var h = root.querySelector('.jsp-main .jsp-h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t || !root.contains(t)) return;

    if (t.hasAttribute('data-lang')) { state.lang = t.getAttribute('data-lang'); render(); var again = root.querySelector('[data-lang="' + state.lang + '"]'); if (again) again.focus(); return; }
    if (t.hasAttribute('data-level')) {
      var lv = Number(t.getAttribute('data-level'));
      if (lv === 2 && level2Locked()) return;
      startRun(lv, levelItems(lv));
      return;
    }
    if (t.hasAttribute('data-i')) { onTile(Number(t.getAttribute('data-i')), t); return; }

    var act = t.getAttribute('data-act');
    if (act === 'intro') { state.introOpen = true; render(); window.scrollTo(0, 0); }
    else if (act === 'close') { state.introOpen = false; render(); }
    else if (act === 'levels') goLevels();
    else if (act === 'gloss') { state.showGloss = true; render({ focusTile: 0 }); }
    else if (act === 'next') {
      if (state.pos + 1 >= state.queue.length) completeRun();
      else { state.pos++; beginItem(); }
    }
    else if (act === 'review') startRun(state.level, state.missed.slice());
    else if (act === 'replay') startRun(state.level, levelItems(state.level));
    else if (act === 'nextlevel') startRun(2, levelItems(2));
  });

  (function init() {
    var p = new URLSearchParams(window.location.search);
    var lang = p.get('lang');
    if (lang === 'en' || lang === 'ar' || lang === 'both') state.lang = lang;
    var lv = Number(p.get('level'));
    if ((lv === 1 || lv === 2) && !(lv === 2 && level2Locked()) && levelItems(lv).length) {
      startRun(lv, levelItems(lv));
    } else {
      render();
    }
  })();
})();
