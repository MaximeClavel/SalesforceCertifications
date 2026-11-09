/* Chargement des données d'une certification (dossier certifications/<id>/). */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

async function fetchText(url){
  const res = await fetch(url, { cache: 'no-cache' });
  if(!res.ok) throw new Error('Impossible de charger ' + url + ' (' + res.status + ')');
  return res.text();
}
async function fetchJSON(url){
  return JSON.parse(await fetchText(url));
}

export function isValidId(id){ return typeof id === 'string' && ID_PATTERN.test(id); }

export async function loadCatalog(){
  return fetchJSON('certifications/catalog.json');
}

export async function loadMeta(id){
  if(!isValidId(id)) throw new Error('Identifiant de certification invalide.');
  return fetchJSON('certifications/' + id + '/cert.json');
}

export async function loadCert(id){
  const meta = await loadMeta(id);
  const base = 'certifications/' + id + '/';
  const c = meta.content || {};
  const [fiche, quiz, exam, cards, pages] = await Promise.all([
    c.fiche ? fetchText(base + c.fiche) : null,
    c.quiz ? fetchJSON(base + c.quiz) : null,
    c.exam ? fetchJSON(base + c.exam) : null,
    c.flashcards ? fetchJSON(base + c.flashcards) : null,
    Promise.all((c.pages || []).map(async p => Object.assign({}, p, { html: await fetchText(base + p.file) })))
  ]);
  const domains = meta.domains || [];
  const domainById = {};
  domains.forEach(d => { domainById[d.id] = d; });
  return {
    id, base, meta, fiche, pages,
    quiz: quiz && quiz.questions && quiz.questions.length ? quiz : null,
    exam: exam && exam.questions && exam.questions.length ? exam : null,
    cards: cards && cards.cards && cards.cards.length ? cards : null,
    domains, domainById,
    qLang: (meta.language && meta.language.questions) || 'fr'
  };
}
