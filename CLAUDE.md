# Consignes pour ce dépôt

Site statique de révision de certifications, publié sur GitHub Pages. Aucune dépendance, aucune compilation.

- Une certification = un dossier `certifications/<id>/` + son identifiant dans `certifications/catalog.json`. Le format est décrit dans `docs/ajouter-une-certification.md` ; pars de `certifications/_template/`.
- Ne modifie pas le moteur (`cert.html`, `assets/`) pour ajouter une certification. Une particularité d'affichage passe par un CSS déclaré dans `styles` du `cert.json`.
- Après toute modification de données : `node tools/validate.mjs --fix`, puis vérifie le rendu avec `python3 -m http.server 8000`.
- Quand des réponses ou l'ordre des options changent dans `quiz.json` ou `exam.json`, incrémente `version` dans ce fichier.
- Textes de l'interface et explications en français. Les questions peuvent être en anglais (`language.questions: "en"`), au format des certifications : scénario, contrainte, consigne qui annonce le nombre de réponses.
- Les faits d'examen (durée, seuil, poids des domaines) viennent du guide officiel ; indique la date de vérification dans `verified`.
