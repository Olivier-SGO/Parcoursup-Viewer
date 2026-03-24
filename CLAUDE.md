# Parcoursup Viewer — contexte projet

## Objectif
Page web statique (vanilla HTML/CSS/JS, sans framework ni build) permettant à un élève de coller le texte copié depuis sa page Parcoursup et de visualiser uniquement ses **sous-vœux** (les formations individuelles), groupés par vœu parent, avec leur statut (confirmé / dossier incomplet).

## Branche de développement
`claude/training-choice-organizer-MhJTJ`
Remote : `origin` (GitHub — repo `olivier-sgo/parcoursup-viewer`)

## Structure des fichiers

```
index.html   – page principale : textarea de saisie + zone de résultats
style.css    – styles (CSS custom properties, responsive)
parser.js    – logique de parsing du texte Parcoursup brut
app.js       – logique UI (analyze(), reset(), rendu DOM)
CLAUDE.md    – ce fichier
```

## Format des données Parcoursup (texte copié-collé)

Le texte copié depuis Parcoursup contient deux types d'entrées reconnaissables à des marqueurs textuels :

### Vœu simple (concours ou licence)
```
[Nom du vœu] Compte pour un vœu
[Formation principale]
...
VŒU CONFIRMÉ  |  DOSSIER INCOMPLET OU NON CONFIRMÉ
...
Établissements / Formations demandés qui ne décompte(nt) pas de sous-voeu
[École 1]
[Formation 1]
[École 2]
[Formation 2]
...
Établissements / Formations non demandés qui ne décompte(nt) pas de sous-voeu
...
Voir le détail
```
→ Les sous-vœux à afficher = chaque paire (École / Formation) de la section "demandés".

### Vœu multiple national (BUT, CPGE, etc.)
```
Vœu multiple national : [Filière] Compte pour un vœu
[Lycée/IUT 1] Compte pour un sous-vœu du vœu Vœu multiple national : [Filière]
[Formation]
...
VŒU CONFIRMÉ  |  DOSSIER INCOMPLET OU NON CONFIRMÉ
...
Établissements / Formations demandés qui ne décompte(nt) pas de sous-voeu   ← optionnel
[Même lycée (Toulouse - 31)]
CPGE - PTSI - Sans Internat
[Même lycée (Toulouse - 31)]
CPGE - PTSI - Avec Internat
Voir le détail
[Lycée/IUT 2] Compte pour un sous-vœu du vœu ...
...
```
→ Si le sous-vœu a des sub-formations (avec/sans internat) : afficher celles-ci.
→ Sinon : afficher le sous-vœu lui-même (lycée/IUT + formation).

### Lignes formation reconnues (`isFormationLine`)
Commence par : `Formation d'`, `BUT -`, `CPGE -`, `Licence -`, `Bachelor`, `Diplôme national de technologie`

## Logique de parsing (`parser.js`)

1. `parseParcoursupText(rawText)` — point d'entrée public
   - Split en lignes, trim, filtre vides
   - Repère les positions de chaque entrée ("Compte pour un sous-vœu" avant "Compte pour un vœu")
   - Découpe en blocs et appelle `parseBlock()`
   - Appelle `groupEntries()` pour regrouper

2. `parseBlock(lines, type)` → `{ kind, name, parentName, formation, status, subFormations }`
   - Extrait nom / parentName depuis la première ligne
   - Parcourt le bloc : status, sections "demandés" (paires école+formation)

3. `groupEntries(rawEntries)` → liste de groupes
   - `kind:'simple'` : vœux simples
   - `kind:'multiple'` : vœux multiples avec `sousVœux[]`

4. `extractDisplayItems(group)` → `[{ name, detail, status }]`
   - Règle : toujours renvoyer les feuilles (sub-formations si présentes, sinon l'entrée elle-même)

## Prochaines étapes possibles
- [ ] Drag-and-drop pour classer les sous-vœux par ordre de préférence
- [ ] Export du classement (CSV ou copie texte)
- [ ] Affichage du type de formation (CPGE / BUT / Ingénieur / Licence)
- [ ] Filtres par statut (confirmé / incomplet)
- [ ] Persistance dans localStorage
