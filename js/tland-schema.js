let tlandSvgContent = '';

function initTland() {
    setupDropzone('tland-dropzone', 'tland-file', readTlandFile);
}

function readTlandFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        tlandSvgContent = e.target.result;
        const dropzone = document.getElementById('tland-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = `Файл: ${file.name}`;
        
        const fileName = document.getElementById('tland-file-name');
        fileName.textContent = `✓ Загружен: ${file.name}`;
        fileName.style.display = 'block';
        
        setStatus(`Файл "${file.name}" загружен, ${tlandSvgContent.length} символов`);
    };
    reader.onerror = () => {
        setStatus('Ошибка чтения файла', true);
    };
    reader.readAsText(file);
}

// ---- Преобразования SVG (transform): места внутри групп с translate/scale/rotate ----
function tlandMul(A, B) {
    return [
        A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
        A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
        A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
    ];
}

function tlandParseTransform(str) {
    let m = [1, 0, 0, 1, 0, 0];
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let t;
    while ((t = re.exec(str || '')) !== null) {
        const n = t[2].trim().split(/[\s,]+/).map(Number);
        let k = null;
        if (t[1] === 'matrix' && n.length === 6) k = n;
        else if (t[1] === 'translate') k = [1, 0, 0, 1, n[0], n[1] || 0];
        else if (t[1] === 'scale') k = [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0];
        else if (t[1] === 'rotate') {
            const a = n[0] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
            k = n.length >= 3 ? [c, s, -s, c, n[1] - c * n[1] + s * n[2], n[2] - s * n[1] - c * n[2]] : [c, s, -s, c, 0, 0];
        } else if (t[1] === 'skewX') k = [1, 0, Math.tan(n[0] * Math.PI / 180), 1, 0, 0];
        else if (t[1] === 'skewY') k = [1, Math.tan(n[0] * Math.PI / 180), 0, 1, 0, 0];
        if (k && k.every(v => !isNaN(v))) m = tlandMul(m, k);
    }
    return m;
}

// Общая матрица элемента: transform всех родителей и самого элемента
function tlandAccumulatedMatrix(el) {
    const chain = [];
    for (let p = el; p && p.nodeType === 1; p = p.parentNode) {
        if (p.getAttribute && p.getAttribute('transform')) chain.unshift(p.getAttribute('transform'));
    }
    return chain.reduce((m, tr) => tlandMul(m, tlandParseTransform(tr)), [1, 0, 0, 1, 0, 0]);
}

// Естественная сортировка: 2 < 10, "1а" после "1"
function tlandNatural(a, b) {
    return String(a).localeCompare(String(b), 'ru', { numeric: true });
}

// Очистка служебных данных исходного файла: комментарии, лишние пространства имён, неиспользуемые шаблоны
function tlandCleanup(doc) {
    const stripComments = (node) => {
        Array.from(node.childNodes).forEach(c => {
            if (c.nodeType === 8) node.removeChild(c);
            else if (c.nodeType === 1) stripComments(c);
        });
    };
    stripComments(doc);
    const root = doc.documentElement;
    Array.from(root.attributes).forEach(a => {
        if (a.name.startsWith('xmlns:') && a.name !== 'xmlns:xlink') root.removeAttribute(a.name);
    });
    // defs без использования (например, шаблон-галочка для сайта)
    root.querySelectorAll('defs').forEach(defs => {
        const html = new XMLSerializer().serializeToString(root);
        const ids = Array.from(defs.querySelectorAll('[id]')).map(e => e.getAttribute('id'));
        const used = ids.some(id => html.includes('url(#' + id + ')') || html.includes('href="#' + id + '"'));
        if (!used) defs.parentNode.removeChild(defs);
    });
}

function processTland() {
    try {
        if (!tlandSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        const result = processTlandSVG(tlandSvgContent);
        
        if (result.count === 0) {
            throw new Error('Не найдено ни одного элемента с атрибутами section и seat');
        }
        
        showPreview(result.svg);
        
        // Формируем детальную статистику
        let statsText = `✓ Обработано: ${result.count} мест, ${result.sectors} секторов`;
        if (result.sectorStats && result.sectorStats.length > 0) {
            const details = result.sectorStats.map(s => `${s.name} (${s.count})`).join(', ');
            statsText += `\n📊 ${details}`;
        }
        setStatus(statsText);
        document.getElementById('tland-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function processTlandSVG(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;

    // Проверка на ошибки парсинга
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
        throw new Error('Невалидный SVG файл');
    }

    // Находим все элементы с атрибутами section и seat (rect, circle, path)
    const elements = root.querySelectorAll('[section][seat]');
    
    if (elements.length === 0) {
        return { svg: svgText, count: 0, sectors: 0, sectorNames: [], sectorStats: [] };
    }

    // Группируем по сектору
    const sectorGroups = new Map();
    const processedElements = [];

    // Живая копия для измерения path через getBBox
    let liveEls = null;
    const needLive = Array.from(elements).some(e => e.tagName.toLowerCase() === 'path');
    if (needLive) {
        try {
            const host = hiddenHost();
            host.innerHTML = svgText;
            liveEls = host.querySelectorAll('[section][seat]');
        } catch (e) { liveEls = null; }
    }
    let shifted = false;
    let missingRow = 0;

    elements.forEach((el, idx) => {
        const section = el.getAttribute('section');
        const seat = el.getAttribute('seat');
        if (!el.getAttribute('row')) missingRow++;
        const row = el.getAttribute('row') || '1';
        const elId = el.getAttribute('id') || `place_${seat || 'unknown'}`;

        if (!section || seat === null) {
            return;
        }

        // Формируем новое название: Ряд_X|N-N
        const newName = formatSeatId(row, seat);
        
        // Определяем тип элемента и его размеры
        const tagName = el.tagName.toLowerCase();
        let cx, cy, radius = 6; // дефолтный радиус
        
        if (tagName === 'rect') {
            const x = parseFloat(el.getAttribute('x') || 0);
            const y = parseFloat(el.getAttribute('y') || 0);
            const width = parseFloat(el.getAttribute('width') || 0);
            const height = parseFloat(el.getAttribute('height') || 0);
            cx = x + width / 2;
            cy = y + height / 2;
            // Радиус = половина меньшей стороны (чтобы круг вписался в прямоугольник)
            radius = Math.min(width, height) / 2;
            if (isNaN(radius) || radius <= 0) radius = 5;
        } else if (tagName === 'circle') {
            cx = parseFloat(el.getAttribute('cx') || 0);
            cy = parseFloat(el.getAttribute('cy') || 0);
            radius = parseFloat(el.getAttribute('r') || 0);
            if (isNaN(radius) || radius <= 0) radius = 5;
        } else if (tagName === 'path') {
            // Для path пытаемся найти координаты из атрибутов
            cx = parseFloat(el.getAttribute('cx') || 0);
            cy = parseFloat(el.getAttribute('cy') || 0);
            // Пробуем найти радиус из атрибута r или data-radius
            radius = parseFloat(el.getAttribute('r') || el.getAttribute('data-radius') || 0);
            if (isNaN(radius) || radius <= 0) radius = 5;
            // Нет cx/cy: берём центр и размер из getBBox
            if (!el.hasAttribute('cx') && liveEls && liveEls[idx] && liveEls[idx].getBBox) {
                try {
                    const bb = liveEls[idx].getBBox();
                    if (bb.width > 0 || bb.height > 0) {
                        cx = bb.x + bb.width / 2;
                        cy = bb.y + bb.height / 2;
                        if (!el.getAttribute('r')) radius = Math.min(bb.width, bb.height) / 2 || 5;
                    }
                } catch (e) { /* оставляем значения по умолчанию */ }
            }
        } else {
            // Другие элементы: пытаемся найти координаты
            cx = parseFloat(el.getAttribute('cx') || el.getAttribute('x') || 0);
            cy = parseFloat(el.getAttribute('cy') || el.getAttribute('y') || 0);
            radius = parseFloat(el.getAttribute('r') || 0);
            if (isNaN(radius) || radius <= 0) radius = 5;
        }
        
        // Если координаты не найдены, пропускаем элемент
        if (isNaN(cx) || isNaN(cy)) {
            return;
        }

        // Учитываем transform самого места и всех родительских групп
        const mtx = tlandAccumulatedMatrix(el);
        if (mtx[0] !== 1 || mtx[1] !== 0 || mtx[2] !== 0 || mtx[3] !== 1 || mtx[4] !== 0 || mtx[5] !== 0) {
            const nx = mtx[0] * cx + mtx[2] * cy + mtx[4];
            const ny = mtx[1] * cx + mtx[3] * cy + mtx[5];
            radius = radius * Math.sqrt(Math.abs(mtx[0] * mtx[3] - mtx[1] * mtx[2]));
            cx = Math.round(nx * 10000) / 10000;
            cy = Math.round(ny * 10000) / 10000;
            shifted = true;
        }
        
        // Создаём КРУГ с сохранением исходного размера
        const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', seatR(radius));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', SEAT_STROKE);
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('id', newName);
        circle.setAttribute('data-original-id', elId);
        circle.setAttribute('data-seat', seat);
        circle.setAttribute('data-row', row);
        circle.setAttribute('data-section', section);
        
        // Добавляем title для тултипа
        if (document.getElementById('tland-titles').checked) {
            const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `${section} | Ряд ${row} | Место ${seat}`;
            circle.appendChild(title);
        }
        
        // Добавляем в группу сектора
        if (!sectorGroups.has(section)) {
            sectorGroups.set(section, []);
        }
        sectorGroups.get(section).push(circle);
        processedElements.push(el);
    });

    const lh = document.getElementById('__hidden_host');
    if (lh) lh.remove();
    if (shifted) addWarn('Учтён transform групп с местами (смещение/масштаб применены к координатам кругов)');
    if (missingRow > 0) addWarn('У ' + missingRow + ' мест нет атрибута row (подставлен ряд 1)');

    // Удаляем старые элементы
    processedElements.forEach(el => {
        if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    });

    // Создаём группы для секторов
    const sortedSectors = Array.from(sectorGroups.keys()).sort((a, b) => {
        // Пробуем сортировать как числа, если это числа
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b, 'ru');
    });
    
    const sectorNames = [];
    const sectorStats = [];
    
    sortedSectors.forEach(sectionName => {
        const seats = sectorGroups.get(sectionName);
        if (seats.length === 0) return;
        
        // Сортируем места по номеру
        seats.sort((a, b) => {
            const byRow = tlandNatural(a.getAttribute('data-row') || '', b.getAttribute('data-row') || '');
            if (byRow !== 0) return byRow;
            return tlandNatural(a.getAttribute('data-seat') || '', b.getAttribute('data-seat') || '');
        });
        
        // Создаём группу
        const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
        // Делаем безопасное имя для id
        const safeId = sectionName.replace(/[^a-zA-Z0-9_\-\u0400-\u04FF]/g, '_');
        g.setAttribute('id', safeId);
        g.setAttribute('data-sector', sectionName);
        g.setAttribute('class', 'sector-group');
        
        // Добавляем все места
        seats.forEach(seat => {
            g.appendChild(seat);
        });
        
        root.appendChild(g);
        sectorNames.push(sectionName);
        sectorStats.push({
            name: sectionName,
            count: seats.length
        });
    });

    if (document.getElementById('tland-clean').checked) tlandCleanup(doc);

    // Сериализуем
    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(doc);
    
    // Очищаем от лишних namespace
    result = result.replace(/xmlns:ns\d+="[^"]*"/g, '');

    // Подсчитываем общее количество мест
    let totalSeats = 0;
    for (const [_, seats] of sectorGroups) {
        totalSeats += seats.length;
    }

    return {
        svg: result,
        count: totalSeats,
        sectors: sectorGroups.size,
        sectorNames: sectorNames,
        sectorStats: sectorStats
    };
}

function tlandMarkLoaded(name) {
    const dropzone = document.getElementById('tland-dropzone');
    dropzone.classList.add('active');
    dropzone.querySelector('p').textContent = 'Файл: ' + name;
    const fileName = document.getElementById('tland-file-name');
    fileName.textContent = '✓ Загружен: ' + name;
    fileName.style.display = 'block';
}

// ---- Автозагрузка по ссылке на страницу события (нужен скрипт-помощник на странице) ----
let tlandWin = null;

function tlandOpenWidget() {
    const url = document.getElementById('tland-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку на страницу события (начинается с https://)', true); return; }
    tlandWin = window.open(url, '_blank');
    if (!tlandWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    setStatus('Жду данные от страницы… (на ней должен работать скрипт-помощник)');
}

function tlandApplyBundle(d) {
    if (!d || typeof d.svg !== 'string' || !/<svg[\s>]/i.test(d.svg.slice(0, 2000))) {
        setStatus('Неверный формат данных от помощника', true);
        return;
    }
    tlandSvgContent = d.svg;
    tlandMarkLoaded('со страницы');
    processTland();
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'tland-svg') return;
    if (!tlandWin || e.source !== tlandWin) return; // только от окна, открытого кнопкой
    tlandApplyBundle(d);
    try { tlandWin.close(); } catch (err) { /* окно можно закрыть вручную */ }
});

async function tlandPasteBundle() {
    try {
        const d = JSON.parse(await navigator.clipboard.readText());
        if (d.type !== 'tland-svg') throw new Error('not bundle');
        tlandApplyBundle(d);
    } catch (e) {
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице)', true);
    }
}

function downloadTland() {
    downloadCurrentResult('tland-grouped.svg');
}

function clearTland() {
    tlandSvgContent = '';
    document.getElementById('tland-file').value = '';
    document.getElementById('tland-link').value = '';
    tlandWin = null;
    const dropzone = document.getElementById('tland-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    document.getElementById('tland-file-name').style.display = 'none';
    clearResult();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initTland);
