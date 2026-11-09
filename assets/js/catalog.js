/* Catalogue : liste des certifications déclarées dans certifications/catalog.json,
   regroupées par éditeur, avec la progression enregistrée dans ce navigateur. */

import { $, escapeHtml } from './lib/util.js';
import { loadCatalog, loadMeta } from './lib/data.js';
import { readSummary } from './lib/store.js';

document.documentElement.lang = 'fr';
const listEl = $('#catalog-list');
const filterEl = $('#catalog-filter');
let certs = [];

init().catch(err => {
  console.error(err);
  listEl.innerHTML = '<p class="catalog-empty">Impossible de charger la liste des certifications : ' + escapeHtml(err.message || String(err)) + '</p>';
});

async function init(){
  const catalog = await loadCatalog();
  const ids = catalog.certifications || [];
  const results = await Promise.allSettled(ids.map(id => loadMeta(id).then(meta => ({ id, meta }))));
  certs = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  results.forEach((r, i) => { if(r.status === 'rejected') console.warn('Certification ignorée : ' + ids[i], r.reason); });
  render();
  filterEl.addEventListener('input', render);
}

function fold(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function render(){
  const q = fold(filterEl.value.trim());
  const shown = certs.filter(c => !q || fold([c.meta.title, c.meta.shortTitle, c.meta.code, c.meta.vendor, c.meta.track, c.meta.summary].join(' ')).indexOf(q) !== -1);
  if(!shown.length){
    listEl.innerHTML = '<p class="catalog-empty">' + (certs.length ? 'Aucune certification ne correspond à « ' + escapeHtml(filterEl.value) + ' ».' : 'Aucune certification déclarée.') + '</p>';
    return;
  }
  const vendors = [];
  shown.forEach(c => { const v = c.meta.vendor || 'Autres'; if(vendors.indexOf(v) === -1) vendors.push(v); });
  listEl.innerHTML = vendors.map(v =>
    '<section class="catalog-group"><h2>' + escapeHtml(v) + '</h2><div class="cert-grid">' +
      shown.filter(c => (c.meta.vendor || 'Autres') === v).map(cardHtml).join('') +
    '</div></section>').join('');
}

function cardHtml(c){
  const m = c.meta;
  const e = m.exam || {};
  const content = m.content || {};
  const stats = m.stats || {};
  const facts = [
    e.scoredQuestions ? e.scoredQuestions + ' questions' : '',
    e.durationMinutes ? e.durationMinutes + ' min' : '',
    e.passingLabel || (typeof e.passRate === 'number' ? 'seuil ' + Math.round(e.passRate * 100) + ' %' : '')
  ].filter(Boolean);
  const parts = [
    content.fiche || (m.domains || []).some(d => d.objectives && d.objectives.length) ? 'Fiche' : '',
    (content.pages || []).map(p => p.label).join(' · '),
    stats.quiz ? stats.quiz + ' questions de quiz' : '',
    stats.exam ? stats.exam + ' questions d\'examen' : (m.mockExams && m.mockExams.length ? 'Examen blanc' : ''),
    stats.flashcards ? stats.flashcards + ' fiches mémo' : ''
  ].filter(Boolean);
  const domains = (m.domains || []).map(d => '<i style="flex:' + (d.weight || 1) + ';background:' + escapeHtml(d.color) + '" title="' + escapeHtml(d.label + ' · ' + d.weight + ' %') + '"></i>').join('');
  const s = readSummary(c.id);
  let progress = '<span>Pas encore commencée.</span>';
  if(s){
    const lines = [];
    if(s.topicsTotal) lines.push('<span><b>' + s.topicsDone + ' / ' + s.topicsTotal + '</b> points revus</span>');
    if(s.quizTotal) lines.push('<span>Quiz : <b>' + s.quizCorrect + ' / ' + s.quizTotal + '</b> bonnes réponses</span>');
    if(s.cardsTotal) lines.push('<span>Fiches mémo : <b>' + s.cardsKnown + ' / ' + s.cardsTotal + '</b> sues</span>');
    if(s.lastExam && s.lastExam.total) lines.push('<span>Dernier examen blanc : <b>' + Math.round(s.lastExam.correct / s.lastExam.total * 100) + ' %</b> (' + (s.lastExam.passed ? 'réussi' : 'non réussi') + ')</span>');
    if(lines.length){
      const pct = s.topicsTotal ? Math.round(s.topicsDone / s.topicsTotal * 100) : 0;
      progress = (s.topicsTotal ? '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' : '') + lines.join('');
    }
  }
  return '<a class="cert-card" href="cert.html?c=' + encodeURIComponent(c.id) + '">' +
    '<span class="eyebrow">' + escapeHtml([m.vendor, m.track].filter(Boolean).join(' · ')) + '</span>' +
    '<h3>' + escapeHtml(m.title) + '</h3>' +
    (m.code ? '<span class="cert-code">' + escapeHtml(m.code) + '</span>' : '') +
    (m.summary ? '<p>' + escapeHtml(m.summary) + '</p>' : '') +
    (domains ? '<span class="cert-domains" aria-hidden="true">' + domains + '</span>' : '') +
    (facts.length ? '<span class="cert-facts">' + facts.map(f => '<span class="chip">' + escapeHtml(f) + '</span>').join('') + '</span>' : '') +
    (parts.length ? '<span class="cert-content">' + parts.map(p => '<span>' + escapeHtml(p) + '</span>').join('') + '</span>' : '') +
    '<span class="cert-progress">' + progress + '</span>' +
  '</a>';
}
