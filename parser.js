'use strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if a line describes a formation/filière type.
 * These lines always start with a known education-type prefix.
 */
function isFormationLine(line) {
    return /^(Formation d[''']|BUT -|CPGE -|Licence -|Bachelor|Diplôme national de technologie)/.test(line);
}

// ── Block parser ─────────────────────────────────────────────────────────────

/**
 * Parse a contiguous block of lines belonging to a single vœu or sous-vœu.
 *
 * @param {string[]} lines  Trimmed, non-empty lines for this block.
 * @param {'voeu'|'sous-voeu'} type
 * @returns {{ kind, name, parentName, formation, status, subFormations }}
 */
function parseBlock(lines, type) {
    const firstLine = lines[0];
    const entry = {
        kind: type,
        name: '',
        parentName: '',
        formation: '',
        status: null,        // 'confirmed' | 'incomplete' | null
        subFormations: []    // [{ school, formation }]
    };

    if (type === 'sous-voeu') {
        const MARKER = 'Compte pour un sous-vœu du vœu';
        const markerIdx = firstLine.indexOf(MARKER);
        if (markerIdx >= 0) {
            entry.name = firstLine.slice(0, markerIdx).trim();
            entry.parentName = firstLine.slice(markerIdx + MARKER.length).trim();
        }
    } else {
        // type === 'voeu'
        const MARKER = 'Compte pour un vœu';
        const markerIdx = firstLine.indexOf(MARKER);
        entry.name = markerIdx >= 0 ? firstLine.slice(0, markerIdx).trim() : firstLine.trim();
    }

    let inDemandedSection = false;
    let i = 1;

    while (i < lines.length) {
        const line = lines[i];

        if (line === 'VŒU CONFIRMÉ') {
            entry.status = 'confirmed';

        } else if (line === 'DOSSIER INCOMPLET OU NON CONFIRMÉ') {
            entry.status = 'incomplete';

        } else if (line.startsWith('Établissements / Formations demandés qui ne décompte')) {
            inDemandedSection = true;
            i++;
            continue;

        } else if (
            line.startsWith('Établissements / Formations non demandés') ||
            line === 'Voir le détail'
        ) {
            inDemandedSection = false;

        } else if (inDemandedSection) {
            // Lines come in pairs: [school name] then [formation].
            // Formation lines are detected by their prefix.
            const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
            if (!isFormationLine(line) && isFormationLine(nextLine)) {
                entry.subFormations.push({ school: line, formation: nextLine });
                i += 2;
                continue;
            }
            // Otherwise fall through (skip orphaned / non-matching lines)

        } else if (!entry.formation && isFormationLine(line)) {
            // First formation line outside any sub-section = main formation for this entry
            entry.formation = line;
        }

        i++;
    }

    return entry;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Gather parsed raw entries into a structured list of groups:
 *   - { kind:'simple', name, formation, status, subFormations }
 *   - { kind:'multiple', name, sousVœux: [...rawEntry] }
 *
 * @param {Object[]} rawEntries
 * @returns {Object[]} groups
 */
function groupEntries(rawEntries) {
    const groups = [];
    const multipleMap = new Map(); // vœu name → multiple group

    for (const entry of rawEntries) {
        if (entry.kind === 'voeu') {
            if (entry.name.startsWith('Vœu multiple national')) {
                const group = { kind: 'multiple', name: entry.name, sousVœux: [] };
                groups.push(group);
                multipleMap.set(entry.name, group);
            } else {
                groups.push({
                    kind: 'simple',
                    name: entry.name,
                    formation: entry.formation,
                    status: entry.status,
                    subFormations: entry.subFormations
                });
            }
        } else if (entry.kind === 'sous-voeu') {
            let parent = multipleMap.get(entry.parentName);
            if (!parent) {
                // Parent vœu multiple wasn't explicitly listed — create it on the fly
                parent = { kind: 'multiple', name: entry.parentName, sousVœux: [] };
                groups.push(parent);
                multipleMap.set(entry.parentName, parent);
            }
            parent.sousVœux.push(entry);
        }
    }

    return groups;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse raw copy-pasted Parcoursup text into a list of vœu groups.
 *
 * @param {string} rawText
 * @returns {Object[]} groups  (see groupEntries for shape)
 */
function parseParcoursupText(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Locate the start of every vœu / sous-vœu entry
    const entryStarts = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check sous-vœu before vœu so the longer string takes priority
        if (line.includes('Compte pour un sous-vœu')) {
            entryStarts.push({ idx: i, type: 'sous-voeu' });
        } else if (line.includes('Compte pour un vœu')) {
            entryStarts.push({ idx: i, type: 'voeu' });
        }
    }

    if (entryStarts.length === 0) return [];

    // Slice lines into per-entry blocks and parse each
    const rawEntries = entryStarts.map((es, idx) => {
        const start = es.idx;
        const end = idx + 1 < entryStarts.length ? entryStarts[idx + 1].idx : lines.length;
        return parseBlock(lines.slice(start, end), es.type);
    });

    return groupEntries(rawEntries);
}

/**
 * Extract the leaf display items from a group.
 * Rules:
 *   - simple vœu with subFormations  → one item per sub-formation
 *   - simple vœu without             → the vœu itself
 *   - multiple vœu, sous-vœu has subFormations → one item per sub-formation
 *   - multiple vœu, sous-vœu has none           → the sous-vœu itself
 *
 * Each item: { name, detail, status }
 *
 * @param {Object} group
 * @returns {{ name: string, detail: string, status: string|null }[]}
 */
function extractDisplayItems(group) {
    if (group.kind === 'simple') {
        if (group.subFormations.length > 0) {
            return group.subFormations.map(sf => ({
                name: sf.school,
                detail: sf.formation,
                status: group.status
            }));
        }
        return [{ name: group.name, detail: group.formation, status: group.status }];
    }

    if (group.kind === 'multiple') {
        const items = [];
        for (const sv of group.sousVœux) {
            if (sv.subFormations.length > 0) {
                sv.subFormations.forEach(sf => items.push({
                    name: sf.school,
                    detail: sf.formation,
                    status: sv.status
                }));
            } else {
                items.push({
                    name: sv.name,
                    detail: sv.formation,
                    status: sv.status
                });
            }
        }
        return items;
    }

    return [];
}
