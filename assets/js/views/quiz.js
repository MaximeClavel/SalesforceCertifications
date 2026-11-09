/* Quiz d'entraînement : réponse immédiate, réponses multiples validées sans point partiel. */

import { $, $$, escapeHtml, richText, letter, seededOrder, sameSet, focusNoScroll, hintText, answersLabel } from '../lib/util.js';

export function createQuiz(ctx, root, app){
  const QUESTIONS = ctx.quiz.questions;
  const BY_ID = {};
  QUESTIONS.forEach(q => { BY_ID[q.id] = q; });
  const lang = ctx.qLang;
  const KEY = 'quiz-v' + (ctx.quiz.version || 1);
  const style = (ctx.meta.quiz && ctx.meta.quiz.style) || '';

  let state = ctx.store.get(KEY, {});
  if(!state || typeof state !== 'object') state = {};
  Object.keys(state).forEach(id => {
    const s = state[id];
    if(!BY_ID[id] || !s || !Array.isArray(s.selected)) delete state[id];
  });
  let pending = {};
  let filter = 'all';
  let onlyWrong = false;

  root.innerHTML = subheadHtml() +
    '<div class="quiz-toolbar">' +
      '<div class="qfilters" id="quiz-filters">' +
        '<button type="button" class="qfilter active" data-domain="all">Tous</button>' +
        ctx.domains.filter(d => QUESTIONS.some(q => q.domain === d.id))
          .map(d => '<button type="button" class="qfilter" data-domain="' + escapeHtml(d.id) + '">' + escapeHtml(d.short || d.label) + '</button>').join('') +
        '<span class="qfilter-sep" aria-hidden="true"></span>' +
        '<button type="button" class="qfilter" id="quiz-wrong" aria-pressed="false">Mes erreurs</button>' +
      '</div>' +
      '<div class="quiz-score-wrap">' +
        '<div class="quiz-score-bar-track"><div class="quiz-score-bar-fill" id="quiz-score-bar"></div></div>' +
        '<span id="quiz-score"></span>' +
        '<button type="button" class="reset-btn" id="quiz-reset">Réinitialiser</button>' +
      '</div>' +
    '</div>' +
    '<div class="qlist" id="quiz-list"></div>';

  const list = $('#quiz-list', root);
  const scoreEl = $('#quiz-score', root);
  const barEl = $('#quiz-score-bar', root);
  const wrongBtn = $('#quiz-wrong', root);

  function subheadHtml(){
    const counts = ctx.domains.map(d => ({ d, n: QUESTIONS.filter(q => q.domain === d.id).length })).filter(x => x.n);
    const multi = QUESTIONS.filter(q => q.answer.length > 1).length;
    const parts = [];
    if(style === 'certification') parts.push('Questions au format de la certification : un scénario, une contrainte, puis une consigne qui annonce le nombre de réponses.');
    if(lang === 'en') parts.push('Questions et réponses en anglais, explications en français.');
    if(counts.length) parts.push('Répartition : ' + counts.map(x => x.n + ' en ' + escapeHtml(x.d.label)).join(', ') + '.');
    if(multi) parts.push(multi + ' questions demandent plusieurs réponses.');
    const anatomy = style === 'certification' ?
      '<div class="qanatomy">' +
        '<p><b>Comment lire les réponses.</b> Comme à l\'examen, chaque mauvaise réponse suit un piège type, nommé dans l\'explication :</p>' +
        '<ul>' +
          '<li><b>Piège plausible</b> : une vraie fonctionnalité qui viole la contrainte de l\'énoncé ou une limite.</li>' +
          '<li><b>Inversion</b> : une option qui fait l\'inverse de ce qui est demandé.</li>' +
          '<li><b>Faux terme</b> : une fonctionnalité inventée ou retirée.</li>' +
        '</ul>' +
        '<p style="margin:.5rem 0 0">Question à réponses multiples : coche le nombre demandé puis « Valider ». Elle ne compte que si toutes les bonnes réponses sont choisies, sans point partiel.</p>' +
      '</div>' : '';
    return '<div class="subhead">' +
      '<div class="eyebrow">Entraînement</div>' +
      '<h1>' + QUESTIONS.length + ' questions d\'entraînement</h1>' +
      '<p class="sub">' + parts.join(' ') + ' Choisis une réponse pour voir l\'explication.</p>' +
      anatomy +
    '</div>';
  }

  function visible(){
    return QUESTIONS.filter(q => {
      if(filter !== 'all' && q.domain !== filter) return false;
      if(onlyWrong){ const s = state[q.id]; return s && !s.correct; }
      return true;
    });
  }

  function cardHtml(q, n, total){
    const meta = ctx.domainById[q.domain] || { label: q.domain, color: '#57617a' };
    const answered = state[q.id];
    const need = q.answer.length;
    const multi = need > 1;
    const pend = pending[q.id] || [];
    const opts = seededOrder(q.id, q.options.length).map((i, pos) => {
      const picked = answered ? answered.selected.indexOf(i) >= 0 : pend.indexOf(i) >= 0;
      const full = multi && !answered && !picked && pend.length >= need;
      let cls = 'qopt' + (multi ? ' qopt-m' : '');
      if(answered){
        if(q.answer.indexOf(i) >= 0) cls += ' correct';
        else if(picked) cls += ' incorrect';
        if(picked) cls += ' was-picked';
      } else if(picked) cls += ' picked';
      else if(full) cls += ' qopt-full';
      return '<button type="button" class="' + cls + '" data-id="' + escapeHtml(q.id) + '" data-idx="' + i + '"' +
        (multi && !answered ? ' aria-pressed="' + picked + '"' : '') + (answered || full ? ' disabled' : '') + '>' +
        (multi ? '<span class="qcheck" aria-hidden="true"></span>' : '') +
        '<span class="ol">' + letter(pos) + '.</span> <span class="otext">' + richText(q.options[i]) + '</span>' +
        (answered && picked && multi ? '<span class="yourpick" lang="fr">Ton choix</span>' : '') + '</button>';
    }).join('');
    let footer = '';
    if(answered){
      footer = '<div class="exam-answer" tabindex="-1">' +
        (answered.correct ? '<span class="rstatus ok">Juste</span>' : '<span class="rstatus ko">Faux</span>') +
        '<div class="qexplain"><b>Explication</b><p>' + richText(q.explanation) + '</p></div></div>';
    } else if(multi){
      footer = '<div class="qvalidate"><button type="button" class="btn-primary" data-validate="' + escapeHtml(q.id) + '"' +
        (pend.length === need ? '' : ' disabled') + '>Valider</button>' +
        '<span class="qvalidate-note">' + pend.length + ' / ' + need + ' réponses choisies</span></div>';
    }
    return '<article class="qcard" id="q-' + escapeHtml(q.id) + '">' +
      '<div class="qcard-head"><span class="qbadge" style="background:' + escapeHtml(meta.color) + '">' + escapeHtml(meta.label) + '</span>' +
        '<span class="qnum">Question ' + (n + 1) + ' / ' + total + '</span></div>' +
      '<p class="qprompt" lang="' + lang + '">' + richText(q.question) + '</p>' +
      (q.code ? '<pre class="exam-code">' + escapeHtml(q.code) + '</pre>' : '') +
      '<p class="qhint" lang="' + lang + '">' + hintText(lang, need) + '</p>' +
      '<div class="qoptions' + (q.codeOptions ? ' code-opts' : '') + '" role="group" aria-label="' + answersLabel(lang) + '" lang="' + lang + '">' + opts + '</div>' +
      footer +
    '</article>';
  }

  function render(){
    const items = visible();
    list.innerHTML = items.length ? items.map((q, n) => cardHtml(q, n, items.length)).join('') :
      '<p class="quiz-empty">' + (onlyWrong ? 'Aucune erreur à revoir dans ce filtre. Bravo.' : 'Aucune question dans ce filtre.') + '</p>';
    updateScore();
  }

  function rerenderCard(id, done, focusIdx){
    const items = visible();
    const n = items.findIndex(q => q.id === id);
    const old = document.getElementById('q-' + id);
    if(n < 0 || !old){ render(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHtml(items[n], n, items.length);
    const card = tmp.firstElementChild;
    old.parentNode.replaceChild(card, old);
    updateScore();
    const target = done ? card.querySelector('.exam-answer') :
      (card.querySelector('.qopt[data-idx="' + focusIdx + '"]:not(:disabled)') || card.querySelector('[data-validate]:not(:disabled)'));
    focusNoScroll(target);
  }

  function updateScore(){
    const ids = QUESTIONS.map(q => q.id).filter(id => state[id]);
    const good = ids.filter(id => state[id].correct).length;
    scoreEl.textContent = good + ' / ' + QUESTIONS.length + ' bonnes réponses (' + ids.length + ' répondues)';
    barEl.style.width = (QUESTIONS.length ? good / QUESTIONS.length * 100 : 0) + '%';
    app.updateSummary({ quizCorrect: good, quizAnswered: ids.length, quizTotal: QUESTIONS.length });
  }

  function save(){ ctx.store.set(KEY, state); }

  list.addEventListener('click', e => {
    const vbtn = e.target.closest('[data-validate]');
    if(vbtn){
      const id = vbtn.dataset.validate;
      const q = BY_ID[id];
      const chosen = pending[id] || [];
      if(!q || state[id] || chosen.length !== q.answer.length) return;
      state[id] = { selected: chosen.slice(), correct: sameSet(chosen, q.answer) };
      delete pending[id];
      save();
      rerenderCard(id, true);
      return;
    }
    const btn = e.target.closest('.qopt');
    if(!btn || btn.disabled) return;
    const id = btn.dataset.id;
    const q = BY_ID[id];
    if(!q || state[id]) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if(q.answer.length > 1){
      const p = (pending[id] || []).slice();
      const at = p.indexOf(idx);
      if(at >= 0) p.splice(at, 1);
      else if(p.length < q.answer.length) p.push(idx);
      pending[id] = p;
      rerenderCard(id, false, idx);
      return;
    }
    state[id] = { selected: [idx], correct: idx === q.answer[0] };
    save();
    rerenderCard(id, true);
  });

  function syncChips(){
    $$('#quiz-filters .qfilter[data-domain]', root).forEach(c => c.classList.toggle('active', c.dataset.domain === filter));
    wrongBtn.setAttribute('aria-pressed', String(onlyWrong));
  }

  $$('#quiz-filters .qfilter[data-domain]', root).forEach(chip => {
    chip.addEventListener('click', () => { filter = chip.dataset.domain; syncChips(); render(); });
  });
  wrongBtn.addEventListener('click', () => { onlyWrong = !onlyWrong; syncChips(); render(); });
  $('#quiz-reset', root).addEventListener('click', () => {
    state = {};
    pending = {};
    save();
    render();
  });

  render();

  return {
    setFilter(domain){
      filter = domain && QUESTIONS.some(q => q.domain === domain) ? domain : 'all';
      onlyWrong = false;
      syncChips();
      render();
    },
    /* Pour la recherche : affiche toutes les questions et renvoie la carte demandée. */
    focusQuestion(id){
      if(filter !== 'all' || onlyWrong){ filter = 'all'; onlyWrong = false; syncChips(); render(); }
      return document.getElementById('q-' + id);
    }
  };
}
