# Révisions de certifications

Un site statique pour réviser des certifications : on choisit la certification dans le catalogue, puis on révise avec la fiche par domaine officiel, le quiz corrigé, l'examen blanc chronométré et, selon la certification, une page détaillée, un schéma, un aide-mémoire ou des fiches mémo.

Le moteur est commun : chaque certification n'est qu'un dossier de données. Le site se publie sur GitHub Pages, sans étape de compilation.

## Certifications incluses

| Certification | Contenu |
| --- | --- |
| Salesforce Platform App Builder | Fiche, En détail, 40 questions de quiz, examen blanc de 60 questions |
| Salesforce Platform Developer II | Fiche, En détail, 40 questions de quiz, examen blanc de 60 questions (38 questions avec un extrait de code Apex, LWC ou Visualforce) |
| Salesforce Development Lifecycle and Deployment Architect | Fiche, En détail, 40 questions de quiz, examen blanc de 60 questions |
| Salesforce Integration Architect | Fiche par section officielle, 30 questions de quiz, examen blanc de 60 questions |
| Salesforce Identity and Access Management Architect | Fiche par section officielle, 30 questions de quiz, examen blanc de 60 questions |
| Salesforce Agentforce Specialist | Fiche par objectif, Schéma, 84 questions, examen complet et mini-examen, 42 fiches mémo |
| Claude Certified Architect – Professional (Anthropic) | Fiche par objectif, Aide-mémoire, 28 questions, mini-examen, 43 fiches mémo |

Les questions sont rédigées pour l'entraînement à partir des guides et de la documentation officiels ; elles ne proviennent pas des examens.

### Parcours System Architect

Le credential System Architect est attribué automatiquement avec quatre certifications : Platform Developer, Development Lifecycle and Deployment Architect, Integration Architect et Identity and Access Management Architect. Les trois certifications d'architecte ont leur fiche dans ce site.

## Ce que fait chaque onglet

- **Fiche** : les domaines officiels avec leur poids, un bouton « Revu » par point et la progression globale.
- **Quiz** : correction immédiate avec explication, filtres par domaine et « Mes erreurs », questions à réponses multiples sans point partiel.
- **Examen blanc** : chronomètre, marquage pour révision, grille de navigation, « Voir la réponse » qui met le chrono en pause jusqu'à la question suivante, score par domaine, correction détaillée et historique.
- **Fiches mémo** : recto verso, « Je sais » ou « À revoir », filtre des cartes à revoir.
- **Recherche** (touche `/`) : fiche, pages, questions du quiz et fiches mémo, sans tenir compte des accents.

La progression est enregistrée dans le navigateur (`localStorage`), séparément pour chaque certification. Le catalogue l'affiche sur chaque carte.

## Lancer en local

Les données sont chargées avec `fetch`, il faut donc un petit serveur (ouvrir `index.html` directement ne fonctionne pas) :

```sh
python3 -m http.server 8000
```

Puis ouvre <http://localhost:8000>.

## Publier sur GitHub Pages

1. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Pousse sur `main`. Le workflow `.github/workflows/pages.yml` valide les données puis publie le site.
3. Le site est servi à l'adresse `https://<utilisateur>.github.io/<dépôt>/`, par exemple <https://maximeclavel.github.io/SalesforceCertifications/>.

Les autres branches et les pull requests passent seulement par la validation (`.github/workflows/validate.yml`).

## Organisation

```
index.html                 catalogue des certifications
cert.html                  page de révision : cert.html?c=<id>&tab=<onglet>
assets/css/app.css         thème clair et sombre, composants partagés
assets/js/catalog.js       catalogue
assets/js/cert-app.js      onglets, navigation, liens internes
assets/js/views/           fiche, quiz, examen blanc, fiches mémo, recherche
assets/js/lib/             utilitaires, stockage local, chargement des données
certifications/catalog.json   liste et ordre des certifications
certifications/<id>/          données d'une certification
certifications/_template/     point de départ pour une nouvelle certification
tools/validate.mjs         contrôle des données (et --fix pour les compteurs)
tools/import-artifact.mjs  import d'une fiche au format « artefact »
docs/ajouter-une-certification.md   guide et format des données
```

## Ajouter une certification

Tout est décrit dans [docs/ajouter-une-certification.md](docs/ajouter-une-certification.md). En résumé : copier `certifications/_template/`, remplir `cert.json`, `quiz.json` et éventuellement `flashcards.json`, ajouter l'identifiant au catalogue, puis lancer `node tools/validate.mjs --fix`.
