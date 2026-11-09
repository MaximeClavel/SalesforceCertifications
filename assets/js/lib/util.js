/* Utilitaires partagés par toutes les vues. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Texte enrichi minimal pour les données JSON : `code` et **gras**. Tout le reste est échappé. */
export function richText(str){
  return escapeHtml(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

export function letter(i){ return String.fromCharCode(65 + i); }

export function plural(n, one, many){ return n + ' ' + (n > 1 ? many : one); }

/* Ordre pseudo-aléatoire mais stable pour une clé donnée (FNV-1a + mulberry32). */
export function seededOrder(key, n){
  let h = 2166136261;
  for(let i = 0; i < key.length; i++){ h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  function rnd(){
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const a = [];
  for(let j = 0; j < n; j++) a.push(j);
  for(let k = n - 1; k > 0; k--){ const r = Math.floor(rnd() * (k + 1)); const tmp = a[k]; a[k] = a[r]; a[r] = tmp; }
  return a;
}

export function shuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function sameSet(a, b){
  if(a.length !== b.length) return false;
  const s = a.slice().sort((x, y) => x - y);
  const t = b.slice().sort((x, y) => x - y);
  return s.every((v, i) => v === t[i]);
}

export function formatClock(ms){
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}

export function formatDuration(ms){
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + ' h ' + (m < 10 ? '0' : '') + m + ' min' : m + ' min';
}

export function focusNoScroll(el){
  if(!el) return;
  try{ el.focus({ preventScroll: true }); }catch(e){ el.focus(); }
}

/* Consignes propres à la langue des questions. */
export function hintText(lang, n){
  if(lang === 'en') return n > 1 ? 'Choose ' + n + ' answers.' : 'Choose 1 answer.';
  return n > 1 ? 'Choisissez ' + n + ' réponses.' : 'Choisissez 1 réponse.';
}
export function answersLabel(lang){ return lang === 'en' ? 'Answers' : 'Réponses'; }
