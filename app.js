'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let allGroups       = [];
let activeFilter    = 'all';
let activeTypeFilter = null;
const STORAGE_KEY = 'parcoursup_v1';

// ── Formation type ────────────────────────────────────────────────────────────

const TYPE_SLUGS = {
    'Ingénieur': 'ingenieur',
    'BUT':       'but',
    'CPGE':      'cpge',
    'Licence':   'licence',
    'Bachelor':  'bachelor',
    'DNT':       'dnt',
};

function getFormationType(detail) {
    if (!detail) return null;
    if (/^Formation d[''']/.test(detail)) return 'Ingénieur';
    if (detail.startsWith('BUT -'))    return 'BUT';
    if (detail.startsWith('CPGE -'))   return 'CPGE';
    if (detail.startsWith('Licence -')) return 'Licence';
    if (detail.startsWith('Bachelor')) return 'Bachelor';
    if (detail.startsWith('Diplôme national de technologie')) return 'DNT';
    return null;
}

// ── localStorage ──────────────────────────────────────────────────────────────

function storageSave(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

function storageLoad() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { return null; }
}

// ── Startup ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    const saved = storageLoad();
    if (saved && saved.text) {
        try {
            const parsed = parseParcoursupText(saved.text);
            if (parsed.length > 0) {
                prepareGroups(parsed);
                applyStoredOrder(saved);
                _showResults();
                return;
            }
        } catch (_) {}
    }
});

// ── Public actions ─────────────────────────────────────────────────────────────

function analyze() {
    const text = document.getElementById('pasteArea').value.trim();
    if (!text) {
        alert("Veuillez coller votre texte Parcoursup avant d'analyser.");
        return;
    }
    const parsed = parseParcoursupText(text);
    if (parsed.length === 0) {
        alert(
            'Aucun vœu détecté.\n\n' +
            "Assurez-vous d'avoir copié le texte depuis la page listant vos vœux " +
            '(la page doit contenir les mentions « Compte pour un vœu » ou « Compte pour un sous-vœu »).'
        );
        return;
    }
    prepareGroups(parsed);
    const saved = storageLoad();
    if (saved && saved.text === text) {
        applyStoredOrder(saved);
    } else {
        storageSave({ text });
    }
    _showResults();
}

// Retour au formulaire sans effacer la session sauvegardée
function reset() {
    allGroups        = [];
    activeFilter     = 'all';
    activeTypeFilter = null;
    document.getElementById('pasteArea').value            = '';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('inputSection').hidden        = false;
    document.getElementById('resultsSection').hidden      = true;
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'all');
    });
    const tb = document.getElementById('typeFilterBar');
    if (tb) tb.hidden = true;
}

// RAZ complète : efface la session persistée et revient à l'état initial
function clearAll() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    reset();
}

function applyFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filter);
    });
    _applyFilterToDOM();
}

function applyTypeFilter(type) {
    activeTypeFilter = type;
    document.querySelectorAll('#typeFilterBar .filter-btn').forEach(b => {
        b.classList.toggle('active', (b.dataset.type || null) === activeTypeFilter);
    });
    _applyFilterToDOM();
}

function exportRanking() {
    const container = document.getElementById('resultsContainer');
    const lines     = ['Parcoursup — Mon classement', ''];

    for (const section of container.querySelectorAll('.group-section:not([hidden])')) {
        lines.push('▸ ' + section.dataset.groupName);
        let rank = 1;
        for (const item of section.querySelectorAll('.item:not([hidden])')) {
            const name   = item.querySelector('.item-name').textContent;
            const detail = item.querySelector('.item-detail')  ? item.querySelector('.item-detail').textContent  : '';
            const type   = item.dataset.type ? ` [${item.dataset.type}]` : '';
            const status = item.dataset.status === 'confirmed'  ? '✓'
                         : item.dataset.status === 'incomplete' ? '⚠' : '?';
            lines.push(`  ${rank}. ${name}${type} ${status}`);
            if (detail) lines.push(`     ${detail}`);
            rank++;
        }
        lines.push('');
    }

    const text = lines.join('\n').trim();
    navigator.clipboard.writeText(text).then(() => {
        const btn  = document.querySelector('.btn-export');
        const orig = btn.textContent;
        btn.textContent = '✓ Copié !';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    }).catch(() => {
        prompt('Copiez ce texte :', text);
    });
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function prepareGroups(parsed) {
    allGroups = parsed
        .map(g => ({ name: g.name, items: extractDisplayItems(g) }))
        .filter(g => g.items.length > 0);
}

function itemKey(item) {
    return (item.name + '||' + (item.detail || '')).slice(0, 200);
}

function applyStoredOrder(saved) {
    // 1. Ordre des groupes
    if (saved.groupOrder && saved.groupOrder.length) {
        allGroups.sort((a, b) => {
            const ia = saved.groupOrder.indexOf(a.name);
            const ib = saved.groupOrder.indexOf(b.name);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }

    if (!saved.itemOrders) return;

    // 2. Table de tous les items (clé → {item, groupe d'origine})
    const itemMap = {};
    for (const group of allGroups) {
        for (const item of group.items) {
            itemMap[itemKey(item)] = { item, originGroup: group.name };
        }
    }

    // 3. Vider les listes, puis les repeupler selon l'ordre sauvegardé
    //    (un item peut avoir été déplacé dans un autre groupe)
    for (const group of allGroups) group.items = [];

    const placed = new Set();
    for (const group of allGroups) {
        const order = saved.itemOrders[group.name] || [];
        for (const k of order) {
            if (itemMap[k]) {
                group.items.push(itemMap[k].item);
                placed.add(k);
            }
        }
    }

    // 4. Ré-insérer les items absents de la sauvegarde dans leur groupe d'origine
    for (const [k, { item, originGroup }] of Object.entries(itemMap)) {
        if (!placed.has(k)) {
            const g = allGroups.find(g => g.name === originGroup);
            if (g) g.items.push(item);
        }
    }

    // 5. Supprimer les groupes vidés (dissous par un déplacement inter-groupes)
    allGroups.splice(0, allGroups.length, ...allGroups.filter(g => g.items.length > 0));
}

function _saveCurrentOrder() {
    const container  = document.getElementById('resultsContainer');
    const groupOrder = [...container.querySelectorAll('.group-section')]
        .map(el => el.dataset.groupName);
    const itemOrders = {};
    for (const section of container.querySelectorAll('.group-section')) {
        itemOrders[section.dataset.groupName] = [...section.querySelectorAll('.item')]
            .map(el => el.dataset.itemKey);
    }
    const headlessGroups = [...container.querySelectorAll('.group-section--headless')]
        .map(el => el.dataset.groupName);
    const saved = storageLoad() || {};
    storageSave({ ...saved, groupOrder, itemOrders, headlessGroups });
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function _showResults() {
    _renderResults();
    document.getElementById('inputSection').hidden   = true;
    document.getElementById('resultsSection').hidden = false;
}

function _renderResults() {
    const container      = document.getElementById('resultsContainer');
    container.innerHTML  = '';

    const saved          = storageLoad();
    const overrides      = (saved && saved.statusOverrides) ? saved.statusOverrides : {};
    const headlessGroups = (saved && saved.headlessGroups)  ? saved.headlessGroups  : [];

    for (const group of allGroups) {
        const sec = _buildGroupSection(group, overrides);
        if (headlessGroups.includes(group.name)) {
            sec.querySelector('.group-header').hidden = true;
            sec.classList.add('group-section--headless');
        }
        container.appendChild(sec);
    }

    // Drag groupes (réordonner les blocs)
    makeSortable(container, '.group-section', '.drag-handle--group', _saveCurrentOrder);

    // Drag items : zone globale — permet le déplacement ENTRE groupes
    makeItemsSortable(container, _saveCurrentOrder);

    _populateTypeFilter();
    _applyFilterToDOM();
}

function _buildGroupSection(group, overrides) {
    const section = document.createElement('div');
    section.className       = 'group-section';
    section.dataset.groupName = group.name;

    const header  = document.createElement('div');
    header.className = 'group-header';

    header.appendChild(createGrip('drag-handle--group'));

    const nameEl = document.createElement('span');
    nameEl.className   = 'group-name';
    nameEl.textContent = group.name;

    const countEl = document.createElement('span');
    countEl.className = 'item-count';

    header.appendChild(nameEl);
    header.appendChild(countEl);
    section.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'items-list';
    group.items.forEach((item, i) => list.appendChild(_buildItem(item, i + 1, overrides)));
    section.appendChild(list);

    return section;
}

function _buildItem(item, rank, overrides) {
    const li = document.createElement('li');
    li.className       = 'item';
    li.dataset.itemKey = itemKey(item);

    const status = (overrides && overrides[itemKey(item)]) || item.status || 'unknown';
    li.dataset.status = status;

    const type = getFormationType(item.detail);
    if (type) li.dataset.type = type;

    li.appendChild(createGrip('drag-handle--item'));

    const rankEl = document.createElement('span');
    rankEl.className   = 'item-rank';
    rankEl.textContent = rank;
    li.appendChild(rankEl);

    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.title     = 'Cliquer pour modifier le statut';
    _applyStatusToBadge(badge, status);
    badge.addEventListener('click', () => _cycleStatus(li));
    li.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'item-content';

    const nameRow = document.createElement('div');
    nameRow.className = 'item-name-row';

    const nameEl = document.createElement('span');
    nameEl.className   = 'item-name';
    nameEl.textContent = item.name;
    nameRow.appendChild(nameEl);

    if (type) {
        const typeEl = document.createElement('span');
        typeEl.className   = 'type-badge ' + (TYPE_SLUGS[type] || 'other');
        typeEl.textContent = type;
        nameRow.appendChild(typeEl);
    }

    content.appendChild(nameRow);

    if (item.detail) {
        const detailEl = document.createElement('div');
        detailEl.className   = 'item-detail';
        detailEl.textContent = item.detail;
        content.appendChild(detailEl);
    }

    li.appendChild(content);
    return li;
}

function createGrip(extraClass) {
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width',   '10');
    svg.setAttribute('height',  '16');
    svg.setAttribute('viewBox', '0 0 10 16');
    svg.setAttribute('fill',    'currentColor');
    svg.setAttribute('aria-hidden', 'true');

    for (const [cx, cy] of [[3,3],[7,3],[3,8],[7,8],[3,13],[7,13]]) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', cx);
        c.setAttribute('cy', cy);
        c.setAttribute('r',  '1.5');
        svg.appendChild(c);
    }

    const span = document.createElement('span');
    span.className = 'drag-handle ' + extraClass;
    span.title     = extraClass.includes('group') ? 'Déplacer ce groupe' : 'Déplacer';
    span.appendChild(svg);
    return span;
}

// ── Filter ────────────────────────────────────────────────────────────────────

function _populateTypeFilter() {
    const typeBar = document.getElementById('typeFilterBar');
    if (!typeBar) return;

    const types = [...new Set(
        allGroups.flatMap(g => g.items)
            .map(i => getFormationType(i.detail))
            .filter(Boolean)
    )];

    if (types.length < 2) { typeBar.hidden = true; return; }

    typeBar.hidden   = false;
    typeBar.innerHTML = '<span class="filter-label">Type :</span>';

    const allBtn = document.createElement('button');
    allBtn.className   = 'filter-btn' + (activeTypeFilter === null ? ' active' : '');
    allBtn.dataset.type = '';
    allBtn.textContent  = 'Tous';
    allBtn.onclick = () => applyTypeFilter(null);
    typeBar.appendChild(allBtn);

    for (const type of types) {
        const slug = TYPE_SLUGS[type] || '';
        const btn  = document.createElement('button');
        btn.className   = `filter-btn filter-btn--type ${slug}${activeTypeFilter === type ? ' active' : ''}`;
        btn.dataset.type = type;
        btn.textContent  = type;
        btn.onclick = () => applyTypeFilter(type);
        typeBar.appendChild(btn);
    }
}

function _applyFilterToDOM() {
    const container = document.getElementById('resultsContainer');
    for (const section of container.querySelectorAll('.group-section')) {
        let visible = 0;
        for (const item of section.querySelectorAll('.item')) {
            const statusOk = activeFilter === 'all' || item.dataset.status === activeFilter;
            const typeOk   = !activeTypeFilter || item.dataset.type === activeTypeFilter;
            item.hidden    = !(statusOk && typeOk);
            if (!item.hidden) visible++;
        }
        _updateRanks(section);
        section.hidden = visible === 0;
        const countEl  = section.querySelector('.item-count');
        if (countEl) countEl.textContent = `${visible} sous-vœu${visible > 1 ? 'x' : ''}`;
    }
}

function _updateRanks(section) {
    let r = 1;
    for (const item of section.querySelectorAll('.item')) {
        if (!item.hidden) item.querySelector('.item-rank').textContent = r++;
    }
}

// ── Status override ───────────────────────────────────────────────────────────

const STATUS_CYCLE = ['confirmed', 'incomplete', 'unknown'];

function _applyStatusToBadge(badge, status) {
    badge.className = 'status-badge ' + status;
    badge.textContent = status === 'confirmed'  ? '✓ Confirmé'
                      : status === 'incomplete' ? '⚠ Incomplet'
                      :                           '— ?';
}

function _cycleStatus(li) {
    const current = li.dataset.status;
    const next    = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];

    li.dataset.status = next;
    _applyStatusToBadge(li.querySelector('.status-badge'), next);

    const saved     = storageLoad() || {};
    const overrides = saved.statusOverrides || {};
    overrides[li.dataset.itemKey] = next;
    storageSave({ ...saved, statusOverrides: overrides });

    _applyFilterToDOM();
}

// ── Dissolution de groupes ────────────────────────────────────────────────────

// Quand un item quitte son groupe d'origine : fusionne les deux sections en
// supprimant leur entête, de façon à obtenir une liste plate sans groupe.
function _mergeGroupSections(srcSection, dstSection) {
    // Quelle section est au-dessus dans le DOM ?
    const isSrcFirst = !!(srcSection.compareDocumentPosition(dstSection) & Node.DOCUMENT_POSITION_FOLLOWING);
    const [topSec, botSec] = isSrcFirst ? [srcSection, dstSection] : [dstSection, srcSection];

    // Déplacer les items de la section du bas dans celle du haut
    const list     = topSec.querySelector('.items-list');
    const botItems = [...botSec.querySelectorAll('.item')];
    botItems.forEach(item => list.appendChild(item));

    // Marquer la section résultante comme "sans entête"
    topSec.querySelector('.group-header').hidden = true;
    topSec.classList.add('group-section--headless');

    // Supprimer la section vidée
    botSec.remove();
}

// ── Drag-and-drop sortable (pointer events — desktop + iPad) ──────────────────
//
// Règles clés :
//   • PAS de preventDefault() sur pointerdown → évite pointercancel immédiat sur iOS
//   • setPointerCapture sur l'élément déplacé → tous les events restent sur lui
//   • preventDefault() uniquement dans pointermove { passive:false } → bloque le scroll

// Drag items cross-groupes : un item peut être déposé dans n'importe quel groupe.
function makeItemsSortable(resultsContainer, onReorder) {
    resultsContainer.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.drag-handle--item');
        if (!handle) return;
        const child = handle.closest('.item');
        if (!child) return;

        child.classList.add('dragging');
        document.body.style.userSelect = 'none';

        const ph = document.createElement('li');
        ph.className    = 'drag-placeholder';
        ph.style.height = child.getBoundingClientRect().height + 'px';
        child.after(ph);

        const srcSection = child.closest('.group-section');
        child.setPointerCapture(e.pointerId);

        // Retourne la .items-list du groupe sous le pointeur (Y)
        function getTargetList(y) {
            const sections = [...resultsContainer.querySelectorAll('.group-section:not([hidden])')];
            if (!sections.length) return null;
            for (const sec of sections) {
                if (y < sec.getBoundingClientRect().bottom) {
                    return sec.querySelector('.items-list');
                }
            }
            return sections[sections.length - 1].querySelector('.items-list');
        }

        function onMove(ev) {
            ev.preventDefault();
            const targetList = getTargetList(ev.clientY) || ph.parentElement;
            const siblings = [...targetList.children]
                .filter(c => c !== child && c !== ph && !c.hidden);
            let placed = false;
            for (const sib of siblings) {
                const r = sib.getBoundingClientRect();
                if (ev.clientY < r.top + r.height / 2) {
                    targetList.insertBefore(ph, sib);
                    placed = true;
                    break;
                }
            }
            if (!placed) targetList.appendChild(ph);
        }

        function onUp() {
            ph.replaceWith(child);
            child.classList.remove('dragging');
            document.body.style.userSelect = '';
            child.removeEventListener('pointermove',   onMove);
            child.removeEventListener('pointerup',     onUp);
            child.removeEventListener('pointercancel', onUp);

            // Si l'item a changé de groupe → dissoudre les deux blocs
            const dstSection = child.closest('.group-section');
            if (dstSection && dstSection !== srcSection) {
                _mergeGroupSections(srcSection, dstSection);
            }

            _applyFilterToDOM();
            onReorder();
        }

        child.addEventListener('pointermove',   onMove, { passive: false });
        child.addEventListener('pointerup',     onUp);
        child.addEventListener('pointercancel', onUp);
    });
}

function makeSortable(container, childSel, handleSel, onReorder) {
    container.addEventListener('pointerdown', e => {
        const handle = e.target.closest(handleSel);
        if (!handle) return;
        const child = handle.closest(childSel);
        if (!child || child.parentElement !== container) return;

        child.classList.add('dragging');
        document.body.style.userSelect = 'none';

        const ph = document.createElement(child.tagName === 'LI' ? 'li' : 'div');
        ph.className    = 'drag-placeholder';
        ph.style.height = child.getBoundingClientRect().height + 'px';
        child.after(ph);

        // Capture : tous les pointermove/pointerup suivants arrivent sur child
        child.setPointerCapture(e.pointerId);

        function onMove(ev) {
            ev.preventDefault(); // bloque le scroll pendant le déplacement
            const siblings = [...container.children]
                .filter(c => c !== child && c !== ph && !c.hidden);
            let placed = false;
            for (const sib of siblings) {
                const r = sib.getBoundingClientRect();
                if (ev.clientY < r.top + r.height / 2) {
                    container.insertBefore(ph, sib);
                    placed = true;
                    break;
                }
            }
            if (!placed) container.appendChild(ph);
        }

        function onUp() {
            ph.replaceWith(child);
            child.classList.remove('dragging');
            document.body.style.userSelect = '';
            child.removeEventListener('pointermove',   onMove);
            child.removeEventListener('pointerup',     onUp);
            child.removeEventListener('pointercancel', onUp);
            onReorder();
        }

        child.addEventListener('pointermove',   onMove, { passive: false });
        child.addEventListener('pointerup',     onUp);
        child.addEventListener('pointercancel', onUp);
    });
}
