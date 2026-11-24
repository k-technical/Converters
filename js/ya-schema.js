// Модуль ya: JSON (levels) + подложка -> SVG
let yaSvgContent = '';

function initYa() {
    setupDropzone('ya-dropzone', 'ya-file', readYaFiles, true);
}

// Принимает один или два файла сразу: JSON с levels и подложку определяются по содержимому
async function readYaFiles(files) {
    const names = [];
    for (const file of files) {
        const text = await file.text();
        const t = text.replace(/^\uFEFF/, '').trim();
        if (/<svg[\s>]/i.test(t.slice(0, 2000))) {
            yaSvgContent = t;
            names.push('подложка: ' + file.name);
        } else if (t[0] === '{' || t[0] === '[' || t[0] === '"') {
            document.getElementById('ya-json').value = t;
            names.push('JSON: ' + file.name);
        } else {
            setStatus('Не удалось определить файл «' + file.name + '» (нужен JSON или SVG)', true);
        }
    }
    if (!names.length) return;
    yaMarkLoaded(names);
    // Есть оба файла: сразу конвертируем
    if (yaSvgContent && document.getElementById('ya-json').value.trim()) processYa();
}

function yaMarkLoaded(names) {
    const dz = document.getElementById('ya-dropzone');
    dz.classList.add('active');
    dz.querySelector('p').textContent = 'Файлы загружены';
    const label = document.getElementById('ya-file-name');
    label.textContent = '✓ ' + names.join(' | ');
    label.style.display = 'block';
}

// ---- Автозагрузка по ссылке (нужен скрипт-помощник) ----
let yaWin = null;

function yaOpenWidget() {
    const url = document.getElementById('ya-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку (начинается с https://)', true); return; }
    yaWin = window.open(url, '_blank');
    if (!yaWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    setStatus('Жду данные… (должен работать скрипт-помощник)');
}

function yaApplyBundle(d) {
    if (!d || typeof d.json !== 'string' || typeof d.svg !== 'string') { setStatus('Неверный формат данных от помощника', true); return; }
    document.getElementById('ya-json').value = d.json;
    yaSvgContent = d.svg;
    yaMarkLoaded(['JSON: со страницы', 'подложка: со страницы']);
    processYa();
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'ya-schema-files') return;
    if (!yaWin || e.source !== yaWin) return; // только от окна, открытого кнопкой
    yaApplyBundle(d);
    try { yaWin.close(); } catch (err) { /* окно можно закрыть вручную */ }
});

async function yaPasteBundle() {
    try {
        const d = JSON.parse(await navigator.clipboard.readText());
        if (d.type !== 'ya-schema-files') throw new Error('not bundle');
        yaApplyBundle(d);
    } catch (e) {
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице)', true);
    }
}

function yaCleanGroupName(name) {
    if (!name) return 'Без имени';
    return name.replace(/[,&\-+()]/g, '').trim();
}

let yaStats = [];

function yaBuildGroups(data) {
    const groups = [];
    yaStats = [];
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
            yaStats.push({ name: groupName, count: (level.seats || []).length });
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

    // Размер подложки: viewBox или width/height
    const rootTag = (yaSvgContent.match(/<svg[^>]*>/i) || [''])[0];
    const vbm = rootTag.match(/viewBox\s*=\s*"([^"]*)"/i);
    let box = vbm ? parseViewBox(vbm[1]) : null;
    if (!box) {
        const wm = rootTag.match(/\swidth\s*=\s*"([\d.]+)/i), hm = rootTag.match(/\sheight\s*=\s*"([\d.]+)/i);
        if (wm && hm) box = [0, 0, parseFloat(wm[1]), parseFloat(hm[1])];
    }

    // Места за пределами подложки: скорее всего подложка от других данных
    if (box) {
        let outside = 0;
        data.levels.forEach(l => (l.seats || []).forEach(s => {
            if (s.x_coord == null || s.y_coord == null) return;
            if (s.x_coord < box[0] || s.y_coord < box[1] || s.x_coord > box[0] + box[2] || s.y_coord > box[1] + box[3]) outside++;
        }));
        if (outside > 0) addWarn(outside + ' мест за пределами подложки (проверьте, что подложка подходит к данным)');
    }

    let head = yaSvgContent.slice(0, end);
    // Нет viewBox: добавляем, чтобы SVG целиком помещался в превью
    if (!vbm && box && rootTag) {
        head = head.replace(rootTag, rootTag.replace(/<svg/i, '<svg viewBox="' + box.join(' ') + '"'));
    }

    const svg = head + '\n  <g id="tables-from-json">\n' + groups.join('\n') + '\n  </g>\n</svg>';
    const seatsCount = yaStats.reduce((n, g) => n + g.count, 0);
    return { svg, groupsCount: groups.length, seatsCount };
}

function processYa() {
    try {
        const result = yaMerge();
        let finalSvg = result.svg;
        const shouldRotate = document.getElementById('ya-rotate').checked;
        if (shouldRotate) finalSvg = rotateSVG(finalSvg);

        showPreview(finalSvg);
        const details = yaStats.map(g => g.name + ' (' + g.count + ')').join(', ');
        setStatus('✓ Объединено: ' + result.seatsCount + ' мест, ' + result.groupsCount + ' групп' + (shouldRotate ? ' (развёрнуто на 180°)' : '') +
            (details ? '\n📊 ' + details : ''));
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
    downloadCurrentResult('ya-merged.svg');
}

function clearYa() {
    yaSvgContent = '';
    document.getElementById('ya-json').value = '';
    document.getElementById('ya-file').value = '';
    document.getElementById('ya-link').value = '';
    yaWin = null;
    yaStats = [];
    document.getElementById('ya-rotate').checked = false;
    const dropzone = document.getElementById('ya-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите сюда оба файла';
    document.getElementById('ya-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initYa);
