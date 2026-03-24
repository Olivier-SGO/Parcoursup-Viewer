'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let allGroups    = [];
let activeFilter = 'all';
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

function reset() {
    allGroups    = [];
    activeFilter = 'all';
    document.getElementById('pasteArea').value          = '';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('inputSection').hidden      = false;
    document.getElementById('resultsSection').hidden    = true;
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'all');
    });
}

function applyFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filter);
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
    if (saved.itemOrders) {
        for (const group of allGroups) {
            const order = saved.itemOrders[group.name];
            if (!order || !order.length) continue;
            group.items.sort((a, b) => {
                const ia = order.indexOf(itemKey(a));
                const ib = order.indexOf(itemKey(b));
                if (ia === -1 && ib === -1) return 0;
                if (ia === -1) return 1;
                if (ib === -1) return -1;
                return ia - ib;
            });
        }
    }
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
    const saved = storageLoad() || {};
    storageSave({ ...saved, groupOrder, itemOrders });
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function _showResults() {
    _renderResults();
    document.getElementById('inputSection').hidden   = false; // keep accessible for mobile back
    document.getElementById('inputSection').hidden   = true;
    document.getElementById('resultsSection').hidden = false;
}

function _renderResults() {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    for (const group of allGroups) {
        container.appendChild(_buildGroupSection(group));
    }

    makeSortable(container, '.group-section', '.drag-handle--group', _saveCurrentOrder);

    for (const list of container.querySelectorAll('.items-list')) {
        makeSortable(list, '.item', '.drag-handle--item', () => {
            _updateRanks(list.closest('.group-section'));
            _saveCurrentOrder();
        });
    }

    _applyFilterToDOM();
}

function _buildGroupSection(group) {
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
    group.items.forEach((item, i) => list.appendChild(_buildItem(item, i + 1)));
    section.appendChild(list);

    return section;
}

function _buildItem(item, rank) {
    const li = document.createElement('li');
    li.className        = 'item';
    li.dataset.status   = item.status || 'unknown';
    li.dataset.itemKey  = itemKey(item);

    const type = getFormationType(item.detail);
    if (type) li.dataset.type = type;

    li.appendChild(createGrip('drag-handle--item'));

    const rankEl = document.createElement('span');
    rankEl.className   = 'item-rank';
    rankEl.textContent = rank;
    li.appendChild(rankEl);

    const badge = document.createElement('span');
    if (item.status === 'confirmed') {
        badge.className   = 'status-badge confirmed';
        badge.textContent = '✓ Confirmé';
    } else if (item.status === 'incomplete') {
        badge.className   = 'status-badge incomplete';
        badge.textContent = '⚠ Incomplet';
    } else {
        badge.className   = 'status-badge unknown';
        badge.textContent = '— ?';
    }
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

function _applyFilterToDOM() {
    const container = document.getElementById('resultsContainer');
    for (const section of container.querySelectorAll('.group-section')) {
        let visible = 0;
        for (const item of section.querySelectorAll('.item')) {
            const show = activeFilter === 'all' || item.dataset.status === activeFilter;
            item.hidden = !show;
            if (show) visible++;
        }
        _updateRanks(section);
        section.hidden = visible === 0;
        section.querySelector('.item-count').textContent =
            `${visible} sous-vœu${visible > 1 ? 'x' : ''}`;
    }
}

function _updateRanks(section) {
    let r = 1;
    for (const item of section.querySelectorAll('.item')) {
        if (!item.hidden) item.querySelector('.item-rank').textContent = r++;
    }
}

// ── Drag-and-drop sortable (pointer events — desktop + iPad) ──────────────────

function makeSortable(container, childSel, handleSel, onReorder) {
    container.addEventListener('pointerdown', e => {
        const handle = e.target.closest(handleSel);
        if (!handle) return;
        const child = handle.closest(childSel);
        if (!child || child.parentElement !== container) return;

        e.preventDefault();
        child.classList.add('dragging');

        const ph = document.createElement(child.tagName === 'LI' ? 'li' : 'div');
        ph.className    = 'drag-placeholder';
        ph.style.height = child.getBoundingClientRect().height + 'px';
        child.after(ph);

        function onMove(ev) {
            ev.preventDefault();
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
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup',   onUp);
            document.removeEventListener('pointercancel', onUp);
            onReorder();
        }

        document.addEventListener('pointermove',   onMove);
        document.addEventListener('pointerup',     onUp);
        document.addEventListener('pointercancel', onUp);
    });
}
