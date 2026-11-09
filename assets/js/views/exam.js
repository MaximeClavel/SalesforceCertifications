/* Examen blanc : chronomètre, marquage, « Voir la réponse » qui met le chrono en pause,
   score par domaine, correction détaillée et historique des tentatives.
   Formats possibles (cert.json → mockExams) :
   - source "exam" : toute la banque exam.json, dans un ordre mélangé ;
   - source "quiz" ou "exam" avec "allocation" : tirage aléatoire du nombre de questions demandé par domaine. */

import { $, $$, escapeHtml, richText, letter, shuffle, sameSet, formatClock, formatDuration, focusNoScroll, hintText, answersLabel } from '../lib/util.js';

export function createExam(ctx, root, app){
  const meta = ctx.meta;
  const examInfo = meta.exam || {};
  const PASS_RATE = typeof examInfo.passRate === 'number' ? examInfo.passRate : 0.7;
  const PASS_PCT = Math.round(PASS_RATE * 100);
  const lang = ctx.qLang;

  const BANKS = { exam: ctx.exam ? ctx.exam.questions : [], quiz: ctx.quiz ? ctx.quiz.questions : [] };
  const BY = { exam: {}, quiz: {} };
  Object.keys(BANKS).forEach(k => BANKS[k].forEach(q => { BY[k][q.id] = q; }));
  const MODES = buildModes();
  const MODE_BY_ID = {};
  MODES.forEach(m => { MODE_BY_ID[m.id] = m; });
  const VERSION = 'e' + (ctx.exam ? ctx.exam.version || 1 : 0) + 'q' + (ctx.quiz ? ctx.quiz.version || 1 : 0);
  const KEY = 'exam-' + VERSION;
  const HIST_KEY = 'exam-history';

  function buildModes(){
    const list = Array.isArray(meta.mockExams) && meta.mockExams.length ? meta.mockExams.slice() :
      (ctx.exam ? [{ id: 'full', label: 'Examen blanc', source: 'exam', durationMinutes: examInfo.durationMinutes || 90 }] : []);
    return list.filter(m => BANKS[m.source] && BANKS[m.source].length).map(m => Object.assign({}, m, {
      count: m.allocation ? Object.keys(m.allocation).reduce((s, k) => s + Math.min(m.allocation[k], BANKS[m.source].filter(q => q.domain === k).length), 0) : BANKS[m.source].length
    }));
  }

  function q(id){ return BY[exam.source][id]; }

  /* ---------- Gabarit ---------- */
  root.innerHTML =
    '<section id="exam-intro"></section>' +
    '<section id="exam-run" hidden>' +
      '<div class="exam-bar">' +
        '<span id="exam-pos"></span><span id="exam-count"></span>' +
        '<span><span class="exam-bar-label" id="exam-timer-label">Temps restant</span> <span class="exam-timer" id="exam-timer"></span></span>' +
      '</div>' +
      '<div class="confirm-panel" id="exam-confirm" hidden><p id="exam-confirm-text"></p><div class="confirm-actions">' +
        '<button type="button" class="btn-ghost" id="exam-confirm-cancel">Continuer l\'examen</button>' +
        '<button type="button" class="btn-primary" id="exam-confirm-ok">Terminer et voir mon score</button></div></div>' +
      '<div class="exam-layout"><article class="exam-card" id="exam-card"></article>' +
        '<aside class="exam-palette" aria-label="Navigation entre les questions"><div class="pal-title">Questions</div>' +
        '<div class="palette-grid" id="exam-palette"></div>' +
        '<div class="pal-legend"><span><i class="lg lg-ans"></i>Répondue</span><span><i class="lg lg-mark"></i>Marquée</span><span><i class="lg lg-cur"></i>En cours</span></div>' +
        '<button type="button" class="btn-ghost btn-finish" id="exam-finish">Terminer l\'examen</button></aside></div>' +
    '</section>' +
    '<section id="exam-result" hidden>' +
      '<div class="subhead result-hero" id="exam-result-hero"></div>' +
      '<div class="result-block"><h2>Résultats par domaine</h2><p class="result-note">Le trait vertical sur chaque barre marque le seuil de ' + PASS_PCT + ' %.</p><div class="domain-rows" id="exam-domains"></div></div>' +
      '<div class="result-actions"><button type="button" class="btn-primary" id="exam-new">Nouvel examen</button></div>' +
      '<div class="result-block"><div class="review-head"><h2>Correction détaillée</h2><div class="qfilters" id="review-filters">' +
        '<button type="button" class="qfilter active" data-filter="all">Toutes</button>' +
        '<button type="button" class="qfilter" data-filter="wrong">Erreurs</button>' +
        '<button type="button" class="qfilter" data-filter="marked">Marquées</button>' +
        '<button type="button" class="qfilter" data-filter="blank">Sans réponse</button></div></div>' +
        '<div class="qlist" id="exam-review"></div></div>' +
      '<div class="exam-history" id="exam-history-result"></div>' +
    '</section>';
  root.style.setProperty('--pass-pct', PASS_PCT + '%');

  const elIntro = $('#exam-intro', root), elRun = $('#exam-run', root), elResult = $('#exam-result', root);
  const elCard = $('#exam-card', root), elPalette = $('#exam-palette', root);
  const elTimer = $('#exam-timer', root), elTimerLabel = $('#exam-timer-label', root);
  const elPos = $('#exam-pos', root), elCount = $('#exam-count', root), elConfirm = $('#exam-confirm', root);
  let reviewFilter = 'all';

  /* ---------- État ---------- */
  function validExam(s){
    if(!s || typeof s !== 'object') return false;
    if(s.status === 'idle') return true;
    if(s.status !== 'running' && s.status !== 'done') return false;
    if(!MODE_BY_ID[s.mode] || !BY[s.source] || !Array.isArray(s.order) || !s.order.length) return false;
    return s.order.every(id => BY[s.source][id] && Array.isArray(s.perms && s.perms[id]) && s.perms[id].length === BY[s.source][id].options.length) &&
      s.answers && s.marked && typeof s.startedAt === 'number' && typeof s.durationMs === 'number';
  }
  let exam = ctx.store.get(KEY, null);
  if(!validExam(exam)) exam = { status: 'idle' };
  if(exam.status !== 'idle'){
    if(!exam.revealed || typeof exam.revealed !== 'object') exam.revealed = {};
    if(typeof exam.pausedMs !== 'number') exam.pausedMs = 0;
    if(typeof exam.pausedAt !== 'number') exam.pausedAt = null;
  }
  let history = ctx.store.get(HIST_KEY, []);
  if(!Array.isArray(history)) history = [];
  history = history.filter(h => h && typeof h.correct === 'number' && typeof h.total === 'number' && h.total > 0);

  function save(){ ctx.store.set(KEY, exam); }
  function selectionOf(id){ return exam.answers[id] || []; }
  function isRight(id){ const sel = selectionOf(id); return sel.length > 0 && sameSet(sel, q(id).answer); }
  function isAnswered(id){ return selectionOf(id).length === q(id).answer.length; }
  function answeredCount(){ return exam.order.filter(isAnswered).length; }
  function markedCount(){ return exam.order.filter(id => exam.marked[id]).length; }
  function revealedCount(){ return exam.order.filter(id => exam.revealed[id]).length; }
  /* Une pause commence à « Voir la réponse » et se termine au changement de question. */
  function remaining(){ return exam.startedAt + exam.durationMs + (exam.pausedMs || 0) - (exam.pausedAt || Date.now()); }
  function pauseTimer(){ if(!exam.pausedAt) exam.pausedAt = Date.now(); }
  function resumeTimer(){
    if(!exam.pausedAt) return;
    exam.pausedMs = (exam.pausedMs || 0) + Math.max(0, Date.now() - exam.pausedAt);
    exam.pausedAt = null;
  }
  function activeMs(){ return exam.endedAt - exam.startedAt - (exam.pausedMs || 0); }

  /* ---------- Accueil ---------- */
  function distribution(mode){
    const bank = BANKS[mode.source];
    return ctx.domains.map(d => {
      const n = mode.allocation ? Math.min(mode.allocation[d.id] || 0, bank.filter(x => x.domain === d.id).length) : bank.filter(x => x.domain === d.id).length;
      return n ? n + ' en ' + escapeHtml(d.label) : '';
    }).filter(Boolean).join(', ');
  }

  function renderIntro(){
    const primary = MODES[0];
    const fixedMulti = !primary.allocation ? BANKS[primary.source].filter(x => x.answer.length > 1).length : null;
    const several = MODES.length > 1;
    const real = examInfo.scoredQuestions && examInfo.durationMinutes ?
      'L\'examen officiel compte ' + examInfo.scoredQuestions + ' questions notées' + (examInfo.unscoredQuestions ? ' et jusqu\'à ' + examInfo.unscoredQuestions + ' non notées' : '') + ', en ' + examInfo.durationMinutes + ' minutes.' : '';
    const notes = [
      several ? '' : 'Répartition : ' + distribution(primary) + '.',
      primary.allocation || several ? 'Les questions sont tirées au hasard dans la banque, en respectant le poids de chaque domaine. L\'ordre des réponses est mélangé à chaque tentative.' : 'Les questions et l\'ordre des réponses sont mélangés à chaque tentative.',
      'Une question à réponses multiples ne compte que si toutes les bonnes réponses sont cochées, comme à l\'examen officiel.',
      '« Voir la réponse » affiche la bonne réponse et l\'explication de la question en cours, puis verrouille ta réponse. Le chrono se met en pause et reprend dès que tu passes à une autre question. Le nombre de réponses vues apparaît dans le résultat et l\'historique.',
      'Le chrono continue si tu changes d\'onglet ou recharges la page, sauf pendant une pause « Voir la réponse ». À zéro, l\'examen est soumis automatiquement.',
      real,
      lang === 'en' ? 'Questions et réponses en anglais, explications en français.' : '',
      'Ces questions sont rédigées pour l\'entraînement à partir de la documentation officielle ; elles ne proviennent pas de l\'examen.'
    ].filter(Boolean);
    const modeCards = several ? '<div class="exam-modes">' + MODES.map((m, i) =>
      '<div class="exam-mode"><h2>' + escapeHtml(m.label) + '</h2>' +
        '<p class="mode-facts">' + m.count + ' questions · ' + m.durationMinutes + ' min · seuil ' + PASS_PCT + ' %</p>' +
        (m.description ? '<p>' + richText(m.description) + '</p>' : '') +
        '<p>' + distribution(m) + '</p>' +
        '<button type="button" class="' + (i === 0 ? 'btn-primary' : 'btn-ghost') + '" data-start="' + escapeHtml(m.id) + '">Démarrer</button></div>').join('') + '</div>' : '';
    elIntro.innerHTML =
      '<div class="subhead">' +
        '<div class="eyebrow">Examen blanc</div>' +
        '<h1>' + (several ? 'Choisis ton format' : primary.count + ' questions, ' + primary.durationMinutes + ' minutes') + '</h1>' +
        '<p class="sub">Les conditions de la vraie certification : chronomètre, questions à réponses multiples, marquage pour révision, score par domaine et correction détaillée à la fin. Pour vérifier une question en cours de route, « Voir la réponse » l\'affiche tout de suite et met le chrono en pause.</p>' +
        (several ? modeCards :
          '<div class="exam-rules">' +
            '<div class="exam-rule"><b>' + primary.count + '</b><span>questions notées</span></div>' +
            '<div class="exam-rule"><b>' + primary.durationMinutes + ' min</b><span>au chronomètre</span></div>' +
            '<div class="exam-rule"><b>' + PASS_PCT + ' %</b><span>pour réussir, soit ' + Math.ceil(primary.count * PASS_RATE) + ' bonnes réponses</span></div>' +
            (fixedMulti != null ? '<div class="exam-rule"><b>' + fixedMulti + '</b><span>questions à réponses multiples</span></div>' : '') +
          '</div>') +
        '<ul class="exam-notes">' + notes.map(n => '<li>' + n + '</li>').join('') + '</ul>' +
        (several ? '' : '<button type="button" class="btn-primary" data-start="' + escapeHtml(primary.id) + '">Démarrer l\'examen</button>') +
      '</div>' +
      '<div class="exam-history" id="exam-history-intro"></div>';
    renderHistory($('#exam-history-intro', root));
  }

  function startExam(modeId){
    const mode = MODE_BY_ID[modeId];
    if(!mode) return;
    const bank = BANKS[mode.source];
    let ids;
    if(mode.allocation){
      ids = [];
      ctx.domains.forEach(d => {
        const n = mode.allocation[d.id] || 0;
        ids = ids.concat(shuffle(bank.filter(x => x.domain === d.id)).slice(0, n).map(x => x.id));
      });
    } else ids = bank.map(x => x.id);
    ids = shuffle(ids);
    const perms = {};
    ids.forEach(id => { perms[id] = shuffle(BY[mode.source][id].options.map((_, i) => i)); });
    exam = {
      status: 'running', mode: mode.id, source: mode.source,
      order: ids, perms, answers: {}, marked: {}, revealed: {}, current: 0,
      startedAt: Date.now(), durationMs: mode.durationMinutes * 60000, pausedMs: 0, pausedAt: null
    };
    save();
    showView();
    window.scrollTo(0, 0);
  }

  /* ---------- Épreuve ---------- */
  function renderQuestion(){
    const id = exam.order[exam.current];
    const item = q(id);
    const multi = item.answer.length > 1;
    const sel = selectionOf(id);
    const marked = !!exam.marked[id];
    const shown = !!exam.revealed[id];
    const last = exam.current === exam.order.length - 1;
    let html =
      '<div class="exam-qhead"><span class="exam-qnum">Question ' + (exam.current + 1) + '</span>' +
      '<button type="button" class="btn-ghost btn-mark" id="exam-mark" aria-pressed="' + marked + '">' + (marked ? 'Marquée pour révision' : 'Marquer pour révision') + '</button></div>' +
      '<p class="exam-prompt" lang="' + lang + '">' + richText(item.question) + '</p>' +
      (item.code ? '<pre class="exam-code">' + escapeHtml(item.code) + '</pre>' : '') +
      '<p class="exam-hint" lang="' + lang + '">' + hintText(lang, item.answer.length) + '</p>' +
      '<div class="exam-options' + (item.codeOptions ? ' code-opts' : '') + '" role="group" aria-label="' + answersLabel(lang) + '" lang="' + lang + '">';
    exam.perms[id].forEach((orig, pos) => {
      const inputId = 'ex-' + id + '-' + orig;
      const checked = sel.indexOf(orig) >= 0;
      let cls = 'exam-opt';
      if(shown) cls += ' revealed' + (item.answer.indexOf(orig) >= 0 ? ' correct' : (checked ? ' incorrect' : ''));
      else if(checked) cls += ' selected';
      html += '<label class="' + cls + '" for="' + escapeHtml(inputId) + '">' +
        '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="ex-' + escapeHtml(id) + '" id="' + escapeHtml(inputId) + '" data-orig="' + orig + '"' + (checked ? ' checked' : '') + (shown ? ' disabled' : '') + '>' +
        '<span class="ol">' + letter(pos) + '.</span><span class="otext">' + richText(item.options[orig]) + '</span>' +
        (shown && checked ? '<span class="yourpick" lang="fr">Ton choix</span>' : '') + '</label>';
    });
    html += '</div>';
    if(shown){
      const verdict = isRight(id) ? '<span class="rstatus ok">Juste</span>' :
        (sel.length ? '<span class="rstatus ko">Faux</span>' : '<span class="rstatus none">Sans réponse</span>');
      html += '<div class="exam-answer" id="exam-answer" tabindex="-1">' + verdict +
        '<div class="qexplain"><b>Explication</b><p>' + richText(item.explanation) + '</p></div>' +
        (exam.pausedAt ? '<p class="exam-paused-note">Chrono en pause : il reprend dès que tu passes à une autre question.</p>' : '') + '</div>';
    }
    html += '<div class="exam-nav">' +
      '<button type="button" class="btn-ghost" id="exam-prev"' + (exam.current === 0 ? ' disabled' : '') + '>← Précédente</button>' +
      (shown ? '' : '<button type="button" class="btn-ghost btn-reveal" id="exam-reveal">Voir la réponse</button>') +
      '<button type="button" class="' + (last ? 'btn-primary' : 'btn-ghost') + '" id="exam-next">' + (last ? 'Terminer l\'examen' : 'Suivante →') + '</button></div>';
    elCard.innerHTML = html;
    syncOptionStates();
  }

  function syncOptionStates(){
    const id = exam.order[exam.current];
    if(exam.revealed[id]) return;
    const item = q(id);
    const sel = selectionOf(id);
    const full = item.answer.length > 1 && sel.length >= item.answer.length;
    $$('.exam-opt', elCard).forEach(label => {
      const input = label.querySelector('input');
      const on = sel.indexOf(parseInt(input.dataset.orig, 10)) >= 0;
      const lock = full && !on;
      input.checked = on;
      input.disabled = lock;
      label.classList.toggle('selected', on);
      label.classList.toggle('locked', lock);
    });
  }

  function renderChrome(){
    const n = exam.order.length, marked = markedCount(), rev = revealedCount();
    elPos.textContent = 'Question ' + (exam.current + 1) + ' / ' + n;
    elCount.textContent = answeredCount() + ' / ' + n + ' répondues' +
      (marked ? ' · ' + marked + ' marquée' + (marked > 1 ? 's' : '') : '') +
      (rev ? ' · ' + rev + ' réponse' + (rev > 1 ? 's' : '') + ' vue' + (rev > 1 ? 's' : '') : '');
    elPalette.innerHTML = exam.order.map((id, i) => {
      const ans = isAnswered(id), mk = !!exam.marked[id], cur = i === exam.current;
      return '<button type="button" class="pal' + (ans ? ' answered' : '') + (mk ? ' marked' : '') + (cur ? ' current' : '') + '" data-i="' + i + '"' +
        ' aria-label="Question ' + (i + 1) + (ans ? ', répondue' : ', sans réponse') + (mk ? ', marquée' : '') + '"' +
        (cur ? ' aria-current="true"' : '') + '>' + (i + 1) + '</button>';
    }).join('');
  }

  function goTo(i){
    if(i < 0 || i >= exam.order.length) return;
    if(i !== exam.current) resumeTimer();
    exam.current = i;
    save();
    renderQuestion();
    renderChrome();
    tick();
    const top = elCard.getBoundingClientRect().top;
    if(top < 0 || top > window.innerHeight * 0.6) elCard.scrollIntoView({ block: 'start' });
  }

  function tick(){
    if(exam.status !== 'running') return;
    const left = remaining();
    if(left <= 0){ finishExam('timeout'); return; }
    const paused = !!exam.pausedAt;
    elTimer.textContent = formatClock(left);
    elTimer.classList.toggle('low', !paused && left < 10 * 60 * 1000);
    elTimer.classList.toggle('paused', paused);
    elTimerLabel.textContent = paused ? 'Chrono en pause' : 'Temps restant';
    elTimerLabel.classList.toggle('paused', paused);
  }

  function revealCurrent(){
    const id = exam.order[exam.current];
    if(exam.revealed[id]) return;
    exam.revealed[id] = true;
    pauseTimer();
    save();
    renderQuestion();
    renderChrome();
    tick();
    const panel = $('#exam-answer', root);
    if(panel){ focusNoScroll(panel); panel.scrollIntoView({ block: 'nearest' }); }
  }

  function openConfirm(){
    const blank = exam.order.length - answeredCount();
    const marked = markedCount();
    const parts = [];
    if(blank) parts.push(blank + ' question' + (blank > 1 ? 's' : '') + ' sans réponse complète');
    if(marked) parts.push(marked + ' question' + (marked > 1 ? 's' : '') + ' marquée' + (marked > 1 ? 's' : '') + ' pour révision');
    $('#exam-confirm-text', root).textContent = (parts.length ? 'Il reste ' + parts.join(' et ') + '. ' : 'Toutes les questions ont une réponse. ') +
      'Une fois l\'examen terminé, tu ne pourras plus modifier tes réponses.';
    elConfirm.hidden = false;
    elConfirm.scrollIntoView({ block: 'center' });
    $('#exam-confirm-ok', root).focus();
  }

  function finishExam(reason){
    if(exam.status !== 'running') return;
    resumeTimer();
    exam.status = 'done';
    exam.endedAt = Math.min(Date.now(), exam.startedAt + exam.durationMs + (exam.pausedMs || 0));
    exam.reason = reason;
    const correct = exam.order.filter(isRight).length;
    history.unshift({ at: exam.endedAt, mode: exam.mode, correct, total: exam.order.length, duration: activeMs(), revealed: revealedCount() });
    history = history.slice(0, 10);
    ctx.store.set(HIST_KEY, history);
    save();
    app.updateSummary({ lastExam: { at: exam.endedAt, correct, total: exam.order.length, passed: correct >= Math.ceil(exam.order.length * PASS_RATE) } });
    elConfirm.hidden = true;
    reviewFilter = 'all';
    showView();
    if(!root.hidden) window.scrollTo(0, 0);
  }

  /* ---------- Résultat ---------- */
  function renderResult(){
    const n = exam.order.length;
    const correct = exam.order.filter(isRight).length;
    const passCount = Math.ceil(n * PASS_RATE);
    const pct = Math.round(correct / n * 100);
    const passed = correct >= passCount;
    const rev = revealedCount();
    const mode = MODE_BY_ID[exam.mode];
    $('#exam-result-hero', root).innerHTML =
      '<div class="eyebrow">Résultat · ' + escapeHtml(mode ? mode.label : 'Examen blanc') + '</div>' +
      '<span class="verdict ' + (passed ? 'pass' : 'fail') + '">' + (passed ? 'Réussi' : 'Non réussi') + '</span>' +
      '<div class="score-big">' + pct + ' %</div>' +
      '<p class="score-meta"><b>' + correct + ' / ' + n + '</b> bonnes réponses · seuil : <b>' + passCount + '</b> (' + PASS_PCT + ' %) · temps utilisé : <b>' + formatDuration(activeMs()) + '</b>' + (exam.pausedMs ? ' (hors pauses)' : '') + '</p>' +
      (exam.reason === 'timeout' ? '<p class="score-meta">Le temps était écoulé : l\'examen a été soumis automatiquement.</p>' : '') +
      (rev ? '<p class="score-meta">' + rev + ' réponse' + (rev > 1 ? 's' : '') + ' vue' + (rev > 1 ? 's' : '') + ' pendant l\'examen : ce score n\'a pas été obtenu en conditions réelles.</p>' : '');

    $('#exam-domains', root).innerHTML = ctx.domains.map(d => {
      const ids = exam.order.filter(id => q(id).domain === d.id);
      if(!ids.length) return '';
      const ok = ids.filter(isRight).length;
      const p = Math.round(ok / ids.length * 100);
      const pass = ok / ids.length >= PASS_RATE;
      const label = escapeHtml(d.label);
      return '<div class="drow">' +
        '<div class="drow-name">' + label + '<small>' + (d.weight || 0) + ' % de l\'examen</small></div>' +
        '<div class="dbar" role="img" aria-label="' + label + ' : ' + p + ' %, seuil ' + PASS_PCT + ' %"><div class="dbar-fill ' + (pass ? 'pass' : 'fail') + '" style="width:' + p + '%"></div><span class="dbar-threshold"></span></div>' +
        '<div class="drow-val">' + p + ' % · ' + ok + '/' + ids.length + '<small>' + (pass ? 'Au-dessus du seuil' : 'Sous le seuil') + '</small></div>' +
      '</div>';
    }).join('');
    $$('#review-filters .qfilter', root).forEach(c => c.classList.toggle('active', c.dataset.filter === reviewFilter));
    renderReview();
    renderHistory($('#exam-history-result', root));
  }

  function renderReview(){
    const html = exam.order.map((id, i) => {
      const item = q(id);
      const sel = selectionOf(id);
      const right = isRight(id);
      const blank = sel.length === 0;
      if(reviewFilter === 'wrong' && right) return '';
      if(reviewFilter === 'marked' && !exam.marked[id]) return '';
      if(reviewFilter === 'blank' && !blank) return '';
      const dm = ctx.domainById[item.domain] || { label: item.domain, color: '#57617a' };
      const status = right ? '<span class="rstatus ok">Juste</span>' : (blank ? '<span class="rstatus none">Sans réponse</span>' : '<span class="rstatus ko">Faux</span>');
      const opts = exam.perms[id].map((orig, pos) => {
        const good = item.answer.indexOf(orig) >= 0;
        const picked = sel.indexOf(orig) >= 0;
        return '<div class="qopt static' + (good ? ' correct' : (picked ? ' incorrect' : '')) + '">' +
          '<span class="ol">' + letter(pos) + '.</span><span class="otext">' + richText(item.options[orig]) + '</span>' +
          (picked ? '<span class="yourpick" lang="fr">Ton choix</span>' : '') + '</div>';
      }).join('');
      return '<article class="qcard">' +
        '<div class="qcard-head"><div class="qcard-tags"><span class="qnum">Question ' + (i + 1) + '</span>' +
          '<span class="qbadge" style="background:' + escapeHtml(dm.color) + '">' + escapeHtml(dm.label) + '</span>' +
          (exam.marked[id] ? '<span class="rstatus none">Marquée</span>' : '') +
          (exam.revealed[id] ? '<span class="rstatus none">Réponse vue</span>' : '') + '</div>' + status + '</div>' +
        '<p class="qprompt" lang="' + lang + '">' + richText(item.question) + '</p>' +
        (item.code ? '<pre class="exam-code">' + escapeHtml(item.code) + '</pre>' : '') +
        '<div class="qoptions' + (item.codeOptions ? ' code-opts' : '') + '" lang="' + lang + '">' + opts + '</div>' +
        '<div class="qexplain"><b>Explication</b><p>' + richText(item.explanation) + '</p></div>' +
      '</article>';
    }).join('');
    $('#exam-review', root).innerHTML = html || '<p class="result-note">Aucune question dans ce filtre.</p>';
  }

  function renderHistory(el){
    if(!el) return;
    if(!history.length){ el.innerHTML = ''; return; }
    const showMode = MODES.length > 1;
    const rows = history.map(h => {
      const d = new Date(h.at);
      const pct = Math.round(h.correct / h.total * 100);
      const pass = h.correct >= Math.ceil(h.total * PASS_RATE);
      const m = MODE_BY_ID[h.mode];
      return '<tr><td>' + d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</td>' +
        (showMode ? '<td>' + escapeHtml(m ? m.label : '—') + '</td>' : '') +
        '<td class="num">' + pct + ' % (' + h.correct + '/' + h.total + ')</td>' +
        '<td class="num">' + formatDuration(h.duration || 0) + '</td>' +
        '<td class="num">' + (typeof h.revealed === 'number' ? h.revealed : 0) + '</td>' +
        '<td class="' + (pass ? 'pass' : 'fail') + '">' + (pass ? 'Réussi' : 'Non réussi') + '</td></tr>';
    }).join('');
    el.innerHTML = '<h2>Tentatives précédentes</h2><div class="table-wrap"><table>' +
      '<thead><tr><th>Date</th>' + (showMode ? '<th>Format</th>' : '') + '<th class="num">Score</th><th class="num">Durée</th><th class="num">Réponses vues</th><th>Résultat</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function showView(){
    elIntro.hidden = exam.status !== 'idle';
    elRun.hidden = exam.status !== 'running';
    elResult.hidden = exam.status !== 'done';
    if(exam.status === 'running'){ elConfirm.hidden = true; renderQuestion(); renderChrome(); tick(); }
    else if(exam.status === 'done') renderResult();
    else renderIntro();
  }

  /* ---------- Événements ---------- */
  elIntro.addEventListener('click', e => {
    const b = e.target.closest('[data-start]');
    if(b) startExam(b.dataset.start);
  });
  elCard.addEventListener('change', e => {
    const input = e.target;
    if(exam.status !== 'running' || !input.matches('input[data-orig]')) return;
    const id = exam.order[exam.current];
    if(exam.revealed[id]) return;
    const item = q(id);
    const orig = parseInt(input.dataset.orig, 10);
    let sel = selectionOf(id).slice();
    if(item.answer.length > 1){
      const at = sel.indexOf(orig);
      if(input.checked && at < 0 && sel.length < item.answer.length) sel.push(orig);
      if(!input.checked && at >= 0) sel.splice(at, 1);
    } else sel = [orig];
    exam.answers[id] = sel;
    save();
    syncOptionStates();
    renderChrome();
  });
  elCard.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if(!btn || exam.status !== 'running') return;
    if(btn.id === 'exam-mark'){
      const id = exam.order[exam.current];
      if(exam.marked[id]) delete exam.marked[id]; else exam.marked[id] = true;
      save();
      const on = !!exam.marked[id];
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Marquée pour révision' : 'Marquer pour révision';
      renderChrome();
    } else if(btn.id === 'exam-reveal') revealCurrent();
    else if(btn.id === 'exam-prev') goTo(exam.current - 1);
    else if(btn.id === 'exam-next'){
      if(exam.current === exam.order.length - 1) openConfirm();
      else goTo(exam.current + 1);
    }
  });
  elPalette.addEventListener('click', e => {
    const b = e.target.closest('.pal');
    if(b) goTo(parseInt(b.dataset.i, 10));
  });
  $('#exam-finish', root).addEventListener('click', openConfirm);
  $('#exam-confirm-cancel', root).addEventListener('click', () => { elConfirm.hidden = true; });
  $('#exam-confirm-ok', root).addEventListener('click', () => finishExam('submit'));
  $('#exam-new', root).addEventListener('click', () => {
    exam = { status: 'idle' };
    save();
    showView();
    window.scrollTo(0, 0);
  });
  $$('#review-filters .qfilter', root).forEach(chip => {
    chip.addEventListener('click', () => {
      reviewFilter = chip.dataset.filter;
      $$('#review-filters .qfilter', root).forEach(c => c.classList.toggle('active', c === chip));
      renderReview();
    });
  });

  setInterval(tick, 1000);
  if(exam.status === 'running' && remaining() <= 0) finishExam('timeout');
  else showView();

  return { modes: MODES };
}
