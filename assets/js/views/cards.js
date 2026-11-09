/* Fiches mémo : une question au recto, la réponse au verso. Chaque carte peut être
   marquée « Je sais » ou « À revoir » ; le filtre « À revoir » ne garde que les secondes. */

import { $, $$, escapeHtml, richText, shuffle, focusNoScroll } from '../lib/util.js';

export function createCards(ctx, root, app){
  const CARDS = ctx.cards.cards;
  const BY_ID = {};
  CARDS.forEach(c => { BY_ID[c.id] = c; });
  const KEY = 'cards';

  let marks = ctx.store.get(KEY, {});
  if(!marks || typeof marks !== 'object') marks = {};
  Object.keys(marks).forEach(id => { if(!BY_ID[id] || (marks[id] !== 'known' && marks[id] !== 'review')) delete marks[id]; });
  let order = CARDS.map(c => c.id);
  let domain = 'all';
  let reviewOnly = false;
  let index = 0;
  let flipped = false;

  const domainsWithCards = ctx.domains.filter(d => CARDS.some(c => c.domain === d.id));
  root.innerHTML =
    '<div class="subhead"><div class="eyebrow">Fiches mémo</div>' +
      '<h1>' + CARDS.length + ' fiches à retourner</h1>' +
      '<p class="sub">Lis la question, formule ta réponse, puis retourne la carte. Marque-la «&nbsp;Je sais&nbsp;» ou «&nbsp;À revoir&nbsp;» : le filtre «&nbsp;À revoir&nbsp;» ne garde ensuite que les cartes à retravailler. Raccourcis : Espace pour retourner, flèches pour naviguer.</p></div>' +
    '<div class="cards-toolbar">' +
      '<div class="qfilters" id="cards-filters">' +
        '<button type="button" class="qfilter active" data-domain="all">Toutes</button>' +
        domainsWithCards.map(d => '<button type="button" class="qfilter" data-domain="' + escapeHtml(d.id) + '">' + escapeHtml(d.short || d.label) + '</button>').join('') +
        '<span class="qfilter-sep" aria-hidden="true"></span>' +
        '<button type="button" class="qfilter" id="cards-review" aria-pressed="false">À revoir</button>' +
      '</div>' +
      '<div class="quiz-score-wrap">' +
        '<span class="cards-stats" id="cards-stats"></span>' +
        '<button type="button" class="reset-btn" id="cards-shuffle">Mélanger</button>' +
        '<button type="button" class="reset-btn" id="cards-reset">Réinitialiser</button>' +
      '</div>' +
    '</div>' +
    '<div id="cards-stage"></div>';

  const stage = $('#cards-stage', root);
  const reviewBtn = $('#cards-review', root);

  function deck(){
    return order.map(id => BY_ID[id]).filter(c => (domain === 'all' || c.domain === domain) && (!reviewOnly || marks[c.id] === 'review'));
  }

  function updateStats(){
    const known = CARDS.filter(c => marks[c.id] === 'known').length;
    const review = CARDS.filter(c => marks[c.id] === 'review').length;
    $('#cards-stats', root).innerHTML = '<span><b>' + known + '</b> sues</span><span><b>' + review + '</b> à revoir</span><span><b>' + (CARDS.length - known - review) + '</b> nouvelles</span>';
    app.updateSummary({ cardsKnown: known, cardsTotal: CARDS.length });
  }

  function render(focusCard){
    const d = deck();
    updateStats();
    if(!d.length){
      stage.innerHTML = '<p class="quiz-empty">' + (reviewOnly ? 'Aucune carte à revoir dans ce filtre.' : 'Aucune carte dans ce filtre.') + '</p>';
      return;
    }
    if(index >= d.length) index = d.length - 1;
    if(index < 0) index = 0;
    const c = d[index];
    const dm = ctx.domainById[c.domain] || { label: c.domain, color: '#57617a' };
    const status = marks[c.id] === 'known' ? '<span class="flash-status known">Je sais</span>' :
      marks[c.id] === 'review' ? '<span class="flash-status review">À revoir</span>' : '<span class="flash-status new">Nouvelle</span>';
    stage.innerHTML =
      '<button type="button" class="flash' + (flipped ? ' flipped' : '') + '" id="flash-card" aria-pressed="' + flipped + '" aria-label="' + (flipped ? 'Réponse affichée, cliquer pour revoir la question' : 'Retourner la carte') + '">' +
        '<span class="flash-face">' +
          '<span class="flash-top"><span class="qbadge" style="background:' + escapeHtml(dm.color) + '">' + escapeHtml(dm.label) + '</span>' + status + '</span>' +
          '<span class="flash-term">' + richText(c.front) + '</span>' +
          (flipped ? '<span class="flash-def">' + richText(c.back) + '</span>' : '') +
          '<span class="flash-hint">' + (flipped ? 'Clique pour revoir la question.' : 'Clique ou appuie sur Espace pour voir la réponse.') + '</span>' +
        '</span>' +
      '</button>' +
      '<div class="cards-controls">' +
        '<div class="group"><button type="button" class="btn-ghost" data-act="prev"' + (index === 0 ? ' disabled' : '') + '>← Précédente</button>' +
        '<span class="cards-pos" aria-live="polite">' + (index + 1) + ' / ' + d.length + '</span></div>' +
        '<div class="group">' +
          '<button type="button" class="btn-ghost btn-review" data-act="review">À revoir</button>' +
          '<button type="button" class="btn-ghost btn-known" data-act="known">Je sais</button>' +
          '<button type="button" class="btn-ghost" data-act="next"' + (index === d.length - 1 ? ' disabled' : '') + '>Suivante →</button>' +
        '</div>' +
      '</div>';
    if(focusCard) focusNoScroll($('#flash-card', root));
  }

  function move(delta){
    const d = deck();
    const n = index + delta;
    if(n < 0 || n >= d.length) return;
    index = n;
    flipped = false;
    render(true);
  }

  function mark(value){
    const d = deck();
    const c = d[index];
    if(!c) return;
    marks[c.id] = value;
    ctx.store.set(KEY, marks);
    flipped = false;
    const after = deck();
    /* Avec le filtre « À revoir », une carte marquée « Je sais » sort du paquet : on reste à la même position. */
    if(after.length && after[index] && after[index].id === c.id && index < after.length - 1) index++;
    render(true);
  }

  stage.addEventListener('click', e => {
    if(e.target.closest('#flash-card')){ flipped = !flipped; render(true); return; }
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const act = b.dataset.act;
    if(act === 'prev') move(-1);
    else if(act === 'next') move(1);
    else if(act === 'known' || act === 'review') mark(act);
  });

  document.addEventListener('keydown', e => {
    if(root.hidden || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if(e.key === 'ArrowRight'){ e.preventDefault(); move(1); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); move(-1); }
    else if(e.key === ' ' && (t === document.body || t === document.documentElement)){ e.preventDefault(); flipped = !flipped; render(true); }
  });

  function syncChips(){
    $$('#cards-filters .qfilter[data-domain]', root).forEach(c => c.classList.toggle('active', c.dataset.domain === domain));
    reviewBtn.setAttribute('aria-pressed', String(reviewOnly));
  }
  $$('#cards-filters .qfilter[data-domain]', root).forEach(chip => {
    chip.addEventListener('click', () => { domain = chip.dataset.domain; index = 0; flipped = false; syncChips(); render(); });
  });
  reviewBtn.addEventListener('click', () => { reviewOnly = !reviewOnly; index = 0; flipped = false; syncChips(); render(); });
  $('#cards-shuffle', root).addEventListener('click', () => { order = shuffle(order); index = 0; flipped = false; render(); });
  $('#cards-reset', root).addEventListener('click', () => { marks = {}; ctx.store.set(KEY, marks); index = 0; flipped = false; render(); });

  render();

  return {
    setDomain(d){
      domain = d && domainsWithCards.some(x => x.id === d) ? d : 'all';
      reviewOnly = false; index = 0; flipped = false;
      syncChips();
      render();
    },
    /* Pour la recherche : affiche la carte demandée, recto visible. */
    showCard(id){
      domain = 'all'; reviewOnly = false; flipped = false;
      syncChips();
      index = Math.max(0, deck().findIndex(c => c.id === id));
      render();
      return $('#flash-card', root);
    }
  };
}
