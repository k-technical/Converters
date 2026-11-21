let yaSvgContent = '';

function initYa() {
    setupDropzone('ya-dropzone', 'ya-file', readYaFile);
}

function readYaFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        yaSvgContent = e.target.result;
        const dropzone = document.getElementById('ya-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = 'Файл загружен';
        const fileName = document.getElementById('ya-file-name');
        fileName.textContent = '✓ Загружен: ' + file.name;
        fileName.style.display = 'block';
    };
    reader.onerror = () => setStatus('Ошибка чтения файла', true);
    reader.readAsText(file);
}

function yaCleanGroupName(name) {
    if (!name) return 'Без имени';
    return name.replace(/[,&\-+()]/g, '').trim();
}

function yaBuildGroups(data) {
    const groups = [];
    if (!data.levels || !Array.isArray(data.levels)) return groups;
    const r = seatR(5);

    data.levels.forEach(level => {
        const content = [];
        const groupName = yaCleanGroupName(level.name);

        if (level.outline) {
            content.push('    <path id="Контур_1" d="' + esc(level.outline) + '" fill="none" stroke="#000000" stroke-width="1"/>');
        }
        if (level.sections) {
            level.sections.forEach(section => {
                if (section.outline) {
                    content.push('    <path id="Контур_1" d="' + esc(section.outline) + '" fill="none" stroke="#000000" stroke-width="1"/>');
                }
            });
        }
        if (level.seats) {
            level.seats.forEach(seat => {
                if (seat.x_coord != null && seat.y_coord != null && seat.place != null) {
                    const row = (seat.row != null && String(seat.row).trim() !== '') ? String(seat.row).trim() : '-';
                    const placeId = fmtId(row, seat.place, false);
                    content.push('    <circle id="' + esc(placeId) + '" cx="' + seat.x_coord + '" cy="' + seat.y_coord + '" r="' + r +
                        '" fill="none" stroke="' + SEAT_STROKE + '" stroke-width="1" data-row="' + esc(row) + '" data-place="' + esc(seat.place) + '"/>');
                }
            });
        }
        if (content.length > 0) {
            groups.push('  <g id="' + esc(groupName) + '">\n' + content.join('\n') + '\n  </g>');
        }
    });
    return groups;
}

function yaMerge() {
    const jsonText = document.getElementById('ya-json').value.trim();
    if (!yaSvgContent) throw new Error('Загрузите файл с подложкой');
    if (!jsonText) throw new Error('Вставьте JSON с местами');

    parseSVG(yaSvgContent);

    const parsed = extractJSON(jsonText);
    let data = parsed;
    if (parsed.result && typeof parsed.result === 'string') {
        data = JSON.parse(parsed.result);
    } else if (parsed.result && typeof parsed.result === 'object') {
        data = parsed.result;
    }
    if (!data.levels) throw new Error('В JSON нет поля "levels"');

    const groups = yaBuildGroups(data);
    const end = yaSvgContent.lastIndexOf('</svg>');
    if (end < 0) throw new Error('В файле подложки нет закрывающего </svg>');

    const svg = yaSvgContent.slice(0, end)
        + '\n  <g id="tables-from-json">\n' + groups.join('\n') + '\n  </g>\n</svg>';
    return { svg, groupsCount: groups.length };
}

function processYa() {
    try {
        const result = yaMerge();
        let finalSvg = result.svg;
        const shouldRotate = document.getElementById('ya-rotate').checked;
        if (shouldRotate) finalSvg = rotateSVG(finalSvg);

        showPreview(finalSvg);
        setStatus('✓ Объединено: ' + result.groupsCount + ' групп' + (shouldRotate ? ' (развёрнуто на 180°)' : ''));
        document.getElementById('ya-download').style.display = 'block';
    } catch (e) {
        handleError(e);
    }
}

// Переключатель поворота: пересобираем только если уже есть данные
function yaRotateChanged() {
    if (yaSvgContent && document.getElementById('ya-json').value.trim()) processYa();
}

function rotateSVG(svgString) {
    const doc = parseSVG(svgString);
    const svg = doc.documentElement;

    const vb = parseViewBox(svg.getAttribute('viewBox'));
    let cx, cy;
    if (vb) {
        cx = vb[0] + vb[2] / 2;
        cy = vb[1] + vb[3] / 2;
    } else {
        cx = (parseFloat(svg.getAttribute('width')) || 1000) / 2;
        cy = (parseFloat(svg.getAttribute('height')) || 1000) / 2;
    }

    const content = document.createDocumentFragment();
    while (svg.firstChild) content.appendChild(svg.firstChild);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    g.appendChild(content);
    svg.appendChild(g);

    return serializeSVG(doc);
}

function downloadYa() {
    downloadCurrentResult('ya-schema2-merged.svg');
}

function clearYa() {
    yaSvgContent = '';
    document.getElementById('ya-json').value = '';
    document.getElementById('ya-file').value = '';
    document.getElementById('ya-rotate').checked = false;
    const dropzone = document.getElementById('ya-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите файл с подложкой сюда';
    document.getElementById('ya-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initYa);
