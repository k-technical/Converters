// Скачивание SVG
function downloadSVG(svgContent, filename = 'result.svg') {
    if (!svgContent.startsWith('<?xml')) {
        svgContent = '<?xml version="1.0" encoding="utf-8"?>\n' + svgContent;
    }
    
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Парсинг JSON
function extractJSON(input) {
    try {
        return JSON.parse(input);
    } catch (e) {
        try {
            let cleaned = input.replace(/^"|"$/g, '').replace(/\\"/g, '"');
            return JSON.parse(cleaned);
        } catch (e2) {
            throw new Error('Невалидный JSON');
        }
    }
}

// Общие настройки (панель сверху): формат id и радиус мест
const SEAT_STROKE = '#AEAEAE';

// Формат ID места: Ряд_1|2-2 (третий аргумент оставлен для совместимости модулей)
function fmtId(row, place) {
    return `Ряд_${row}|${place}-${place}`;
}

// Старое имя функции
function formatSeatId(row, place) {
    return fmtId(row, place);
}

// Радиус мест: значение по умолчанию модуля
function seatR(def) {
    return def;
}

// Экранирование для вставки в строку SVG/XML
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Невидимый контейнер для измерений (getBBox и т.п.)
function hiddenHost() {
    const old = document.getElementById('__hidden_host');
    if (old) old.remove();
    const host = document.createElement('div');
    host.id = '__hidden_host';
    host.style.cssText = 'position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;pointer-events:none';
    document.body.appendChild(host);
    return host;
}

// Единая зона загрузки: принимает файл любого формата (в т.ч. без расширения)
function setupDropzone(zoneId, inputId, onFile, multi) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;
    input.removeAttribute('accept');
    if (multi) input.multiple = true;
    const pick = (files) => {
        if (!files || !files.length) return;
        if (multi) onFile(Array.from(files)); else onFile(files[0]);
    };
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.style.borderColor = '#58a6ff';
        zone.style.background = 'rgba(88, 166, 255, 0.1)';
    });
    zone.addEventListener('dragleave', () => {
        zone.style.borderColor = '#30363d';
        zone.style.background = '#161b22';
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = '#30363d';
        zone.style.background = '#161b22';
        pick(e.dataTransfer.files);
    });
    input.addEventListener('change', (e) => {
        pick(e.target.files);
    });
}

// Парсинг SVG строки в DOM
function parseSVG(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const error = doc.querySelector('parsererror');
    if (error) {
        throw new Error('Невалидный SVG');
    }
    return doc;
}

// Сериализация SVG DOM в строку
function serializeSVG(doc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}


// viewBox -> [x, y, w, h] (понимает и пробелы, и запятые)
function parseViewBox(str) {
    const p = String(str || '').trim().split(/[\s,]+/).map(Number);
    return p.length === 4 && p.every(n => !isNaN(n)) ? p : null;
}


// ---- Преобразования SVG: накопленная матрица элемента с учётом transform всех родителей ----
function svgMul(A, B) {
    return [
        A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
        A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
        A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
    ];
}

function svgParseTransform(str) {
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
        if (k && k.every(v => !isNaN(v))) m = svgMul(m, k);
    }
    return m;
}

function svgAccumulatedMatrix(el) {
    const chain = [];
    for (let p = el; p && p.nodeType === 1; p = p.parentNode) {
        if (p.getAttribute && p.getAttribute('transform')) chain.unshift(p.getAttribute('transform'));
    }
    return chain.reduce((m, tr) => svgMul(m, svgParseTransform(tr)), [1, 0, 0, 1, 0, 0]);
}

// Клон элемента, который переносится в другое место SVG: сохраняем его положение через matrix(...)
function svgCloneKeepPosition(el) {
    const clone = el.cloneNode(true);
    // Классы родительских групп (например, прозрачность группы) переносим на сам элемент
    const inherited = [];
    for (let p = el.parentNode; p && p.nodeType === 1 && p.tagName !== 'svg'; p = p.parentNode) {
        const c = p.getAttribute && p.getAttribute('class');
        if (c) inherited.unshift(c);
    }
    if (inherited.length) {
        clone.setAttribute('class', ((clone.getAttribute('class') || '') + ' ' + inherited.join(' ')).trim());
    }
    const m = svgAccumulatedMatrix(el);
    const identity = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
    if (!identity) {
        clone.setAttribute('transform', 'matrix(' + m.map(v => Math.round(v * 1e6) / 1e6).join(' ') + ')');
    }
    return clone;
}


// Очистка названия сектора/группы: остаются буквы, цифры, пробел и _ ; лишние знаки и двойные пробелы убираются
function cleanName(name, fallback) {
    const s = String(name == null ? '' : name)
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N} _]/gu, '')
        .replace(/ {2,}/g, ' ')
        .trim();
    return s || (fallback || '');
}

// ---- Масштаб SVG под размер места: коэффициент = 15 / исходный размер места, итоговое место = 15 x 80% = 12 px ----
const SEAT_TARGET_SIZE = 15;
const SEAT_PERCENT = 80;

function seatNum(n) {
    return String(Math.round(n * 10000) / 10000);
}

// Масштабирует SVG через width/height (содержимое остаётся в исходных координатах),
// уменьшает круги-места до SEAT_PERCENT % и ставит обводку 1 px после масштаба
function applySeatScale(doc, seatElements) {
    const sizes = seatElements.map(el => parseFloat(el.getAttribute('r')) * 2).filter(v => v > 0).sort((a, b) => a - b);
    if (!sizes.length) throw new Error('У мест нет радиуса r, масштаб посчитать нельзя');
    const size = sizes[Math.floor(sizes.length / 2)];
    const k = SEAT_TARGET_SIZE / size;

    const svg = doc.documentElement;
    let box = parseViewBox(svg.getAttribute('viewBox'));
    if (!box) {
        const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
        if (!(w > 0 && h > 0)) throw new Error('У SVG нет viewBox и width/height, масштаб не применить');
        box = [0, 0, w, h];
        svg.setAttribute('viewBox', box.join(' '));
    }

    seatElements.forEach(el => {
        const r = parseFloat(el.getAttribute('r'));
        if (r > 0) el.setAttribute('r', seatNum(r * SEAT_PERCENT / 100));
        el.setAttribute('stroke-width', seatNum(1 / k));
    });

    svg.setAttribute('width', seatNum(box[2] * k));
    svg.setAttribute('height', seatNum(box[3] * k));

    return 'Размер места ' + seatNum(size) + ', коэффициент ' + seatNum(k) + ', итоговое место ' + seatNum(size * k * SEAT_PERCENT / 100) + ' px';
}
