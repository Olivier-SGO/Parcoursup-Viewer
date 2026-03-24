'use strict';

// ── Entry point ───────────────────────────────────────────────────────────────

function analyze() {
    const text = document.getElementById('pasteArea').value.trim();
    if (!text) {
        alert('Veuillez coller votre texte Parcoursup avant d\'analyser.');
        return;
    }

    const groups = parseParcoursupText(text);

    if (groups.length === 0) {
        alert(
            'Aucun vœu détecté.\n\n' +
            'Assurez-vous d\'avoir copié le texte depuis la page listant vos vœux Parcoursup ' +
            '(la page doit contenir les mentions « Compte pour un vœu » ou « Compte pour un sous-vœu »).'
        );
        return;
    }

    renderResults(groups);
    document.getElementById('inputSection').hidden = true;
    document.getElementById('resultsSection').hidden = false;
}

function reset() {
    document.getElementById('inputSection').hidden = false;
    document.getElementById('resultsSection').hidden = true;
    document.getElementById('resultsContainer').innerHTML = '';
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderResults(groups) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    for (const group of groups) {
        const items = extractDisplayItems(group);
        if (items.length === 0) continue;

        container.appendChild(buildGroupSection(group.name, items));
    }
}

function buildGroupSection(groupName, items) {
    const section = document.createElement('div');
    section.className = 'group-section';

    // Header
    const header = document.createElement('div');
    header.className = 'group-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'group-name';
    nameEl.textContent = groupName;

    const countEl = document.createElement('span');
    countEl.className = 'item-count';
    countEl.textContent = `${items.length} sous-vœu${items.length > 1 ? 'x' : ''}`;

    header.appendChild(nameEl);
    header.appendChild(countEl);
    section.appendChild(header);

    // Item list
    const list = document.createElement('ul');
    list.className = 'items-list';

    for (const item of items) {
        list.appendChild(buildItem(item));
    }

    section.appendChild(list);
    return section;
}

function buildItem(item) {
    const li = document.createElement('li');
    li.className = 'item';

    // Status badge
    const badge = document.createElement('span');
    if (item.status === 'confirmed') {
        badge.className = 'status-badge confirmed';
        badge.textContent = '✓ Confirmé';
    } else if (item.status === 'incomplete') {
        badge.className = 'status-badge incomplete';
        badge.textContent = '⚠ Incomplet';
    } else {
        badge.className = 'status-badge unknown';
        badge.textContent = '— ?';
    }

    // Text content
    const content = document.createElement('div');
    content.className = 'item-content';

    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;
    content.appendChild(nameEl);

    if (item.detail) {
        const detailEl = document.createElement('div');
        detailEl.className = 'item-detail';
        detailEl.textContent = item.detail;
        content.appendChild(detailEl);
    }

    li.appendChild(badge);
    li.appendChild(content);
    return li;
}
