# Ajouter une certification

Une certification, c'est un dossier `certifications/<id>/` et une ligne dans `certifications/catalog.json`. Le moteur (`cert.html` et `assets/`) est commun à toutes les certifications : on n'y touche pas pour en ajouter une.

## En cinq étapes

1. Copie `certifications/_template/` vers `certifications/<id>/`. L'identifiant est en minuscules, avec des chiffres et des tirets : `platform-administrator`, `data-cloud-consultant`…
2. Dans `cert.json`, remplace `"id"` par le nom du dossier et renseigne l'examen, les domaines et leurs objectifs.
3. Écris les questions dans `quiz.json`, et si tu veux des fiches mémo, dans `flashcards.json`.
4. Ajoute l'identifiant dans `certifications/catalog.json`. L'ordre de cette liste est l'ordre d'affichage dans le catalogue.
5. Lance `node tools/validate.mjs --fix`, corrige les erreurs signalées, puis vérifie le rendu en local (voir le README).

Tu as une fiche au format « artefact » (une page HTML avec les onglets Fiche, En détail, Quiz et Examen blanc) ? L'outil d'import fait les étapes 1 à 3 :

```sh
node tools/import-artifact.mjs ma-fiche.html <id> --title "Nom de la certification" --vendor Salesforce --track Administrator
```

## Ce que contient un dossier

| Fichier | Obligatoire | Rôle |
| --- | --- | --- |
| `cert.json` | oui | Description de la certification et liste des contenus |
| `fiche.html` | non | Fiche rédigée à la main. Sans elle, la fiche est générée à partir des domaines et des objectifs |
| `quiz.json` | non | Questions d'entraînement, corrigées immédiatement |
| `exam.json` | non | Banque dédiée à l'examen blanc. Sans elle, l'examen blanc peut tirer dans `quiz.json` |
| `flashcards.json` | non | Fiches mémo recto verso |
| autres `.html` | non | Pages supplémentaires déclarées dans `content.pages` (détail, schéma, aide-mémoire…) |
| `.css` | non | Styles propres à la certification, déclarés dans `styles` |

Les onglets affichés dépendent de ce qui est fourni : Fiche, puis les pages supplémentaires, Quiz, Examen blanc et Fiches mémo.

## `cert.json`

```json
{
  "id": "platform-administrator",
  "title": "Platform Administrator",
  "shortTitle": "Admin",
  "vendor": "Salesforce",
  "track": "Administrator",
  "code": "Plat-Admin-201",
  "summary": "Affiché dans le catalogue et en tête de la fiche générée.",
  "verified": "Vérifié le 1er décembre 2026 avec le guide d'examen officiel.",
  "language": { "content": "fr", "questions": "en" },
  "exam": {
    "durationMinutes": 105,
    "scoredQuestions": 60,
    "unscoredQuestions": 5,
    "passRate": 0.65,
    "passingLabel": "seuil 65 %",
    "price": "200 USD · repassage 100 USD"
  },
  "facts": ["**60** questions", "**105** min", "seuil **65 %**"],
  "domains": [
    {
      "id": "config",
      "label": "Configuration et installation",
      "short": "Configuration",
      "name": "Configuration and Setup",
      "weight": 20,
      "color": "#3450d6",
      "description": "Phrase facultative sous le titre du domaine.",
      "objectives": ["Objectif officiel 1", "Objectif officiel 2"]
    }
  ],
  "quiz": { "style": "certification" },
  "content": {
    "fiche": "fiche.html",
    "pages": [{ "id": "details", "label": "En détail", "file": "details.html" }],
    "quiz": "quiz.json",
    "exam": "exam.json",
    "flashcards": "flashcards.json"
  },
  "styles": [],
  "mockExams": [
    { "id": "full", "label": "Examen blanc", "source": "exam", "durationMinutes": 105 }
  ],
  "labels": { "cards": "Flashcards" },
  "notes": ["Affichées en bas de la fiche générée."],
  "sources": [{ "label": "Guide d'examen", "url": "https://…" }],
  "searchExamples": ["Permission Set", "Flow"]
}
```

Les champs utiles à connaître :

- `language.questions` : `"en"` si les questions et les réponses sont en anglais. Les consignes (« Choose 2 answers. ») suivent cette langue ; les explications restent en français.
- `exam.passRate` : seuil de réussite entre 0 et 1. Il sert à l'examen blanc et au trait de seuil des résultats par domaine.
- `domains` : l'ordre de la liste est l'ordre d'affichage. `weight` est le poids officiel en %, `color` une couleur `#rrggbb`. Les `objectives` alimentent la fiche générée : chaque objectif devient un point à cocher « Revu ».
- `quiz.style` : `"certification"` ajoute l'encadré qui explique les pièges types (piège plausible, inversion, faux terme).
- `facts` et `summary` acceptent `**gras**` et `` `code` ``.
- `stats` : compteurs affichés dans le catalogue. Ne les écris pas à la main, `node tools/validate.mjs --fix` les calcule.

### Formats d'examen blanc (`mockExams`)

Chaque format devient un bouton « Démarrer » :

- `"source": "exam"` sans `allocation` : toute la banque `exam.json`, dans un ordre mélangé.
- `"source": "quiz"` ou `"exam"` avec `allocation` : tirage aléatoire du nombre de questions demandé par domaine, par exemple `{ "config": 12, "securite": 9 }`.

```json
"mockExams": [
  { "id": "full", "label": "Examen complet", "source": "quiz", "durationMinutes": 105, "allocation": { "config": 12, "securite": 9 } },
  { "id": "mini", "label": "Mini-examen", "source": "quiz", "durationMinutes": 35, "allocation": { "config": 4, "securite": 3 }, "description": "Pour une séance courte." }
]
```

## Questions (`quiz.json`, `exam.json`)

```json
{
  "version": 1,
  "questions": [
    {
      "id": "cfg1",
      "domain": "config",
      "objective": 0,
      "question": "Universal Containers wants… Which two options should the administrator recommend?",
      "code": "SELECT Id FROM Account",
      "codeOptions": false,
      "options": ["Bonne réponse", "Seconde bonne réponse", "Piège plausible", "Inversion", "Faux terme"],
      "answer": [0, 1],
      "explanation": "Explication en français : pourquoi les bonnes réponses sont justes, et pourquoi chaque piège est faux."
    }
  ]
}
```

- `answer` est toujours un tableau d'indices dans `options` (0 pour la première). Avec plusieurs indices, la question devient à réponses multiples : il faut tout cocher pour marquer le point.
- L'ordre des options est mélangé à l'affichage : écris la bonne réponse où tu veux.
- `objective` (facultatif) est l'indice de l'objectif dans `domains[].objectives`. La fiche générée affiche alors le nombre de questions par objectif.
- `code` affiche un bloc de code sous l'énoncé, et `codeOptions: true` affiche les options en police à chasse fixe.
- Le texte accepte `` `code` ``, pas de HTML.
- **Incrémente `version` quand tu modifies des réponses ou l'ordre des options** : les réponses déjà enregistrées dans les navigateurs sont alors remises à zéro au lieu de devenir fausses.

## Fiches mémo (`flashcards.json`)

```json
{ "version": 1, "cards": [ { "id": "c1", "domain": "config", "front": "Recto", "back": "Verso avec **gras** ou `code`." } ] }
```

## Fiche et pages en HTML

`fiche.html` et les pages de `content.pages` sont des fragments HTML (sans `<html>` ni `<body>`), insérés tels quels. Ils réutilisent les classes de `assets/css/app.css`. Pour que la progression, la navigation et la recherche fonctionnent :

- `<header class="hero">` en tête, avec éventuellement `<div class="facts">` (indexé par la recherche) et la barre de progression :
  `<div class="progress-track"><div class="progress-fill" id="overall-bar"></div></div><span id="overall-progress"></span>`.
- Une `<nav class="sidenav">` dont les liens pointent vers les sections (`href="#config"`) et contiennent `<span class="nav-count"></span>`.
- Une `<section class="domain" id="<id du domaine>">` par domaine, avec `<div class="domain-head">` (titre `h2`, poids dans `<span class="weight">`, compteur `<span class="domain-count">`).
- Un `<article class="topic" data-topic="identifiant-unique">` par point, avec `<div class="topic-head"><h3>Titre</h3><button class="check" role="checkbox" aria-checked="false">Revu</button></div>`.
- Encadrés disponibles : `<div class="trap"><b>Piège</b>…</div>`, `<div class="why"><b>Pourquoi c'est testé</b>…</div>`, `<details class="objectives">`, `<div class="table-wrap"><table>…</table></div>`, `<ol class="steps">`, `<pre>` avec `<span class="c">` (commentaire) et `<span class="k">` (mot-clé).
- Un bouton `<button data-goto="quiz" data-domain="config">` ouvre le quiz filtré sur ce domaine ; `data-goto="cards"` fait de même pour les fiches mémo.

Les identifiants HTML doivent être uniques entre la fiche et les pages : préfixe ceux des pages (`d-config`, `memo-…`).

## Vérifier avant de publier

```sh
node tools/validate.mjs --fix   # contrôle et met à jour les compteurs
python3 -m http.server 8000     # puis ouvre http://localhost:8000
```

Le validateur vérifie les identifiants, les domaines, les indices de réponse, les fichiers déclarés, les formats d'examen blanc et le catalogue. La même vérification tourne sur GitHub avant chaque publication.
