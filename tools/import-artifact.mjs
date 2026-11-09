#!/usr/bin/env node
/* Importe une fiche de révision au format « artefact » (une page HTML avec les onglets
   Fiche, En détail, Quiz et Examen blanc, et les tableaux QUESTIONS et EXAM_Q dans le script)
   et produit un dossier certifications/<id>/ prêt pour le framework.

   Usage :
     node tools/import-artifact.mjs <fichier.html> <id> [--title "Titre"] [--vendor Salesforce] [--track Developer] [--code PDII]

   Le cert.json produit est un point de départ : relis-le et complète-le (résumé, sources, faits d'examen).
   Un cert.json existant n'est pas écrasé ; seuls fiche.html, details.html, quiz.json et exam.json le sont. */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
if(args.length < 2){
  console.error('Usage : node tools/import-artifact.mjs <fichier.html> <id> [--title ...] [--vendor ...] [--track ...] [--code ...]');
  process.exit(1);
}
const [file, id] = args;
const opt = {};
for(let i = 2; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
if(!/^[a-z0-9][a-z0-9-]*$/.test(id)){ console.error('Identifiant invalide : lettres minuscules, chiffres et tirets.'); process.exit(1); }

const html = fs.readFileSync(file, 'utf8');
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'certifications', id);
fs.mkdirSync(outDir, { recursive: true });

function between(start, end){
  const s = html.indexOf(start);
  if(s < 0) return null;
  const e = html.indexOf(end, s + start.length);
  if(e < 0) return null;
  return html.slice(s + start.length, e).replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n';
}
function evalArray(name){
  const marker = '  var ' + name + ' = [';
  const s = html.indexOf(marker);
  if(s < 0) return null;
  const e = html.indexOf('\n  ];\n', s);
  return vm.runInNewContext(html.slice(s + marker.length - 1, e + 4));
}
function evalObject(name){
  const m = html.match(new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\});'));
  return m ? vm.runInNewContext('(' + m[1] + ')') : null;
}
function evalExpr(name){
  const m = html.match(new RegExp('var ' + name + ' = ([^;]+);'));
  return m ? vm.runInNewContext(m[1]) : null;
}
function text(fragment){
  return String(fragment || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function convertQuestion(q){
  const out = { id: q.id, domain: q.domain, question: q.q };
  if(q.code) out.code = q.code;
  if(q.codeOpts) out.codeOptions = true;
  out.options = q.options;
  out.answer = Array.isArray(q.correct) ? q.correct : [q.correct];
  out.explanation = q.explain;
  return out;
}

const fiche = between('<div id="page-fiche" class="page-view">', '</div><!-- /page-fiche -->');
const details = between('<div id="page-details" class="page-view" hidden>', '</div><!-- /page-details -->');
const QUESTIONS = evalArray('QUESTIONS');
const EXAM_Q = evalArray('EXAM_Q');
const DOMAIN_META = evalObject('DOMAIN_META') || {};
const DOMAIN_ORDER = evalExpr('DOMAIN_ORDER') || Object.keys(DOMAIN_META);
const DOMAIN_WEIGHT = evalObject('DOMAIN_WEIGHT') || {};
const duration = evalExpr('EXAM_DURATION');
const passRate = evalExpr('PASS_RATE');
const examples = evalExpr('SEARCH_EXAMPLES');

if(fiche) fs.writeFileSync(path.join(outDir, 'fiche.html'), fiche);
if(details) fs.writeFileSync(path.join(outDir, 'details.html'), details);
if(QUESTIONS) fs.writeFileSync(path.join(outDir, 'quiz.json'), JSON.stringify({ version: 1, questions: QUESTIONS.map(convertQuestion) }, null, 2) + '\n');
if(EXAM_Q) fs.writeFileSync(path.join(outDir, 'exam.json'), JSON.stringify({ version: 1, questions: EXAM_Q.map(convertQuestion) }, null, 2) + '\n');

/* Noms officiels des domaines : texte avant « · » dans l'en-tête de chaque section de la fiche. */
const officialName = {};
for(const m of (fiche || '').matchAll(/<section class="domain" id="([a-z0-9-]+)">[\s\S]*?<span class="weight">([^<]*?)\s*·/g)) officialName[m[1]] = text(m[2]);

const certPath = path.join(outDir, 'cert.json');
if(!fs.existsSync(certPath)){
  const h1 = (fiche || '').match(/<h1>([\s\S]*?)<\/h1>/);
  const sub = (fiche || '').match(/<p class="sub">([\s\S]*?)<\/p>/);
  const verified = (fiche || '').match(/<p class="verified">([\s\S]*?)<\/p>/);
  const cert = {
    id,
    title: opt.title || text(h1 && h1[1]),
    shortTitle: opt.short || undefined,
    vendor: opt.vendor || 'Salesforce',
    track: opt.track || undefined,
    code: opt.code || undefined,
    summary: text(sub && sub[1]),
    verified: text(verified && verified[1]) || undefined,
    language: { content: 'fr', questions: /class="qprompt" lang="en"/.test(html) ? 'en' : 'fr' },
    exam: {
      durationMinutes: duration ? Math.round(duration / 60000) : undefined,
      scoredQuestions: 60,
      unscoredQuestions: 5,
      passRate: typeof passRate === 'number' ? passRate : undefined
    },
    domains: DOMAIN_ORDER.map(d => ({ id: d, label: DOMAIN_META[d] ? DOMAIN_META[d].label : d, name: officialName[d] || undefined, weight: DOMAIN_WEIGHT[d], color: DOMAIN_META[d] ? DOMAIN_META[d].color : undefined })),
    quiz: /class="qanatomy"/.test(html) ? { style: 'certification' } : undefined,
    content: {
      fiche: fiche ? 'fiche.html' : undefined,
      pages: details ? [{ id: 'details', label: 'En détail', file: 'details.html' }] : [],
      quiz: QUESTIONS ? 'quiz.json' : undefined,
      exam: EXAM_Q ? 'exam.json' : undefined
    },
    mockExams: EXAM_Q ? [{ id: 'full', label: 'Examen blanc', source: 'exam', durationMinutes: duration ? Math.round(duration / 60000) : 90 }] : undefined,
    searchExamples: Array.isArray(examples) ? examples : undefined
  };
  fs.writeFileSync(certPath, JSON.stringify(cert, null, 2) + '\n');
}

console.log('Import terminé dans ' + path.relative(process.cwd(), outDir) + ' : ' +
  [fiche && 'fiche', details && 'détail', QUESTIONS && QUESTIONS.length + ' questions de quiz', EXAM_Q && EXAM_Q.length + ' questions d\'examen'].filter(Boolean).join(', ') + '.');
console.log('Ajoute "' + id + '" à certifications/catalog.json, puis lance : node tools/validate.mjs --fix');
