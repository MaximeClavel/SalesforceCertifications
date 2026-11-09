/* Point d'entrée d'une page de révision : cert.html?c=<identifiant>[&tab=<onglet>]. */

import { $, $$, escapeHtml } from './lib/util.js';
import { createStore } from './lib/store.js';
import { loadCert, isValidId } from './lib/data.js';
import { renderFiche, setupScrollspy } from './views/fiche.js';
import { createQuiz } from './views/quiz.js';
import { createExam } from './views/exam.js';
import { createCards } from './views/cards.js';
import { createSearch } from './views/search.js';

document.documentElement.lang = 'fr';

const params = new URLSearchParams(location.search);
const certId = params.get('c') || '';
const viewsEl = $('#views');
const tabsEl = $('#toptabs');

init().catch(err => {
  console.error(err);
  viewsEl.innerHTML = '<div class="app-status"><h1>Révision introuvable</h1><p>' + escapeHtml(err.message || String(err)) +
    '</p><p><a href="./">Revenir à la liste des certifications</a></p></div>';
  document.title = 'Révision introuvable';
});

async function init(){
  if(!isValidId(certId)) throw new Error('Aucune certification sélectionnée.');
  const ctx = await loadCert(certId);
  ctx.store = createStore(certId);
  const meta = ctx.meta;
  document.title = (meta.shortTitle || meta.title) + ' · Révision';
  (meta.styles || []).forEach(href => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ctx.base + href;
    document.head.appendChild(link);
  });

  /* Onglets disponibles selon le contenu fourni */
  const labels = meta.labels || {};
  const tabs = [{ id: 'fiche', label: labels.fiche || 'Fiche' }];
  ctx.pages.forEach(p => tabs.push({ id: p.id, label: p.label, page: p }));
  if(ctx.quiz) tabs.push({ id: 'quiz', label: labels.quiz || 'Quiz' });
  if(ctx.exam || (meta.mockExams && meta.mockExams.length)) tabs.push({ id: 'exam', label: labels.exam || 'Examen blanc' });
  if(ctx.cards) tabs.push({ id: 'cards', label: labels.cards || 'Fiches mémo' });

  viewsEl.innerHTML = tabs.map(t => '<div id="page-' + escapeHtml(t.id) + '" class="page-view" hidden></div>').join('');
  tabsEl.innerHTML = tabs.map(t => '<button type="button" class="toptab" role="tab" data-target="' + escapeHtml(t.id) + '">' + escapeHtml(t.label) + '</button>').join('');
  tabs.forEach(t => { t.root = document.getElementById('page-' + t.id); });
  const tabById = {};
  tabs.forEach(t => { tabById[t.id] = t; });

  const app = {
    tabs,
    showTab,
    updateSummary(partial){
      const s = Object.assign(ctx.store.get('summary', {}), partial, { updatedAt: Date.now() });
      ctx.store.set('summary', s);
    }
  };

  renderFiche(ctx, tabById.fiche.root, app);
  ctx.pages.forEach(p => {
    const root = tabById[p.id].root;
    root.innerHTML = p.html;
    setupScrollspy(root);
  });
  if(ctx.quiz) app.quiz = createQuiz(ctx, tabById.quiz.root, app);
  if(tabById.exam) app.exam = createExam(ctx, tabById.exam.root, app);
  if(ctx.cards) app.cards = createCards(ctx, tabById.cards.root, app);
  const search = createSearch(ctx, app);

  function showTab(id, opts){
    if(!tabById[id]) id = 'fiche';
    tabs.forEach(t => { t.root.hidden = t.id !== id; });
    $$('.toptab', tabsEl).forEach(b => {
      const on = b.dataset.target === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    ctx.store.set('tab', id);
    const url = new URL(location.href);
    url.searchParams.set('tab', id);
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
    if(!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    search.syncStickyOffsets();
  }

  tabsEl.addEventListener('click', e => {
    const b = e.target.closest('.toptab');
    if(b) showTab(b.dataset.target);
  });

  /* Liens internes (#ancre) : ouvrent l'onglet qui contient la cible avant d'y défiler. */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if(!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const target = id && document.getElementById(id);
    if(!target) return;
    e.preventDefault();
    const page = target.closest('.page-view');
    if(page && page.hidden) showTab(page.id.replace(/^page-/, ''), { keepScroll: true });
    const det = target.closest('details');
    if(det) det.open = true;
    target.scrollIntoView({ block: 'start' });
  });

  /* Boutons « S'entraîner » et « Fiches mémo » des domaines */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if(!b) return;
    const to = b.dataset.goto;
    if(!tabById[to]) return;
    if(to === 'quiz' && app.quiz) app.quiz.setFilter(b.dataset.domain);
    if(to === 'cards' && app.cards) app.cards.setDomain(b.dataset.domain);
    showTab(to);
  });

  const wanted = params.get('tab') || ctx.store.get('tab', 'fiche');
  showTab(tabById[wanted] ? wanted : 'fiche');
  if(location.hash.length > 1){
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if(target){
      const page = target.closest('.page-view');
      if(page) showTab(page.id.replace(/^page-/, ''), { keepScroll: true });
      target.scrollIntoView({ block: 'start' });
    }
  }
}
