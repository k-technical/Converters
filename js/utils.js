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

// Формат ID места. defEncoded - как было в модуле по умолчанию
function fmtId(row, place, defEncoded) {
    const el = document.getElementById('opt-idmode');
    const mode = el ? el.value : 'auto';
    const enc = mode === 'enc' ? true : mode === 'plain' ? false : !!defEncoded;
    return enc ? `Ряд_x5F_${row}_x7C_${place}-${place}` : `Ряд_${row}|${place}-${place}`;
}

// Старое имя: кодированный формат по умолчанию
function formatSeatId(row, place) {
    return fmtId(row, place, true);
}

// Радиус мест: общее поле или значение модуля по умолчанию
function seatR(def) {
    const el = document.getElementById('opt-radius');
    const v = el ? parseFloat(el.value) : NaN;
    return v > 0 ? v : def;
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
function setupDropzone(zoneId, inputId, onFile) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;
    input.removeAttribute('accept');
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
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
    });
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) onFile(file);
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
