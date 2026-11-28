// Модуль ocr: надписи, нарисованные кривыми, превращаются в <text>
let ocrSource = '';        // исходный текст SVG
let ocrGroups = [];        // все группы документа (в порядке querySelectorAll('g'))
let ocrItems = [];         // найденные надписи
let ocrBusy = false;
let ocrCropDoc = null;     // разобранный документ для картинок надписей (разбираем один раз за запуск)

const OCR_ENGINE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const OCR_WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрствуфхцчшщъыьэюя-+=/\\().,!? ';
const OCR_GROUP_NAMES = /^(text|txt|texts|labels?)$/i;

function initOcr() {
    setupDropzone('ocr-dropzone', 'ocr-file', readOcrFile);
}

async function readOcrFile(file) {
    ocrSetSvg((await file.text()).replace(/^\uFEFF/, ''), file.name);
}

function ocrUseLast() {
    if (!window.lastResultSvg) { setStatus('Нет результата конвертера: сначала сконвертируйте схему или загрузите файл', true); return; }
    ocrSetSvg(window.lastResultSvg, 'последний результат');
}

function ocrParse(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Файл не является валидным SVG');
    return doc;
}

// Загрузка SVG и поиск группы с надписями
function ocrSetSvg(text, name) {
    try {
        const doc = ocrParse(text);
        ocrSource = text;
        ocrGroups = Array.from(doc.querySelectorAll('g'));
        ocrItems = [];
        document.getElementById('ocr-list').innerHTML = '';
        document.getElementById('ocr-progress').textContent = '';
        document.getElementById('ocr-apply').style.display = 'none';
        document.getElementById('ocr-download').style.display = 'none';

        const sel = document.getElementById('ocr-group');
        sel.innerHTML = '';
        const cands = [];
        ocrGroups.forEach((g, idx) => {
            const kids = Array.from(g.children).filter(c => !/^(title|desc|defs|style|metadata)$/i.test(c.tagName));
            if (!kids.length) return;
            const strong = OCR_GROUP_NAMES.test(g.getAttribute('id') || '') || OCR_GROUP_NAMES.test(g.getAttribute('data-name') || '');
            const onlyShapes = kids.every(c => c.tagName === 'path' || (c.tagName === 'g' && !c.querySelector('circle')));
            if (strong || (onlyShapes && kids.length >= 3 && !g.querySelector('circle'))) {
                cands.push({ idx, kids: kids.length, strong, name: decodeIdEscapes(g.getAttribute('id') || g.getAttribute('data-name') || '') });
            }
        });
        // Нет подходящих групп: даём выбрать любую
        if (!cands.length) {
            ocrGroups.forEach((g, idx) => {
                const n = g.children.length;
                if (n) cands.push({ idx, kids: n, strong: false, name: decodeIdEscapes(g.getAttribute('id') || g.getAttribute('data-name') || '') });
            });
        }
        cands.forEach(c => {
            const o = document.createElement('option');
            o.value = String(c.idx);
            o.textContent = (c.name || '(без имени)') + ' · ' + c.kids + ' шт';
            sel.appendChild(o);
        });
        const best = cands.find(c => c.strong) || cands.slice().sort((a, b) => b.kids - a.kids)[0];
        if (best) sel.value = String(best.idx);
        document.getElementById('ocr-info').textContent = '✓ ' + name + (best ? '' : ': групп с надписями не найдено');
    } catch (e) {
        handleError(e);
    }
}

// ---- Геометрия надписей ----
function ocrBoxByMatrix(b, m) {
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
        .map(p => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// Надписи выбранной группы: размеры считаем в живой копии документа (нужен getBBox)
function ocrCollectItems(groupIdx) {
    const doc = ocrParse(ocrSource);
    const groups = Array.from(doc.querySelectorAll('g'));
    const group = groups[groupIdx];
    if (!group) throw new Error('Группа не найдена');

    const host = hiddenHost();
    const live = document.importNode(doc.documentElement, true);
    host.appendChild(live);
    const liveGroup = Array.from(live.querySelectorAll('g'))[groupIdx];
    const items = [];
    try {
        Array.from(liveGroup.children).forEach((el, childIndex) => {
            if (/^(title|desc|defs|style|metadata)$/i.test(el.tagName)) return;
            let bb = null;
            try { bb = el.getBBox(); } catch (e) { bb = null; }
            if (!bb || !(bb.width > 0) || !(bb.height > 0)) return;
            const own = svgParseTransform(el.getAttribute('transform') || '');
            const abs = svgAccumulatedMatrix(el);
            const absBox = ocrBoxByMatrix(bb, abs);
            let angle = Math.atan2(abs[1], abs[0]) * 180 / Math.PI;
            let ownAngle = Math.atan2(own[1], own[0]) * 180 / Math.PI;
            // Вытянутый по вертикали контур без поворота: скорее всего вертикальная надпись
            if (absBox.height > absBox.width * 2 && Math.abs(angle) < 1) { angle = 90; ownAngle = 90; }
            items.push({
                id: 'item-' + (items.length + 1),
                childIndex: childIndex,
                bbox: absBox,
                parentBox: ocrBoxByMatrix(bb, own),
                exactAngle: angle,
                ownAngle: ownAngle
            });
        });
    } finally {
        host.remove();
    }
    return items;
}

// ---- Картинка надписи: рисуем только её, в нужном масштабе, без соседних элементов ----
function ocrCropSvg(item, scale) {
    const small = item.bbox.width < 30 && item.bbox.height < 30;
    const pad = small ? 5 : 12;
    item.pad = pad;
    const b = item.bbox;
    const x = b.x - pad, y = b.y - pad, w = b.width + pad * 2, h = b.height + pad * 2;

    const doc = ocrCropDoc || ocrParse(ocrSource);
    const group = Array.from(doc.querySelectorAll('g'))[item.groupIdx];
    const el = group.children[item.childIndex];
    const parentM = svgAccumulatedMatrix(group); // transform родителей надписи
    const clone = el.cloneNode(true);
    const force = (n) => {
        if (n.nodeType !== 1) return;
        if (!/^g$/i.test(n.tagName)) n.setAttribute('style', 'fill:#000000;stroke:none');
        Array.from(n.children).forEach(force);
    };
    force(clone);
    const inner = new XMLSerializer().serializeToString(clone);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + x + ' ' + y + ' ' + w + ' ' + h + '" width="' + Math.ceil(w * scale) +
        '" height="' + Math.ceil(h * scale) + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#ffffff"/>' +
        '<g transform="matrix(' + parentM.join(' ') + ')">' + inner + '</g></svg>';
}

function ocrSvgToImage(svg) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось нарисовать надпись')); };
        img.src = url;
    });
}

// Возвращает data URL картинки надписи (белый фон, чёрные контуры)
async function ocrRenderCrop(item) {
    const svg = ocrCropSvg(item, 3);
    const img = await ocrSvgToImage(svg);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

function ocrImageFromUrl(url) {
    return new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.src = url; });
}

async function ocrRotate(url, angle) {
    if (Math.abs(angle) < 0.5) return url;
    const img = await ocrImageFromUrl(url);
    const rad = angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const c = document.createElement('canvas');
    c.width = Math.ceil(img.width * cos + img.height * sin);
    c.height = Math.ceil(img.width * sin + img.height * cos);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2);
    x.rotate(rad);
    x.drawImage(img, -img.width / 2, -img.height / 2);
    return c.toDataURL('image/png');
}

async function ocrThreshold(url, threshold) {
    const img = await ocrImageFromUrl(url);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const data = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < data.data.length; i += 4) {
        const gray = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
        data.data[i] = data.data[i + 1] = data.data[i + 2] = gray > threshold ? 255 : 0;
    }
    x.putImageData(data, 0, 0);
    return c.toDataURL('image/png');
}

// Добавляет точку справа: одиночные символы (единицы) иначе не распознаются
async function ocrPadWithDot(url) {
    const img = await ocrImageFromUrl(url);
    const c = document.createElement('canvas');
    c.width = img.width + 40;
    c.height = img.height;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0);
    x.fillStyle = '#000000';
    x.font = 'bold 24px Arial';
    x.fillText('.', img.width + 10, img.height - 10);
    return c.toDataURL('image/png');
}

// Распознавание одной надписи: перебор поворотов и порогов (как в исходном OCR), с ранним выходом
async function ocrRecognizeItem(worker, item) {
    const small = item.bbox.width < 28 && item.bbox.height < 28;
    const vertical = item.bbox.height > item.bbox.width * 1.2;
    const angles = (small && !vertical) ? [0] : [0, 90, -90, 180, 270];
    let bestText = '', bestConf = 0;
    for (const threshold of [185, 140, 220]) {
        for (const angle of angles) {
            const oriented = await ocrRotate(item.imgDataUrl, angle);
            const clean = await ocrThreshold(oriented, threshold);
            const res = await worker.recognize(clean);
            let text = String(res.data.text || '').replace(/[\n\r]+/g, ' ').trim();
            let conf = res.data.confidence;
            if (text.length === 0) {
                const resDot = await worker.recognize(await ocrPadWithDot(clean));
                const textDot = String(resDot.data.text || '').replace(/[\n\r]+/g, ' ').trim();
                if (textDot.includes('.')) { text = textDot.replace('.', '').trim(); conf = resDot.data.confidence; }
            }
            // Вертикальную единицу движок принимает за "="
            if (text === '=' && vertical) { text = item.bbox.width > 12 ? '11' : '1'; conf = 98; }
            if (conf > bestConf && text.length > 0) { bestConf = conf; bestText = text; }
            if (bestConf > 92) break;
        }
        if (bestConf > 85) break;
    }
    return bestText
        .replace(/[^\w\s.,!?\-+=/\\().\u0400-\u04FF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function ocrLoadEngine() {
    return new Promise((resolve, reject) => {
        if (window.Tesseract) { resolve(); return; }
        const s = document.createElement('script');
        s.src = OCR_ENGINE_URL;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Не удалось загрузить распознавание (нужен интернет)'));
        document.head.appendChild(s);
    });
}

function ocrToSentenceCase(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

function ocrProgress(text) {
    document.getElementById('ocr-progress').textContent = text;
}

// Список надписей: картинка и поле для правки
function ocrRenderList() {
    const list = document.getElementById('ocr-list');
    list.innerHTML = '';
    ocrItems.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'ocr-row';
        row.id = 'row-' + item.id;
        const num = document.createElement('span');
        num.className = 'ocr-num';
        num.textContent = '#' + (i + 1);
        const img = document.createElement('img');
        img.src = item.imgDataUrl;
        img.alt = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'input-' + item.id;
        input.placeholder = 'Введите текст вручную';
        input.value = '';
        row.appendChild(num);
        row.appendChild(img);
        row.appendChild(input);
        list.appendChild(row);
    });
}

async function ocrStart() {
    if (ocrBusy) return;
    try {
        if (!ocrSource) throw new Error('Сначала загрузите SVG или возьмите результат конвертера');
        const sel = document.getElementById('ocr-group');
        if (!sel.value) throw new Error('Не выбрана группа с надписями');
        const groupIdx = parseInt(sel.value, 10);

        ocrBusy = true;
        ocrProgress('Ищу надписи…');
        ocrItems = ocrCollectItems(groupIdx);
        if (!ocrItems.length) throw new Error('В выбранной группе нет подходящих объектов');
        ocrItems.forEach(it => { it.groupIdx = groupIdx; });
        ocrCropDoc = ocrParse(ocrSource);
        ocrGroups = Array.from(ocrCropDoc.querySelectorAll('g'));

        // Картинки надписей (по несколько штук параллельно)
        let rendered = 0;
        const renderQueue = ocrItems.slice();
        await Promise.all(Array.from({ length: 6 }, async () => {
            while (renderQueue.length) {
                const it = renderQueue.shift();
                it.imgDataUrl = await ocrRenderCrop(it);
                ocrProgress('Готовлю картинки: ' + (++rendered) + '/' + ocrItems.length);
            }
        }));
        ocrRenderList();

        ocrProgress('Загружаю распознавание…');
        await ocrLoadEngine();
        const workerCount = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
        const workers = [];
        for (let k = 0; k < workerCount; k++) {
            const w = await Tesseract.createWorker('rus+eng');
            await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: OCR_WHITELIST });
            workers.push(w);
        }

        // Одинаковые картинки распознаём один раз
        const cache = new Map();
        const queue = ocrItems.slice();
        let done = 0;
        const sentence = document.getElementById('ocr-sentence').checked;
        await Promise.all(workers.map(async (worker) => {
            while (queue.length) {
                const item = queue.shift();
                const input = document.getElementById('input-' + item.id);
                try {
                    let text;
                    if (cache.has(item.imgDataUrl)) text = await cache.get(item.imgDataUrl);
                    else {
                        const p = ocrRecognizeItem(worker, item);
                        cache.set(item.imgDataUrl, p);
                        text = await p;
                    }
                    if (input) input.value = (sentence && text) ? ocrToSentenceCase(text) : (text || '');
                } catch (err) {
                    console.error('Ошибка распознавания', item.id, err);
                }
                ocrProgress('Распознано: ' + (++done) + '/' + ocrItems.length);
            }
        }));
        await Promise.all(workers.map(w => w.terminate().catch(() => {})));

        const recognized = ocrItems.filter(it => (document.getElementById('input-' + it.id) || {}).value).length;
        ocrProgress('Распознано надписей: ' + recognized + ' из ' + ocrItems.length + '. Проверьте тексты и нажмите «Применить»');
        document.getElementById('ocr-apply').style.display = 'block';
    } catch (e) {
        ocrProgress('');
        handleError(e);
    } finally {
        ocrBusy = false;
        ocrCropDoc = null;
    }
}

// Замена контуров на <text>
function ocrBuildResult() {
    const doc = ocrParse(ocrSource);
    const group = Array.from(doc.querySelectorAll('g'))[ocrItems[0].groupIdx];
    const kids = Array.from(group.children);
    const fontFamily = document.getElementById('ocr-font').value.trim() || 'Arial, sans-serif';
    const fontSize = parseInt(document.getElementById('ocr-size').value, 10) || 12;
    const color = document.getElementById('ocr-color').value || '#868686';
    const autoSize = document.getElementById('ocr-autosize').checked;
    let replaced = 0;

    ocrItems.forEach(item => {
        const input = document.getElementById('input-' + item.id);
        const value = input ? input.value.trim() : '';
        const el = kids[item.childIndex];
        if (!value || !el || !el.parentNode) return;

        const pb = item.parentBox;
        const cx = pb.x + pb.width / 2;
        const cy = pb.y + pb.height * 0.78;
        let angle = item.ownAngle;
        if (value.length === 1) angle = 0; // одиночный символ всегда прямо

        let size = Math.max(6, fontSize);
        if (autoSize) {
            const sideways = Math.abs(Math.abs(angle) - 90) < 45;
            const capHeight = sideways ? pb.width : pb.height;
            size = Math.max(6, Math.round(capHeight / 0.72));
        }

        const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(Math.round(cx * 100) / 100));
        t.setAttribute('y', String(Math.round(cy * 100) / 100));
        t.setAttribute('font-family', fontFamily);
        t.setAttribute('font-size', size + 'px');
        t.setAttribute('fill', color);
        t.setAttribute('text-anchor', 'middle');
        t.textContent = value;
        if (Math.abs(angle) > 0.5) t.setAttribute('transform', 'rotate(' + angle + ' ' + t.getAttribute('x') + ' ' + t.getAttribute('y') + ')');
        el.parentNode.replaceChild(t, el);
        replaced++;
    });
    return { svg: new XMLSerializer().serializeToString(doc), replaced: replaced };
}

function ocrApply() {
    try {
        if (!ocrItems.length) throw new Error('Сначала распознайте надписи');
        const res = ocrBuildResult();
        if (!res.replaced) throw new Error('Нет текстов для замены: заполните хотя бы одно поле');
        showPreview(res.svg);
        document.getElementById('ocr-download').style.display = 'block';
        setStatus('');
    } catch (e) {
        handleError(e);
    }
}

function ocrDownload() {
    downloadCurrentResult('ocr-result.svg');
}

function ocrClear() {
    ocrSource = '';
    ocrGroups = [];
    ocrItems = [];
    document.getElementById('ocr-file').value = '';
    document.getElementById('ocr-info').textContent = '';
    document.getElementById('ocr-group').innerHTML = '';
    document.getElementById('ocr-list').innerHTML = '';
    document.getElementById('ocr-progress').textContent = '';
    document.getElementById('ocr-apply').style.display = 'none';
    document.getElementById('ocr-download').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initOcr);
