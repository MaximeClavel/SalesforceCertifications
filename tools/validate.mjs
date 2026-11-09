#!/usr/bin/env node
/* Vérifie toutes les certifications déclarées dans certifications/catalog.json.
   Usage :
     node tools/validate.mjs          contrôle tout et sort en erreur au moindre problème
     node tools/validate.mjs --fix    met aussi à jour le bloc "stats" de chaque cert.json (compteurs du catalogue)
   Aucune dépendance : Node 18 ou plus suffit. */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const CERTS = path.join(ROOT, 'certifications');
const FIX = process.argv.includes('--fix');
const ID = /^[a-z0-9][a-z0-9-]*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
let errors = 0, warnings = 0;

const err = (where, msg) => { errors++; console.log('  ✗ ' + where + ' : ' + msg); };
const warn = (where, msg) => { warnings++; console.log('  ! ' + where + ' : ' + msg); };

function readJSON(file, where){
  try{ return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e){ err(where, 'JSON illisible (' + e.message + ')'); return null; }
}

function checkQuestions(list, where, domainIds){
  const ids = new Set();
  list.forEach((q, i) => {
    const w = where + ' #' + (i + 1) + (q && q.id ? ' (' + q.id + ')' : '');
    if(!q || typeof q !== 'object'){ err(w, 'entrée invalide'); return; }
    if(typeof q.id !== 'string' || !q.id) err(w, 'id manquant');
    else if(ids.has(q.id)) err(w, 'id en double');
    else ids.add(q.id);
    if(!domainIds.has(q.domain)) err(w, 'domaine inconnu « ' + q.domain + ' »');
    if(typeof q.question !== 'string' || !q.question.trim()) err(w, 'énoncé manquant');
    if(!Array.isArray(q.options) || q.options.length < 2) err(w, 'au moins deux options sont nécessaires');
    else {
      if(q.options.some(o => typeof o !== 'string' || !o.trim())) err(w, 'option vide');
      if(new Set(q.options).size !== q.options.length) err(w, 'options en double');
    }
    if(!Array.isArray(q.answer) || !q.answer.length) err(w, '"answer" doit être un tableau non vide d\'indices');
    else {
      if(new Set(q.answer).size !== q.answer.length) err(w, 'indice de réponse en double');
      if(q.answer.some(a => !Number.isInteger(a) || a < 0 || !q.options || a >= q.options.length)) err(w, 'indice de réponse hors des options');
      if(q.options && q.answer.length >= q.options.length) err(w, 'toutes les options ne peuvent pas être justes');
    }
    if(typeof q.explanation !== 'string' || !q.explanation.trim()) err(w, 'explication manquante');
    if(q.objective != null && !Number.isInteger(q.objective)) err(w, '"objective" doit être un entier (indice dans les objectifs du domaine)');
  });
  return ids;
}

function checkCert(id){
  console.log('• ' + id);
  const dir = path.join(CERTS, id);
  if(!ID.test(id)){ err(id, 'identifiant invalide (minuscules, chiffres, tirets)'); return; }
  if(!fs.existsSync(dir)){ err(id, 'dossier certifications/' + id + ' introuvable'); return; }
  const certFile = path.join(dir, 'cert.json');
  const cert = readJSON(certFile, 'cert.json');
  if(!cert) return;
  if(cert.id !== id) err('cert.json', '"id" vaut « ' + cert.id + ' » au lieu de « ' + id + ' »');
  ['title', 'vendor'].forEach(k => { if(typeof cert[k] !== 'string' || !cert[k].trim()) err('cert.json', '"' + k + '" manquant'); });
  const exam = cert.exam || {};
  if(typeof exam.passRate !== 'number' || exam.passRate <= 0 || exam.passRate > 1) err('cert.json', '"exam.passRate" doit être un nombre entre 0 et 1 (ex. 0.7)');
  if(!Array.isArray(cert.domains) || !cert.domains.length){ err('cert.json', '"domains" doit lister au moins un domaine'); return; }
  const domainIds = new Set();
  cert.domains.forEach((d, i) => {
    const w = 'domaine #' + (i + 1);
    if(!d || !ID.test(d.id || '')) err(w, 'id invalide');
    else if(domainIds.has(d.id)) err(w, 'id en double « ' + d.id + ' »');
    else domainIds.add(d.id);
    if(typeof d.label !== 'string' || !d.label) err(w, '"label" manquant');
    if(typeof d.weight !== 'number') err(w, '"weight" (poids en %) manquant');
    if(!COLOR.test(d.color || '')) err(w, '"color" doit être une couleur #rrggbb');
    if(d.objectives != null && !Array.isArray(d.objectives)) err(w, '"objectives" doit être un tableau de textes');
  });
  const totalWeight = cert.domains.reduce((s, d) => s + (d.weight || 0), 0);
  if(Math.abs(totalWeight - 100) > 1) warn('cert.json', 'la somme des poids des domaines vaut ' + totalWeight + ' %');

  const content = cert.content || {};
  const fileOf = (name, label) => {
    if(!name) return null;
    const f = path.join(dir, name);
    if(!fs.existsSync(f)){ err('cert.json', label + ' : fichier « ' + name + ' » introuvable'); return null; }
    return f;
  };
  fileOf(content.fiche, 'content.fiche');
  if(!content.fiche && !cert.domains.some(d => d.objectives && d.objectives.length)) warn('cert.json', 'ni fiche.html ni objectifs : la fiche sera presque vide');
  const pageIds = new Set(['fiche', 'quiz', 'exam', 'cards']);
  (content.pages || []).forEach((p, i) => {
    if(!p || !ID.test(p.id || '')) err('content.pages #' + (i + 1), 'id invalide');
    else if(pageIds.has(p.id)) err('content.pages #' + (i + 1), 'id « ' + p.id + ' » déjà utilisé');
    else pageIds.add(p.id);
    if(!p.label) err('content.pages #' + (i + 1), '"label" manquant');
    fileOf(p.file, 'content.pages « ' + (p.id || i + 1) + ' »');
  });
  (cert.styles || []).forEach(s => fileOf(s, 'styles'));
  (cert.sources || []).forEach((s, i) => { if(!s || !/^https:\/\//.test(s.url || '') || !s.label) err('sources #' + (i + 1), 'chaque source a un "label" et une "url" en https'); });

  const banks = {};
  const stats = {};
  [['quiz', 'quiz.json'], ['exam', 'exam.json']].forEach(([key]) => {
    const f = fileOf(content[key], 'content.' + key);
    if(!f) return;
    const data = readJSON(f, content[key]);
    if(!data) return;
    if(!Array.isArray(data.questions) || !data.questions.length){ err(content[key], '"questions" doit être un tableau non vide'); return; }
    if(data.version != null && !Number.isInteger(data.version)) err(content[key], '"version" doit être un entier');
    checkQuestions(data.questions, content[key], domainIds);
    banks[key] = data.questions;
    stats[key] = data.questions.length;
    data.questions.forEach(q => {
      const d = cert.domains.find(x => x.id === q.domain);
      if(d && q.objective != null && (!d.objectives || q.objective < 0 || q.objective >= d.objectives.length)) err(content[key] + ' (' + q.id + ')', 'objectif ' + q.objective + ' inexistant dans le domaine « ' + d.id + ' »');
    });
  });
  const cardsFile = fileOf(content.flashcards, 'content.flashcards');
  if(cardsFile){
    const data = readJSON(cardsFile, content.flashcards);
    if(data){
      if(!Array.isArray(data.cards) || !data.cards.length) err(content.flashcards, '"cards" doit être un tableau non vide');
      else {
        const ids = new Set();
        data.cards.forEach((c, i) => {
          const w = content.flashcards + ' #' + (i + 1);
          if(!c || !c.id) err(w, 'id manquant'); else if(ids.has(c.id)) err(w, 'id en double « ' + c.id + ' »'); else ids.add(c.id);
          if(!domainIds.has(c && c.domain)) err(w, 'domaine inconnu « ' + (c && c.domain) + ' »');
          if(!c || !c.front || !c.back) err(w, '"front" et "back" sont obligatoires');
        });
        stats.flashcards = data.cards.length;
      }
    }
  }

  const modes = cert.mockExams || [];
  if(!modes.length && banks.exam) warn('cert.json', 'exam.json existe mais "mockExams" est vide : un format par défaut sera utilisé');
  const modeIds = new Set();
  modes.forEach((m, i) => {
    const w = 'mockExams #' + (i + 1);
    if(!m || !ID.test(m.id || '')) err(w, 'id invalide');
    else if(modeIds.has(m.id)) err(w, 'id en double'); else modeIds.add(m.id);
    if(!m.label) err(w, '"label" manquant');
    if(m.source !== 'exam' && m.source !== 'quiz') err(w, '"source" doit valoir "exam" ou "quiz"');
    else if(!banks[m.source]) err(w, 'la banque « ' + m.source + ' » est absente');
    if(typeof m.durationMinutes !== 'number' || m.durationMinutes <= 0) err(w, '"durationMinutes" manquant');
    if(m.allocation){
      Object.keys(m.allocation).forEach(k => {
        if(!domainIds.has(k)) err(w, 'allocation : domaine inconnu « ' + k + ' »');
        else if(banks[m.source]){
          const have = banks[m.source].filter(q => q.domain === k).length;
          if(have < m.allocation[k]) warn(w, 'allocation « ' + k + ' » : ' + m.allocation[k] + ' demandées, ' + have + ' disponibles');
        }
      });
    }
  });

  const s = cert.stats || {};
  const same = ['quiz', 'exam', 'flashcards'].every(k => (s[k] || 0) === (stats[k] || 0));
  if(!same){
    if(FIX){
      cert.stats = stats;
      fs.writeFileSync(certFile, JSON.stringify(cert, null, 2) + '\n');
      console.log('  ↻ stats mises à jour : ' + JSON.stringify(stats));
    } else err('cert.json', '"stats" ne correspond pas au contenu ' + JSON.stringify(stats) + ' : lance node tools/validate.mjs --fix');
  }
}

const catalog = readJSON(path.join(CERTS, 'catalog.json'), 'catalog.json');
if(catalog){
  const ids = catalog.certifications;
  if(!Array.isArray(ids) || !ids.length) err('catalog.json', '"certifications" doit lister au moins un identifiant');
  else {
    if(new Set(ids).size !== ids.length) err('catalog.json', 'identifiant en double');
    ids.forEach(checkCert);
    fs.readdirSync(CERTS, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_') && ids.indexOf(d.name) === -1)
      .forEach(d => warn('catalog.json', 'le dossier « ' + d.name + ' » n\'est pas dans le catalogue'));
  }
}
console.log('\n' + (errors ? errors + ' erreur' + (errors > 1 ? 's' : '') : 'Aucune erreur') + (warnings ? ', ' + warnings + ' avertissement' + (warnings > 1 ? 's' : '') : '') + '.');
process.exit(errors ? 1 : 0);
