// Модуль epol: JSON (objects) -> SVG
let epolData = null;

function initEpol() {
    setupDropzone('epol-dropzone', 'epol-file', readEpolFile);
}

function readEpolFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let text = String(e.target.result).trim();
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            epolData = JSON.parse(text);
            const dz = document.getElementById('epol-dropzone');
            dz.classList.add('active');
            dz.querySelector('p').textContent = file.name;
            const name = document.getElementById('epol-file-name');
            name.textContent = '✓ Загружен: ' + file.name;
            name.style.display = 'block';
        } catch (err) {
            epolData = null;
            setStatus('Ошибка JSON: ' + err.message, true);
        }
    };
    reader.onerror = () => setStatus('Ошибка чтения файла', true);
    reader.readAsText(file);
}

function epolExtractPlaces(data) {
    const places = [];
    if (!data || !Array.isArray(data.objects)) return places;
    data.objects.forEach(obj => {
        if (!obj || obj.type !== 'circle') return;
        if (obj.left === undefined || obj.top === undefined) return;
        if (obj.sequence_number === undefined || obj.sequence_number === null) return;
        const x = parseFloat(obj.left), y = parseFloat(obj.top);
        if (isNaN(x) || isNaN(y)) return;
        const hasRow = obj.row !== undefined && obj.row !== null && String(obj.row).trim() !== '' && String(obj.row) !== '_';
        places.push({
            row: hasRow ? String(obj.row).trim() : '-',
            seat: String(obj.sequence_number),
            x: x,
            y: y,
            section: obj.section || 'Без названия'
        });
    });
    return places;
}

function processEpol() {
    try {
        if (!epolData) throw new Error('Загрузите JSON-файл');
        const places = epolExtractPlaces(epolData);
        if (!places.length) throw new Error('Не найдено ни одного места (нужны objects[] с type="circle", left, top, sequence_number)');

        const r = seatR(12);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        places.forEach(p => {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        });

        const pad = 40, d = r * 2;
        const width = (maxX - minX) + d + pad * 2;
        const height = (maxY - minY) + d + pad * 2;
        const offX = pad - minX, offY = pad - minY;

        const groups = {};
        places.forEach(p => (groups[p.section] = groups[p.section] || []).push(p));
        const names = Object.keys(groups);

        let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">';
        svg += '<rect width="' + width + '" height="' + height + '" fill="white"/>';
        names.forEach(name => {
            svg += '<g id="' + esc(name) + '">';
            groups[name].forEach(p => {
                svg += '<circle id="' + esc(fmtId(p.row, p.seat, false)) + '" cx="' + (p.x + offX).toFixed(2) + '" cy="' + (p.y + offY).toFixed(2) +
                    '" r="' + r + '" fill="none" stroke="' + SEAT_STROKE + '" stroke-width="1"/>';
            });
            svg += '</g>';
        });
        svg += '</svg>';

        showPreview(svg);
        setStatus('✓ ' + places.length + ' мест, ' + names.length + ' секций, ' + Math.round(width) + '×' + Math.round(height) + ' px');
        document.getElementById('epol-download').style.display = 'block';
    } catch (e) {
        handleError(e);
    }
}

function downloadEpol() { downloadCurrentResult('epol.svg'); }

function clearEpol() {
    epolData = null;
    document.getElementById('epol-file').value = '';
    const dz = document.getElementById('epol-dropzone');
    dz.classList.remove('active');
    dz.querySelector('p').textContent = 'Загрузите JSON-файл';
    document.getElementById('epol-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initEpol);
