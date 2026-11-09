/* Recherche par mot-clé dans la fiche, les pages de contenu, les questions du quiz
   (énoncé et propositions, jamais l'explication) et le recto des fiches mémo.
   Insensible aux accents et à la casse, correspondance en début de mot ou de segment camelCase. */

import { $, escapeHtml } from '../lib/util.js';

export function createSearch(ctx, app){
  const topbar = $('#topbar');
  const searchBox = $('#search');
  const searchInput = $('#site-search');
  const searchClearBtn = $('#search-clear');
  const searchToggle = $('#search-toggle');
  const searchPanel = $('#search-panel');
  const searchLive = $('#search-live');
  const mqNarrow = window.matchMedia('(max-width: 880px)');
  const mqMobile = window.matchMedia('(max-width: 760px)');
  const mqTouch = window.matchMedia('(hover: none)');
  const EXAMPLES = (ctx.meta.searchExamples || []).slice(0, 6);
  const STOPWORDS = Object.create(null);
  ['le','la','les','de','des','du','un','une','et','ou','en','au','aux','pour','par','sur','dans','avec','que','qui','est','the','of','to','and','a','an','in','on','for','is']
    .forEach(w => { STOPWORDS[w] = true; });
  const ALNUM = /[0-9a-zÀ-ɏ]/i;
  const BLOCK_TAGS = /^(P|LI|TD|TH|TR|DIV|PRE|H1|H2|H3|H4|UL|OL|DL|DT|DD|SUMMARY|TABLE|THEAD|TBODY|BR|ARTICLE|SECTION|DETAILS|HEADER|FIGCAPTION)$/;
  const foldCache = Object.create(null);
  let searchIndex = null, searchResults = [], activeResult = -1, panelOpen = false;
  let lastTerms = [], lastWordMode = true, flashTimer = null, liveTimer = null;

  const groups = app.tabs.filter(t => t.id !== 'exam');
  const groupOrder = {};
  groups.forEach((g, i) => { groupOrder[g.id] = i; });

  function cleanText(s){ return String(s).replace(/\s+/g, ' ').trim(); }

  // Minuscules, sans accents ; map relie chaque caractère normalisé à sa position d'origine.
  function foldChar(c){
    let f = foldCache[c];
    if(f === undefined){
      f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if(f === '’' || f === '‘' || f === 'ʼ') f = "'";
      else if(f === 'œ') f = 'oe';
      else if(f === 'æ') f = 'ae';
      else if(f === 'ß') f = 'ss';
      foldCache[c] = f;
    }
    return f;
  }
  function fold(str){
    let norm = '';
    const map = [];
    for(let i = 0; i < str.length; i++){
      const f = foldChar(str.charAt(i));
      for(let k = 0; k < f.length; k++){ norm += f.charAt(k); map.push(i); }
    }
    return { norm, map };
  }

  function readText(el, skip){
    const out = [];
    (function walk(node){
      for(let c = node.firstChild; c; c = c.nextSibling){
        if(c.nodeType === 3) out.push(c.nodeValue);
        else if(c.nodeType === 1 && !(skip && c.matches(skip)) && c.tagName !== 'svg' && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE'){
          walk(c);
          if(BLOCK_TAGS.test(c.tagName)) out.push(' ');
        }
      }
    })(el);
    return cleanText(out.join(''));
  }

  function makeEntry(o){
    const t = fold(o.title), b = fold(o.body || '');
    o.tNorm = t.norm; o.tMap = t.map; o.bNorm = b.norm; o.bMap = b.map;
    o.hl = o.hl || o.el;
    return o;
  }

  function domainColor(id){
    const d = ctx.domainById[String(id || '').replace(/^(d-|dom-)/, '')];
    return d ? d.color : null;
  }

  function buildIndex(){
    const list = [];
    app.tabs.forEach(tab => {
      if(tab.id === 'quiz' || tab.id === 'exam' || tab.id === 'cards') return;
      const root = tab.root;
      const hero = root.querySelector('.hero');
      const facts = hero && hero.querySelector('.facts');
      if(facts) list.push(makeEntry({ page: tab.id, el: hero, hl: facts, title: 'Format de l\'examen', section: 'En-tête', color: null, body: readText(facts) }));
      root.querySelectorAll('section.domain').forEach(sec => {
        const color = domainColor(sec.id);
        const head = sec.querySelector('.domain-head');
        const h2 = head && head.querySelector('h2');
        const name = h2 ? cleanText(h2.textContent) : '';
        if(head) list.push(makeEntry({ page: tab.id, el: sec, hl: head, title: name, section: tab.label, color, body: readText(head, 'h2, .domain-count') }));
        const obj = sec.querySelector('details.objectives');
        if(obj) list.push(makeEntry({ page: tab.id, el: obj, title: 'Objectifs officiels', section: name, color, body: readText(obj, 'summary') }));
        sec.querySelectorAll('article.topic').forEach(art => {
          const h3 = art.querySelector('h3');
          list.push(makeEntry({ page: tab.id, el: art, title: h3 ? cleanText(h3.textContent) : name, section: name, color, body: readText(art, '.topic-head') }));
        });
      });
      root.querySelectorAll('.stage').forEach(st => {
        const h3 = st.querySelector('h3');
        list.push(makeEntry({ page: tab.id, el: st, title: h3 ? cleanText(h3.textContent) : tab.label, section: tab.label, color: null, body: readText(st, 'h3') }));
      });
      root.querySelectorAll('footer.page-footer > div').forEach(div => {
        const strong = div.querySelector('strong');
        list.push(makeEntry({ page: tab.id, el: div, title: strong ? cleanText(strong.textContent) : tab.label, section: 'Bas de page', color: null, body: readText(div, 'strong') }));
      });
    });
    if(ctx.quiz){
      ctx.quiz.questions.forEach(q => {
        const d = ctx.domainById[q.domain];
        list.push(makeEntry({ page: 'quiz', el: null, quizId: q.id, title: q.question.replace(/`/g, ''), section: d ? d.label : '', color: d ? d.color : null, lang: ctx.qLang,
          body: cleanText((q.code ? q.code + ' ' : '') + q.options.join(' · ')).replace(/`/g, '') }));
      });
    }
    if(ctx.cards){
      ctx.cards.cards.forEach(c => {
        const d = ctx.domainById[c.domain];
        list.push(makeEntry({ page: 'cards', el: null, cardId: c.id, title: c.front.replace(/`|\*\*/g, ''), section: d ? d.label : '', color: d ? d.color : null, body: '' }));
      });
    }
    list.forEach((e, i) => { e.pos = i; });
    return list;
  }

  function parseTerms(folded){
    const seen = Object.create(null), terms = [];
    folded.split(/[\s']+/).forEach(t => {
      t = t.replace(/^[,;:!?()\[\]{}"«»]+|[,;:!?()\[\]{}"«».]+$/g, '');
      if(t.length >= 2 && !seen[t]){ seen[t] = 1; terms.push(t); }
    });
    const strong = terms.filter(t => !STOPWORDS[t]);
    return strong.length ? strong : terms;
  }

  // Début de mot, y compris une frontière camelCase (Http|Callout|Mock).
  function isWordStart(raw, map, ni){
    if(ni === 0) return true;
    const o = map[ni], p = map[ni - 1];
    if(o === p) return false;
    const prev = raw.charAt(p), cur = raw.charAt(o);
    if(!ALNUM.test(prev)) return true;
    return prev !== prev.toUpperCase() && cur !== cur.toLowerCase();
  }

  function findAll(norm, raw, map, term, wordMode, cap){
    const out = [];
    const needStart = wordMode && ALNUM.test(term.charAt(0));
    let i = norm.indexOf(term);
    while(i !== -1 && out.length < cap){
      if(!needStart || isWordStart(raw, map, i)) out.push(i);
      i = norm.indexOf(term, i + 1);
    }
    return out;
  }

  function collectRanges(norm, raw, map, terms, wordMode){
    const all = [];
    terms.forEach(t => { findAll(norm, raw, map, t, wordMode, 200).forEach(p => all.push([p, p + t.length])); });
    all.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    all.forEach(r => {
      const last = merged[merged.length - 1];
      if(last && r[0] <= last[1]){ if(r[1] > last[1]) last[1] = r[1]; }
      else merged.push([r[0], r[1]]);
    });
    return merged;
  }

  function scoreEntry(e, terms, phrase, wordMode){
    let score = 0;
    for(let k = 0; k < terms.length; k++){
      const inTitle = findAll(e.tNorm, e.title, e.tMap, terms[k], wordMode, 1).length > 0;
      const inBody = findAll(e.bNorm, e.body, e.bMap, terms[k], wordMode, 8).length;
      if(!inTitle && !inBody) return 0;
      score += (inTitle ? 10 : 0) + inBody;
    }
    if(e.tNorm === phrase) score += 25;
    else if(terms.length > 1 && e.tNorm.indexOf(phrase) !== -1) score += 12;
    else if(terms.length > 1 && e.bNorm.indexOf(phrase) !== -1) score += 6;
    return score;
  }

  function scoreAll(terms, phrase, wordMode){
    const out = [];
    searchIndex.forEach(e => { const s = scoreEntry(e, terms, phrase, wordMode); if(s > 0) out.push({ entry: e, score: s }); });
    return out;
  }

  function windowHtml(raw, map, ranges, maxLen){
    const len = raw.length;
    let os = 0, oe = len;
    if(len > maxLen){
      const fs = ranges.length ? map[ranges[0][0]] : 0;
      const fe = ranges.length ? map[ranges[0][1] - 1] + 1 : 0;
      os = Math.max(0, Math.min(fs - Math.round(maxLen * 0.3), len - maxLen));
      oe = Math.min(len, os + maxLen);
      if(os > 0){ const a = raw.indexOf(' ', os); if(a !== -1 && a < fs) os = a + 1; }
      if(oe < len){ const b = raw.lastIndexOf(' ', oe); if(b > fe) oe = b; }
    }
    let html = os > 0 ? '… ' : '';
    let cur = os;
    for(let k = 0; k < ranges.length; k++){
      let rs = map[ranges[k][0]], re = map[ranges[k][1] - 1] + 1;
      if(re <= cur) continue;
      if(rs >= oe) break;
      if(rs < cur) rs = cur;
      if(re > oe) re = oe;
      html += escapeHtml(raw.slice(cur, rs)) + '<mark>' + escapeHtml(raw.slice(rs, re)) + '</mark>';
      cur = re;
    }
    return html + escapeHtml(raw.slice(cur, oe)) + (oe < len ? ' …' : '');
  }

  function itemHtml(e, i){
    const tRanges = collectRanges(e.tNorm, e.title, e.tMap, lastTerms, lastWordMode);
    const bRanges = collectRanges(e.bNorm, e.body, e.bMap, lastTerms, lastWordMode);
    let snippet = '';
    if(bRanges.length) snippet = windowHtml(e.body, e.bMap, bRanges, 170);
    else if(!e.quizId && !e.cardId && e.body) snippet = windowHtml(e.body, e.bMap, [], 120);
    const langAttr = e.lang ? ' lang="' + e.lang + '"' : '';
    return '<li class="sr-item" role="option" id="sr-' + i + '" data-i="' + i + '" aria-selected="false">' +
      '<span class="sr-section"><span class="sr-dot"' + (e.color ? ' style="background:' + escapeHtml(e.color) + '"' : '') + '></span>' + escapeHtml(e.section) + '</span>' +
      '<span class="sr-title"' + langAttr + '>' + windowHtml(e.title, e.tMap, tRanges, e.quizId ? 160 : 300) + '</span>' +
      (snippet ? '<span class="sr-snippet"' + langAttr + '>' + snippet + '</span>' : '') +
    '</li>';
  }

  function hintHtml(tooShort){
    const covered = groups.map(g => g.id === 'quiz' ? 'les ' + ctx.quiz.questions.length + ' questions du quiz' + (ctx.qLang === 'en' ? ' (en anglais)' : '') :
      g.id === 'cards' ? 'les ' + ctx.cards.cards.length + ' fiches mémo' : 'la page « ' + g.label + ' »');
    return '<div class="sr-hint">' +
      (tooShort ? '<p class="sr-hint-strong">Tape au moins 2 caractères.</p>' : '') +
      '<p>La recherche couvre ' + escapeHtml(covered.join(', ')) + '. L\'examen blanc n\'est pas inclus.</p>' +
      (EXAMPLES.length ? '<p class="sr-examples"><span>Exemples :</span>' + EXAMPLES.map(x =>
        '<button type="button" class="sr-chip" data-q="' + escapeHtml(x) + '">' + escapeHtml(x) + '</button>').join('') + '</p>' : '') +
      '<p class="sr-keys">↑ ↓ pour parcourir · Entrée pour ouvrir · Échap pour fermer · / pour rechercher depuis n\'importe où</p>' +
    '</div>';
  }

  function announce(msg){
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { searchLive.textContent = msg; }, 350);
  }
  function syncClear(){
    searchClearBtn.hidden = !searchInput.value;
    searchBox.classList.toggle('has-query', !!searchInput.value);
  }

  function refresh(){
    syncClear();
    activeResult = -1;
    searchInput.removeAttribute('aria-activedescendant');
    if(!searchIndex) searchIndex = buildIndex();
    const q = cleanText(searchInput.value);
    const phrase = fold(q).norm;
    const terms = parseTerms(phrase);
    if(!terms.length){
      searchResults = [];
      searchPanel.innerHTML = hintHtml(q.length > 0);
      announce('');
      return;
    }
    let wordMode = true;
    let found = scoreAll(terms, phrase, true);
    if(!found.length){ wordMode = false; found = scoreAll(terms, phrase, false); }
    found.sort((a, b) => groupOrder[a.entry.page] - groupOrder[b.entry.page] || b.score - a.score || a.entry.pos - b.entry.pos);
    lastTerms = terms;
    lastWordMode = wordMode;
    if(!found.length){
      searchResults = [];
      searchPanel.innerHTML = '<p class="sr-empty">Aucun résultat pour « ' + escapeHtml(q) + ' ». Vérifie l\'orthographe ou essaie un mot plus court.</p>';
      announce('Aucun résultat');
      return;
    }
    const n = found.length;
    let html = '<p class="sr-status">' + n + ' résultat' + (n > 1 ? 's' : '') + ' pour « ' + escapeHtml(q) + ' »</p>' +
      '<ul class="sr-list" role="listbox" id="search-listbox" aria-label="Résultats de recherche">';
    let idx = 0;
    const ordered = [];
    groups.forEach((g, gk) => {
      const items = found.filter(r => r.entry.page === g.id);
      if(!items.length) return;
      html += '<li role="presentation"><span class="sr-group" id="srg-' + gk + '" aria-hidden="true">' + escapeHtml(g.label) + ' <span>' + items.length + '</span></span>' +
        '<ul role="group" aria-labelledby="srg-' + gk + '">';
      items.forEach(r => { ordered.push(r); html += itemHtml(r.entry, idx++); });
      html += '</ul></li>';
    });
    searchResults = ordered;
    searchPanel.innerHTML = html + '</ul>';
    announce(n + ' résultat' + (n > 1 ? 's' : ''));
  }

  function openPanel(){ searchPanel.hidden = false; panelOpen = true; searchInput.setAttribute('aria-expanded', 'true'); }
  function closePanel(collapse){
    searchPanel.hidden = true;
    panelOpen = false;
    activeResult = -1;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    if(collapse && topbar.classList.contains('search-open')){
      topbar.classList.remove('search-open');
      searchToggle.setAttribute('aria-expanded', 'false');
      syncStickyOffsets();
    }
  }
  function focusSearch(){
    if(mqMobile.matches && !topbar.classList.contains('search-open')){
      topbar.classList.add('search-open');
      searchToggle.setAttribute('aria-expanded', 'true');
      syncStickyOffsets();
    }
    searchInput.focus();
    searchInput.select();
    if(!panelOpen){ refresh(); openPanel(); }
  }
  function setActive(i){
    const items = searchPanel.querySelectorAll('.sr-item');
    if(!items.length){ activeResult = -1; return; }
    if(i < 0) i = items.length - 1;
    if(i >= items.length) i = 0;
    if(activeResult >= 0 && items[activeResult]) items[activeResult].setAttribute('aria-selected', 'false');
    items[i].setAttribute('aria-selected', 'true');
    activeResult = i;
    searchInput.setAttribute('aria-activedescendant', items[i].id);
    items[i].scrollIntoView({ block: 'nearest' });
  }

  // Hauteurs réelles des barres collantes, pour que le défilement vers un résultat ne le cache pas dessous.
  function syncStickyOffsets(){
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--tabbar-h', topbar.offsetHeight + 'px');
    let side = 0;
    if(mqNarrow.matches){
      const nav = document.querySelector('.page-view:not([hidden]) .sidenav');
      if(nav) side = nav.offsetHeight;
    }
    rootStyle.setProperty('--sidenav-h', side + 'px');
  }

  function clearHits(){
    const marks = document.querySelectorAll('mark.search-hit');
    if(!marks.length) return;
    const parents = [];
    marks.forEach(m => {
      const p = m.parentNode;
      p.replaceChild(document.createTextNode(m.textContent), m);
      if(parents.indexOf(p) === -1) parents.push(p);
    });
    parents.forEach(p => p.normalize());
  }

  function highlightIn(root, terms, wordMode){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        if(!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return n.parentNode.closest('.check, script, style, svg, mark.search-hit') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const raw = node.nodeValue;
      const f = fold(raw);
      const ranges = collectRanges(f.norm, raw, f.map, terms, wordMode);
      if(!ranges.length) return;
      const frag = document.createDocumentFragment();
      let cur = 0;
      ranges.forEach(r => {
        const rs = f.map[r[0]], re = f.map[r[1] - 1] + 1;
        if(rs > cur) frag.appendChild(document.createTextNode(raw.slice(cur, rs)));
        const m = document.createElement('mark');
        m.className = 'search-hit';
        m.textContent = raw.slice(rs, re);
        frag.appendChild(m);
        cur = re;
      });
      if(cur < raw.length) frag.appendChild(document.createTextNode(raw.slice(cur)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function flash(el){
    document.querySelectorAll('.search-target').forEach(x => x.classList.remove('search-target'));
    void el.offsetWidth;
    el.classList.add('search-target');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('search-target'), 2600);
  }

  function openResult(r){
    const e = r.entry;
    closePanel(true);
    searchInput.blur();
    clearHits();
    app.showTab(e.page);
    let target = e.el, hl = e.hl;
    if(e.quizId) target = hl = app.quiz.focusQuestion(e.quizId);
    else if(e.cardId) target = hl = app.cards.showCard(e.cardId);
    else {
      const det = target && target.closest('details');
      if(det) det.open = true;
    }
    if(!target) return;
    syncStickyOffsets();
    target.scrollIntoView({ block: 'start' });
    if(!e.cardId) highlightIn(hl, lastTerms, lastWordMode);
    flash(hl);
    if(!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.classList.add('search-focusable');
    try{ target.focus({ preventScroll: true }); }catch(err){}
  }

  searchInput.addEventListener('focus', () => { refresh(); openPanel(); });
  searchInput.addEventListener('click', () => { if(!panelOpen){ refresh(); openPanel(); } });
  searchInput.addEventListener('input', () => { clearHits(); refresh(); openPanel(); });
  searchInput.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      if(!panelOpen){ refresh(); openPanel(); }
      setActive(activeResult + (e.key === 'ArrowDown' ? 1 : -1));
    } else if(e.key === 'Enter'){
      if(e.isComposing) return;
      e.preventDefault();
      if(activeResult >= 0 && searchResults[activeResult]) openResult(searchResults[activeResult]);
      else if(searchResults.length){
        if(mqTouch.matches) searchInput.blur();
        else openResult(searchResults[0]);
      }
    } else if(e.key === 'Escape'){
      e.preventDefault();
      if(panelOpen) closePanel(false);
      else if(searchInput.value){ searchInput.value = ''; clearHits(); syncClear(); }
      else { closePanel(true); searchInput.blur(); }
    }
  });
  searchClearBtn.addEventListener('click', () => { searchInput.value = ''; clearHits(); searchInput.focus(); refresh(); openPanel(); });
  searchToggle.addEventListener('click', () => {
    if(topbar.classList.contains('search-open')){ closePanel(true); searchInput.blur(); }
    else focusSearch();
  });
  searchPanel.addEventListener('mousedown', e => { if(e.target.closest('.sr-item, .sr-chip')) e.preventDefault(); });
  searchPanel.addEventListener('click', e => {
    const chip = e.target.closest('.sr-chip');
    if(chip){ searchInput.value = chip.dataset.q; clearHits(); refresh(); openPanel(); searchInput.focus(); return; }
    const item = e.target.closest('.sr-item');
    if(item){ const r = searchResults[parseInt(item.dataset.i, 10)]; if(r) openResult(r); }
  });
  searchBox.addEventListener('focusout', e => {
    const to = e.relatedTarget;
    if(to && !searchBox.contains(to) && to !== searchToggle) closePanel(true);
  });
  document.addEventListener('pointerdown', e => {
    if(!panelOpen && !topbar.classList.contains('search-open')) return;
    if(searchBox.contains(e.target) || searchToggle.contains(e.target)) return;
    closePanel(true);
  });
  document.addEventListener('keydown', e => {
    if(e.defaultPrevented || e.altKey) return;
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !typing;
    const isCmdK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
    if(isSlash || isCmdK){ e.preventDefault(); focusSearch(); }
  });
  function onMobileChange(){
    if(!mqMobile.matches){ topbar.classList.remove('search-open'); searchToggle.setAttribute('aria-expanded', 'false'); }
    syncStickyOffsets();
  }
  if(mqMobile.addEventListener) mqMobile.addEventListener('change', onMobileChange);
  else if(mqMobile.addListener) mqMobile.addListener(onMobileChange);

  syncStickyOffsets();
  if('ResizeObserver' in window){
    const ro = new ResizeObserver(() => syncStickyOffsets());
    ro.observe(topbar);
    document.querySelectorAll('.sidenav').forEach(n => ro.observe(n));
  }
  window.addEventListener('resize', syncStickyOffsets);

  return { syncStickyOffsets };
}
