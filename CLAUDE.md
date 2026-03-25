# Parcoursup Viewer — contexte projet

## Objectif
Page web statique (vanilla HTML/CSS/JS, sans framework ni build) permettant à un élève de coller le texte copié depuis sa page Parcoursup et de visualiser, classer et annoter ses **sous-vœux** (les formations individuelles), groupés par vœu parent.

## Branche de développement
`claude/training-choice-organizer-MhJTJ`
Remote : `origin` (GitHub — repo `olivier-sgo/parcoursup-viewer`)

## Structure des fichiers

```
index.html   – page principale : textarea de saisie + zone de résultats
style.css    – styles (CSS custom properties, responsive)
parser.js    – logique de parsing du texte Parcoursup brut
app.js       – logique UI (analyze(), reset(), clearAll(), rendu DOM, drag, filtres, export)
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

## Logique UI (`app.js`)

### État global
- `allGroups[]` — groupes préparés `{ name, items: [{name, detail, status}] }`
- `activeFilter` — `'all'` | `'confirmed'` | `'incomplete'`
- `STORAGE_KEY` — clé localStorage `'parcoursup_v1'`

### Actions publiques (appelées depuis le HTML)
- `analyze()` — parse le texte collé, restaure l'ordre/statuts sauvegardés si même texte
- `reset()` — retour au formulaire **sans** effacer le localStorage (session conservée)
- `clearAll()` — RAZ complète : efface le localStorage puis appelle `reset()`
- `applyFilter(filter)` — filtre l'affichage par statut
- `exportRanking()` — copie le classement formaté dans le presse-papiers

### Persistance localStorage
Structure sauvegardée :
```json
{
  "text": "texte brut collé",
  "groupOrder": ["Nom groupe 1", "Nom groupe 2", ...],
  "itemOrders": { "Nom groupe": ["clé1", "clé2", ...] },
  "statusOverrides": { "clé item": "confirmed|incomplete|unknown" },
  "chanceOverrides": { "clé item": "sure|probable|unlikely" },
  "notes": { "clé item": "texte libre" }
}
```
- Restauration automatique au chargement de la page (DOMContentLoaded)
- `← Modifier le texte` : retour formulaire sans perte
- `Effacer` (RAZ) : supprime la clé localStorage

### Drag-and-drop
Implémenté via pointer events (desktop + iPad) dans `makeSortable(container, childSel, handleSel, onReorder)`.
- Poignée groupe (`.drag-handle--group`) → réordonne les `.group-section` dans `#resultsContainer`
- Poignée item (`.drag-handle--item`) → réordonne les `.item` dans chaque `.items-list`

### Statuts modifiables
Clic sur le badge de statut → cycle `confirmed → incomplete → unknown → confirmed`.
L'override est sauvegardé immédiatement dans `statusOverrides` du localStorage.

### Probabilité d'admission
Trait coloré de 6px sur le bord gauche de chaque carte, cliquable pour cycler :
`'' → 'sure' (vert) → 'probable' (ambre) → 'unlikely' (rouge) → ''`
L'override est sauvegardé dans `chanceOverrides` du localStorage.
Inclus dans le snapshot, le sync cloud et l'export texte (🟢/🟡/🔴).

### Notes personnelles
Champ `contenteditable` sous le nom de chaque item. Sauvegardé dans `notes` du localStorage.

### Type de formation
`getFormationType(detail)` détecte depuis le champ `detail` :
| Préfixe détecté | Badge | Classe CSS |
|---|---|---|
| `Formation d'` | Ingénieur | `ingenieur` |
| `BUT -` | BUT | `but` |
| `CPGE -` | CPGE | `cpge` |
| `Licence -` | Licence | `licence` |
| `Bachelor` | Bachelor | `bachelor` |
| `Diplôme national de technologie` | DNT | `dnt` |

## Fonctionnalités implémentées
- [x] Drag-and-drop pour classer les sous-vœux par ordre de préférence
- [x] Export du classement (copie texte presse-papiers)
- [x] Affichage du type de formation (CPGE / BUT / Ingénieur / Licence…)
- [x] Filtres par statut (confirmé / incomplet)
- [x] Persistance dans localStorage (texte, ordre, statuts)
- [x] Statut modifiable manuellement (clic sur le badge)
- [x] Bouton RAZ (efface la session persistée)
- [x] Indicateur de probabilité d'admission (trait coloré gauche, 3 niveaux + non défini)
- [x] Notes personnelles par item (champ éditable)
- [x] Synchronisation cloud en direct (GitHub Gist ou JSONBlob, lien partageable)

## Pistes d'évolution
- [ ] Export CSV
- [ ] Numéro de rang global (tous groupes confondus) en plus du rang par groupe
- [ ] Indicateur visuel "session sauvegardée" sur la page d'accueil
