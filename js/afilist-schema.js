// Afi-List: JSON с places и decors -> SVG (места, прямоугольники, подписи)
let afilistText = '';

function initAfilist() {
    setupDropzone('afilist-dropzone', 'afilist-file', readAfilistFile);
}

function readAfilistFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('afilist-json').value = e.target.result;
        const dz = document.getElementById('afilist-dropzone');
        dz.classList.add('active');
        dz.querySelector('p').textContent = 'Файл загружен';
        const name = document.getElementById('afilist-file-name');
        name.textContent = '✓ Загружен: ' + file.name;
        name.style.display = 'block';
    };
    reader.onerror = () => setStatus('Ошибка чтения файла', true);
    reader.readAsText(file);
}

function afilistRectCenter(rect) {
    const p = rect.params || {};
    return {
        cx: Number(rect.coord_x || 0) + Number(p.width || 0) / 2,
        cy: Number(rect.coord_y || 0) + Number(p.height || 0) / 2
    };
}

// Ближайший числовой текст к прямоугольнику
function afilistNearestNumericText(rect, texts) {
    const c = afilistRectCenter(rect);
    let best = null, bestDist = Infinity;
    texts.forEach(t => {
        if (!t.params || !/^\d+$/.test(String(t.params.text || ''))) return;
        const dx = Number(t.coord_x || 0) - c.cx;
        const dy = Number(t.coord_y || 0) - c.cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = t; }
    });
    return best;
}

function afilistBuild(data) {
    const places = Array.isArray(data.places) ? data.places : [];
    const decors = Array.isArray(data.decors) ? data.decors : [];
    const groups = [];
    const r = seatR(5);

    // Места: один общий сектор
    const seatParts = [];
    places.forEach(p => {
        if (p.coord_x == null || p.coord_y == null) return;
        const row = p.row != null && String(p.row).trim() !== '' ? String(p.row) : '-';
        const seat = p.seat != null && String(p.seat).trim() !== '' ? String(p.seat) : '-';
        seatParts.push('    <circle id="' + esc(fmtId(row, seat, false)) + '" cx="' + p.coord_x + '" cy="' + p.coord_y + '" r="' + r +
            '" fill="none" stroke="' + SEAT_STROKE + '" stroke-width="1" data-row="' + esc(row) + '" data-place="' + esc(seat) + '"/>');
    });
    if (seatParts.length) groups.push('  <g id="Места">\n' + seatParts.join('\n') + '\n  </g>');

    // Декоры: shape + text
    const shapes = decors.filter(d => d.type === 'shape');
    const texts = decors.filter(d => d.type === 'text');
    const shapeParts = [];
    const used = new Set();

    shapes.forEach(shape => {
        const p = shape.params || {};
        const x = Number(shape.coord_x || 0), y = Number(shape.coord_y || 0);
        const w = Number(p.width || 0), h = Number(p.height || 0), rad = Number(p.radius || 0);
        const color = p.color ? '#' + esc(p.color) : '#DDDDDD';
        shapeParts.push('    <rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rad + '" ry="' + rad +
            '" fill="' + color + '" stroke="#000000" stroke-width="1"/>');

        const nearest = afilistNearestNumericText(shape, texts);
        if (nearest) {
            used.add(nearest.id);
            const c = afilistRectCenter(shape);
            const size = Number((nearest.params && nearest.params.size) || 16);
            shapeParts.push('    <text x="' + c.cx + '" y="' + (c.cy + size / 3) + '" text-anchor="middle" font-family="Arial" font-size="' +
                size + '" fill="#000000">' + esc(nearest.params.text) + '</text>');
        }
    });
    if (shapeParts.length) groups.push('  <g id="Объекты">\n' + shapeParts.join('\n') + '\n  </g>');

    // Остальные подписи
    const textParts = [];
    texts.forEach(t => {
        if (used.has(t.id)) return;
        const p = t.params || {};
        if (!p.text) return;
        const size = Number(p.size || 16);
        const color = p.color ? '#' + esc(p.color) : '#000000';
        textParts.push('    <text x="' + Number(t.coord_x || 0) + '" y="' + Number(t.coord_y || 0) + '" font-family="Arial" font-size="' +
            size + '" fill="' + color + '">' + esc(p.text) + '</text>');
    });
    if (textParts.length) groups.push('  <g id="Подписи">\n' + textParts.join('\n') + '\n  </g>');

    return { groups, shapes, texts, places };
}

function processAfilist() {
    try {
        const text = document.getElementById('afilist-json').value.trim();
        if (!text) throw new Error('Вставьте JSON или загрузите файл');
        const data = extractJSON(text);
        if (!data.places && !data.decors) throw new Error('В JSON нет ни places, ни decors');

        const result = afilistBuild(data);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const expand = (x, y) => {
            if (!isFinite(x) || !isFinite(y)) return;
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        };
        (data.places || []).forEach(p => expand(Number(p.coord_x), Number(p.coord_y)));
        (data.decors || []).forEach(d => {
            const x = Number(d.coord_x || 0), y = Number(d.coord_y || 0);
            expand(x, y);
            if (d.type === 'shape' && d.params) expand(x + Number(d.params.width || 0), y + Number(d.params.height || 0));
        });
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 700; maxY = 900; }

        const pad = 20;
        const vbX = Math.floor(minX - pad), vbY = Math.floor(minY - pad);
        const vbW = Math.ceil(maxX - minX + pad * 2), vbH = Math.ceil(maxY - minY + pad * 2);

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH +
            '" width="' + vbW + '" height="' + vbH + '">\n' +
            '<rect x="' + vbX + '" y="' + vbY + '" width="' + vbW + '" height="' + vbH + '" fill="#FFFFFF"/>\n' +
            result.groups.join('\n') + '\n</svg>';

        showPreview(svg);
        setStatus('✓ Создано: ' + result.places.length + ' мест, ' + result.shapes.length + ' объектов');
        document.getElementById('afilist-download').style.display = 'block';
    } catch (e) {
        handleError(e);
    }
}

function downloadAfilist() { downloadCurrentResult('afilist-schema.svg'); }

function clearAfilist() {
    document.getElementById('afilist-json').value = '';
    document.getElementById('afilist-file').value = '';
    const dz = document.getElementById('afilist-dropzone');
    dz.classList.remove('active');
    dz.querySelector('p').textContent = 'Перетащите файл сюда';
    document.getElementById('afilist-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initAfilist);
