/* Fiche de révision : HTML fourni par la certification (fiche.html) ou fiche générée
   à partir des domaines et des objectifs officiels déclarés dans cert.json. */

import { $, $$, escapeHtml, richText, plural } from '../lib/util.js';

export function renderFiche(ctx, root, app){
  root.innerHTML = ctx.fiche != null ? ctx.fiche : generateFiche(ctx);
  setupProgress(ctx, root, app);
  setupScrollspy(root);
}

/* ---------- Progression : boutons « Revu » sur chaque point ---------- */
function setupProgress(ctx, root, app){
  const state = ctx.store.get('progress', {});
  const topics = $$('.topic[data-topic]', root);
  const domains = $$('section.domain', root);

  function countFor(el){
    const ts = $$('.topic[data-topic]', el);
    return { done: ts.filter(t => state[t.dataset.topic]).length, total: ts.length };
  }

  function update(){
    const all = countFor(root);
    const label = $('#overall-progress', root);
    if(label) label.textContent = all.done + ' / ' + all.total + ' points revus';
    const bar = $('#overall-bar', root);
    if(bar) bar.style.width = (all.total ? all.done / all.total * 100 : 0) + '%';
    domains.forEach(d => {
      const c = countFor(d);
      const badge = d.querySelector('.domain-count');
      if(badge) badge.textContent = c.done + '/' + c.total;
      const nav = root.querySelector('.sidenav a[href="#' + d.id + '"] .nav-count');
      if(nav) nav.textContent = c.done + '/' + c.total;
    });
    app.updateSummary({ topicsDone: all.done, topicsTotal: all.total });
  }

  topics.forEach(t => {
    const id = t.dataset.topic;
    const btn = t.querySelector('.check');
    if(!btn) return;
    if(state[id]){ btn.setAttribute('aria-checked', 'true'); t.classList.add('done'); }
    btn.addEventListener('click', () => {
      const now = btn.getAttribute('aria-checked') === 'true';
      if(now) delete state[id]; else state[id] = true;
      btn.setAttribute('aria-checked', String(!now));
      t.classList.toggle('done', !now);
      ctx.store.set('progress', state);
      update();
    });
  });
  update();
}

/* ---------- Surbrillance de la section visible dans la navigation latérale ---------- */
export function setupScrollspy(root){
  const sections = $$('section.domain', root);
  const links = $$('.sidenav a', root);
  if(!('IntersectionObserver' in window) || !sections.length || !links.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      links.forEach(l => l.classList.remove('active'));
      const link = root.querySelector('.sidenav a[href="#' + entry.target.id + '"]');
      if(link) link.classList.add('active');
    });
  }, { rootMargin: '-15% 0px -70% 0px' });
  sections.forEach(s => obs.observe(s));
}

/* ---------- Fiche générée ---------- */
function generateFiche(ctx){
  const m = ctx.meta;
  const quiz = ctx.quiz ? ctx.quiz.questions : [];
  const cards = ctx.cards ? ctx.cards.cards : [];
  const totalWeight = ctx.domains.reduce((s, d) => s + (d.weight || 0), 0) || 100;

  const facts = (m.facts || []).map(f => '<span class="chip">' + richText(f) + '</span>').join('');
  const bar = ctx.domains.map(d =>
    '<a href="#dom-' + escapeHtml(d.id) + '" style="width:' + ((d.weight || 0) / totalWeight * 100) + '%;background:' + escapeHtml(d.color) + ';">' + (d.weight || 0) + '%</a>').join('');
  const legend = ctx.domains.map(d =>
    '<span><i class="dot" style="background:' + escapeHtml(d.color) + ';"></i>' + escapeHtml(d.label) + ' ' + (d.weight || 0) + '%</span>').join('');
  const nav = ctx.domains.map(d =>
    '<a href="#dom-' + escapeHtml(d.id) + '">' + escapeHtml(d.short || d.label) + ' <span class="nav-count">0/0</span></a>').join('');

  const sections = ctx.domains.map(d => {
    const objectives = d.objectives || [];
    const qn = quiz.filter(q => q.domain === d.id).length;
    const cn = cards.filter(c => c.domain === d.id).length;
    const items = objectives.map((o, i) => {
      const oq = quiz.filter(q => q.domain === d.id && q.objective === i).length;
      return '<article class="topic" data-topic="obj-' + escapeHtml(d.id) + '-' + i + '">' +
        '<div class="topic-head"><h3>' + richText(o) + '</h3><button class="check" role="checkbox" aria-checked="false">Revu</button></div>' +
        (oq ? '<p class="topic-meta">' + plural(oq, 'question', 'questions') + ' sur cet objectif</p>' : '') +
      '</article>';
    }).join('');
    const actions = [
      qn ? '<button type="button" class="btn-ghost" data-goto="quiz" data-domain="' + escapeHtml(d.id) + '">S\'entraîner : ' + plural(qn, 'question', 'questions') + '</button>' : '',
      cn ? '<button type="button" class="btn-ghost" data-goto="cards" data-domain="' + escapeHtml(d.id) + '">Fiches mémo : ' + cn + '</button>' : ''
    ].join('');
    return '<section class="domain" id="dom-' + escapeHtml(d.id) + '">' +
      '<div class="domain-head"><div>' +
        '<span class="weight">' + escapeHtml(d.name || d.label) + ' · ' + (d.weight || 0) + ' %</span>' +
        '<h2>' + escapeHtml(d.label) + '</h2>' +
        (d.description ? '<p>' + richText(d.description) + '</p>' : '') +
      '</div><span class="domain-count">0/0</span></div>' +
      (objectives.length ? items : '<p class="topic-meta">Aucun objectif détaillé pour ce domaine.</p>') +
      (actions ? '<div class="domain-actions">' + actions + '</div>' : '') +
    '</section>';
  }).join('');

  const notes = (m.notes || []).map(n => '<li>' + richText(n) + '</li>').join('');
  const sources = (m.sources || []).map(s =>
    '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.label) + '</a></li>').join('');

  return '<header class="hero">' +
      '<div class="eyebrow">' + escapeHtml([m.vendor, m.track].filter(Boolean).join(' · ')) + '</div>' +
      '<h1>' + escapeHtml(m.title) + '</h1>' +
      (m.code ? '<p class="hero-code">' + escapeHtml(m.code) + '</p>' : '') +
      (m.summary ? '<p class="sub">' + richText(m.summary) + '</p>' : '') +
      (facts ? '<div class="facts">' + facts + '</div>' : '') +
      (m.verified ? '<p class="verified">' + richText(m.verified) + '</p>' : '') +
      '<div class="progress-wrap"><div class="progress-track"><div class="progress-fill" id="overall-bar"></div></div><span id="overall-progress">0 / 0 points revus</span></div>' +
      (ctx.domains.length ? '<div class="blueprint"><div class="blueprint-bar">' + bar + '</div><div class="blueprint-legend">' + legend + '</div></div>' : '') +
    '</header>' +
    '<div class="layout">' +
      '<nav class="sidenav" aria-label="Domaines">' + nav + '</nav>' +
      '<main class="content">' + sections + '</main>' +
    '</div>' +
    ((notes || sources) ? '<footer class="page-footer">' +
      (notes ? '<div><strong>À savoir</strong><ul>' + notes + '</ul></div>' : '') +
      (sources ? '<div><strong>Sources officielles</strong><ul class="src-list">' + sources + '</ul></div>' : '') +
    '</footer>' : '');
}
