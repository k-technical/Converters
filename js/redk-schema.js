// Модуль redk: SVG + JSON -> SVG
let redkSvgText = null;
let redkJsonData = null;
let redkSvgLoaded = false;
let redkJsonLoaded = false;
let redkStats = null;

// Настройки мест (фиксированные)
const REDK_STROKE_COLOR = '#AEAEAE';
const REDK_SEAT_RADIUS = 12;
const REDK_STROKE_WIDTH = 1;

function initRedk() {
    // Любая зона принимает один или оба файла сразу: SVG и JSON определяются по содержимому
    setupDropzone('redk-dropzone', 'redk-file', readRedkFiles, true);
}

async function readRedkFiles(files) {
    for (const file of files) {
        const text = await file.text();
        const t = text.replace(/^\uFEFF/, '').trim();
        if (/<svg[\s>]/i.test(t.slice(0, 2000))) redkAcceptSvg(t, file.name);
        else if (t[0] === '[' || t[0] === '{') redkAcceptJson(t, file.name);
        else setStatus('Не удалось определить файл «' + file.name + '» (нужен SVG или JSON)', true);
    }
    updateRedkStatus();
    // Оба файла загружены: сразу строим SVG
    if (redkSvgLoaded && redkJsonLoaded) processRedk();
}

function redkAcceptSvg(text, name) {
    redkSvgText = text;
    redkSvgLoaded = true;
    redkNames.svg = name;
    redkRefreshUi();
}

function redkAcceptJson(text, name) {
    try {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('JSON должен быть массивом');
        redkJsonData = data;
        redkJsonLoaded = true;
        redkNames.json = name + ' (' + data.length + ' мест)';
        redkRefreshUi();
    } catch (err) {
        setStatus('Ошибка JSON: ' + err.message, true);
        redkJsonLoaded = false;
    }
}

// Одна зона загрузки: показываем, какие файлы уже загружены
const redkNames = { svg: '', json: '' };

function redkRefreshUi() {
    const dropzone = document.getElementById('redk-dropzone');
    const label = document.getElementById('redk-file-name');
    const list = [redkNames.svg, redkNames.json].filter(Boolean);
    dropzone.classList.toggle('active', redkSvgLoaded && redkJsonLoaded);
    dropzone.querySelector('p').textContent = 'Загрузите schema.svg и schema.json';
    label.textContent = list.length ? 'Загружено: ' + list.join(', ') : '';
    label.style.display = list.length ? 'block' : 'none';
}

// ---- Автозагрузка по ссылке на страницу (нужен скрипт-помощник) ----
let redkWin = null;

function redkOpenWidget() {
    const url = document.getElementById('redk-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку (начинается с https://)', true); return; }
    redkWin = window.open(url, '_blank');
    if (!redkWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    setStatus('Жду данные… (должен работать скрипт-помощник)');
}

function redkApplyBundle(d) {
    if (!d || typeof d.svg !== 'string' || typeof d.json !== 'string') { setStatus('Неверный формат данных от помощника', true); return; }
    redkAcceptSvg(d.svg, 'schema.svg (со страницы)');
    redkAcceptJson(d.json, 'schema.json (со страницы)');
    updateRedkStatus();
    if (redkSvgLoaded && redkJsonLoaded) processRedk();
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'redk-files') return;
    if (!redkWin || e.source !== redkWin) return; // только от окна, открытого кнопкой
    redkApplyBundle(d);
    try { redkWin.close(); } catch (err) { /* окно можно закрыть вручную */ }
});

async function redkPasteBundle() {
    try {
        const d = JSON.parse(await navigator.clipboard.readText());
        if (d.type !== 'redk-files') throw new Error('not bundle');
        redkApplyBundle(d);
    } catch (e) {
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице)', true);
    }
}

function updateRedkStatus() {
    redkRefreshUi();
}

// ---- Стили: inline style, атрибуты и классы из <style> ----
let redkCss = {};

function redkParseCss(svgDoc) {
    const rules = {};
    svgDoc.querySelectorAll('style').forEach(st => {
        const css = (st.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
        css.replace(/([^{}]+)\{([^}]*)\}/g, (m, sel, body) => {
            const decl = {};
            body.split(';').forEach(d => {
                const i = d.indexOf(':');
                if (i > 0) decl[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim().toLowerCase();
            });
            sel.split(',').forEach(s => {
                const mm = s.trim().match(/^\.([\w-]+)$/);
                if (mm) rules[mm[1]] = Object.assign(rules[mm[1]] || {}, decl);
            });
            return m;
        });
    });
    return rules;
}

function redkProp(el, prop) {
    const st = (el.getAttribute('style') || '').toLowerCase();
    const m = st.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)'));
    if (m) return m[1].trim();
    const at = el.getAttribute(prop);
    if (at) return at.trim().toLowerCase();
    let v = '';
    (el.getAttribute('class') || '').split(/\s+/).forEach(c => {
        if (redkCss[c] && redkCss[c][prop] !== undefined) v = redkCss[c][prop];
    });
    return v;
}

function redkColor(c) {
    c = (c || '').trim().toLowerCase();
    return /^#[0-9a-f]{3}$/.test(c) ? c.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : c;
}

// ---- Проверка, является ли элемент фоновым прямоугольником ----
function isBackgroundRect(element) {
    if (element.tagName !== 'rect') return false;
    if (redkColor(redkProp(element, 'fill')) !== '#eeeff4') return false;
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    if (width === '5500' && height === '4000') return true;
    // Любой размер: фон равен viewBox
    const vb = window.__redkVB;
    return !!(vb && Math.abs(parseFloat(width) - vb[2]) < 1 && Math.abs(parseFloat(height) - vb[3]) < 1);
}

// ---- Проверка, является ли элемент декоративным контуром подложки ----
function isDecorationContour(element) {
    const fill = redkColor(redkProp(element, 'fill'));
    const stroke = redkColor(redkProp(element, 'stroke'));
    return fill === '#ffffff' && (stroke === '#eeeff4' || stroke === '#eeeef4');
}

// ---- Проверка, является ли элемент текстовой подписью ----
function isTextLabel(element) {
    return element.tagName === 'text';
}

// ---- Проверка, есть ли у элемента обводка/заливка ----
function hasNoStrokeAndFill(element) {
    const style = element.getAttribute('style') || '';
    // Если стиль задан прямо в элементе, считаем, что обводка/заливка заданы осознанно
    if (style.includes('stroke:') || style.includes('fill:')) return false;
    const stroke = redkProp(element, 'stroke');
    const fill = redkProp(element, 'fill');
    return (!stroke || stroke === 'none') && (!fill || fill === 'none');
}

// ---- Добавление черной обводки ----
function addBlackStroke(element) {
    const style = element.getAttribute('style') || '';
    if (style) {
        element.setAttribute('style', style + '; stroke: #000000; stroke-width: 1pt;');
    } else {
        element.setAttribute('stroke', '#000000');
        element.setAttribute('stroke-width', '1pt');
    }
}

// ---- Разбор id места: seatcontainer.sector.<сектор>.row.<ряд>.seat.<место> ----
function parseRedkId(id) {
    const s = String(id);
    let m = s.match(/sector\.(.+)\.row\.([^.]+)\.seat\.([^.]+)$/);
    if (m) return { sector: m[1], row: m[2], seat: m[3] };
    // Нестандартный id: запасной разбор
    const sm = s.match(/sector\.([^.]+)\./);
    const parts = s.split('.');
    const ri = parts.indexOf('row'), si = parts.indexOf('seat');
    return { sector: sm ? sm[1] : 'unknown', row: (ri >= 0 && parts[ri + 1]) || '-', seat: (si >= 0 && parts[si + 1]) || '-' };
}

// ---- Группировка мест по секторам ----
function groupSeatsBySectorName(seatsArray) {
    const groups = {};
    seatsArray.forEach(item => {
        const sector = parseRedkId(item.id).sector;
        if (!groups[sector]) groups[sector] = [];
        groups[sector].push(item);
    });
    return groups;
}

// ---- Кодирование спецсимволов для ID ----
function encodeForId(text) {
    return text
        .replace(/_/g, '_x5F_')
        .replace(/\|/g, '_x7C_');
}

// ---- Форматирование названия места ----
function formatSeatLabel(seatId) {
    const p = parseRedkId(seatId);
    return 'Ряд_' + p.row + '|' + p.seat + '-' + p.seat;
}

// ---- Рекурсивный сбор элементов ----
function collectElements(node, collections) {
    if (!node || !node.children) return;
    
    for (let i = 0; i < node.children.length; i++) {
        const el = node.children[i];
        
        if (el.tagName === 'g') {
            collectElements(el, collections);
            continue;
        }

        // Служебные элементы не контуры
        if (/^(defs|style|metadata|title|desc|script)$/i.test(el.tagName)) continue;
        
        if (isTextLabel(el)) {
            collections.texts.push(el);
            continue;
        }
        
        if (isBackgroundRect(el)) {
            collections.backgroundRects.push(el);
            continue;
        }
        
        if (isDecorationContour(el)) {
            collections.decorationContours.push(el);
            continue;
        }
        
        // Все остальное — потенциальные контуры секторов
        collections.otherContours.push(el);
    }
}

// ---- Проверка попадания точки в контур ----
function pointInContour(point, contourElement) {
    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.visibility = 'hidden';
        document.body.appendChild(svg);
        
        const clone = contourElement.cloneNode(true);
        svg.appendChild(clone);
        
        const pointObj = svg.createSVGPoint();
        pointObj.x = point.x;
        pointObj.y = point.y;
        
        const result = clone.isPointInFill(pointObj);
        document.body.removeChild(svg);
        return result;
    } catch (e) {
        console.warn('Ошибка проверки точки:', e);
        return false;
    }
}

// Площадь bbox контура, если он содержит точку, иначе null
function contourAreaIfContains(point, contourElement) {
    let svg = null;
    try {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.visibility = 'hidden';
        document.body.appendChild(svg);
        const clone = contourElement.cloneNode(true);
        svg.appendChild(clone);
        const pt = svg.createSVGPoint();
        pt.x = point.x;
        pt.y = point.y;
        if (!clone.isPointInFill(pt)) return null;
        const bb = clone.getBBox();
        return bb.width * bb.height;
    } catch (e) {
        return null;
    } finally {
        if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    }
}

function processRedk() {
    try {
        if (!redkSvgLoaded || !redkJsonLoaded) {
            throw new Error('Загрузите оба файла: schema.svg и schema.json');
        }

        const result = buildRedkSVG();
        
        if (!result) {
            throw new Error('Ошибка построения SVG');
        }
        
        showPreview(result);
        
        const totalSeats = redkJsonData ? redkJsonData.length : 0;
        const groups = groupSeatsBySectorName(redkJsonData);
        const sectorCount = Object.keys(groups).length;
        
        let msg = 'Готово: ' + totalSeats + ' мест, ' + sectorCount + ' секторов';
        if (redkStats) msg += '\nКонтуры секторов: по имени ' + redkStats.byName + ', по геометрии ' + redkStats.byGeometry + ', не найдено ' + redkStats.missing.length;
        setStatus(msg);
        document.getElementById('redk-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function buildRedkSVG() {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(redkSvgText, 'image/svg+xml');
    let svgRoot = svgDoc.documentElement;

    const ns = 'http://www.w3.org/2000/svg';
    const newSvg = document.createElementNS(ns, 'svg');
    
    ['viewBox', 'width', 'height', 'preserveAspectRatio'].forEach(attr => {
        if (svgRoot.hasAttribute(attr)) {
            newSvg.setAttribute(attr, svgRoot.getAttribute(attr));
        }
    });

    window.__redkVB = parseViewBox(svgRoot.getAttribute('viewBox'));
    redkCss = redkParseCss(svgDoc);
    redkStats = null;
    const collections = {
        texts: [],
        backgroundRects: [],
        decorationContours: [],
        otherContours: []
    };
    collectElements(svgRoot, collections);
    
    console.log('Найдено элементов:', {
        texts: collections.texts.length,
        background: collections.backgroundRects.length,
        decoration: collections.decorationContours.length,
        other: collections.otherContours.length
    });

    const seatsBySector = groupSeatsBySectorName(redkJsonData);

    const sectorToContourMap = new Map();
    const usedContours = new Set();

    // Контуры секторов по имени: контур подписан именем сектора
    const contourByName = new Map();
    collections.otherContours.forEach(el => {
        const dn = el.getAttribute('data-name') || '';
        if (dn.indexOf('SectorPreview.') === 0) {
            const n = dn.slice('SectorPreview.'.length);
            if (!contourByName.has(n)) contourByName.set(n, el);
        }
    });
    const stats = { byName: 0, byGeometry: 0, missing: [] };

    for (const [sectorName, seats] of Object.entries(seatsBySector)) {
        if (seats.length === 0) continue;
        
        let foundContour = contourByName.get(sectorName) || null;
        if (foundContour) {
            stats.byName++;
        } else {
            // Запасной вариант: контур по геометрии (по первому месту сектора)
            const testPoint = { x: seats[0].centerX, y: seats[0].centerY };
            // Из всех контуров, содержащих точку, берём самый маленький (внутренний)
            let bestArea = Infinity;
            for (let i = 0; i < collections.otherContours.length; i++) {
                const contour = collections.otherContours[i];
                const area = contourAreaIfContains(testPoint, contour);
                if (area !== null && area < bestArea) {
                    bestArea = area;
                    foundContour = contour;
                }
            }
            if (foundContour) stats.byGeometry++;
        }
        
        if (foundContour) {
            sectorToContourMap.set(sectorName, foundContour);
            usedContours.add(foundContour);
            console.log('Сектор ' + sectorName + ' -> найден контур');
        } else {
            console.warn('Для сектора ' + sectorName + ' контур не найден');
            stats.missing.push(sectorName);
        }
    }
    redkStats = stats;
    if (stats.missing.length) {
        addWarn('Нет контура у секторов (' + stats.missing.length + '): ' + stats.missing.slice(0, 8).join(', ') + (stats.missing.length > 8 ? '…' : ''));
    }

    // Места за пределами SVG: скорее всего файлы от разных наборов данных
    const vbox = window.__redkVB;
    if (vbox) {
        const outside = redkJsonData.filter(s => s.centerX < vbox[0] || s.centerY < vbox[1] || s.centerX > vbox[0] + vbox[2] || s.centerY > vbox[1] + vbox[3]).length;
        if (outside > 0) addWarn(outside + ' мест за пределами SVG (проверьте, что schema.svg и schema.json подходят друг к другу)');
    }

    // Стили из <style> нужны в итоговом файле: на них опираются заливки и обводки
    const styleNodes = svgDoc.querySelectorAll('style');
    if (styleNodes.length) {
        const defs = document.createElementNS(ns, 'defs');
        styleNodes.forEach(st => defs.appendChild(document.importNode(st, true)));
        newSvg.appendChild(defs);
    }

    const backgroundGroup = document.createElementNS(ns, 'g');
    backgroundGroup.setAttribute('id', 'Подложка_1');
    
    collections.decorationContours.forEach(contour => {
        const clone = svgCloneKeepPosition(contour);
        if (clone.hasAttribute('id')) {
            clone.removeAttribute('id');
        }
        backgroundGroup.appendChild(clone);
    });
    
    newSvg.appendChild(backgroundGroup);

    // Фиксированные настройки мест
    const stroke = REDK_STROKE_COLOR;
    const radius = seatR(REDK_SEAT_RADIUS);
    const strokeW = REDK_STROKE_WIDTH;

    for (let [sectorName, originalElement] of sectorToContourMap.entries()) {
        const sectorGroup = document.createElementNS(ns, 'g');
        const groupId = encodeForId(sectorName);
        sectorGroup.setAttribute('id', groupId);

        const contourClone = svgCloneKeepPosition(originalElement);
        contourClone.setAttribute('id', 'Контур_1');
        
        if (hasNoStrokeAndFill(contourClone)) {
            addBlackStroke(contourClone);
        }
        
        sectorGroup.appendChild(contourClone);

        const seats = seatsBySector[sectorName] || [];
        seats.forEach((seat) => {
            const cx = seat.centerX;
            const cy = seat.centerY;
            const circle = document.createElementNS(ns, 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', radius);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', stroke);
            circle.setAttribute('stroke-width', strokeW);

            const label = formatSeatLabel(seat.id);
            const encodedId = label;
            circle.setAttribute('id', encodedId);
            if (!redkCss['st1']) circle.setAttribute('class', 'st1'); // класс не должен перекрывать наши обводки

            sectorGroup.appendChild(circle);
        });

        newSvg.appendChild(sectorGroup);
    }

    const unusedContours = collections.otherContours.filter(c => !usedContours.has(c));
    if (unusedContours.length > 0) {
        const unusedGroup = document.createElementNS(ns, 'g');
        unusedGroup.setAttribute('id', 'Прочие_контуры');
        
        unusedContours.forEach(contour => {
            const clone = svgCloneKeepPosition(contour);
            if (hasNoStrokeAndFill(clone)) {
                addBlackStroke(clone);
            }
            unusedGroup.appendChild(clone);
        });
        
        newSvg.appendChild(unusedGroup);
    }

    if (collections.texts.length > 0) {
        const textsGroup = document.createElementNS(ns, 'g');
        textsGroup.setAttribute('id', 'Буквы_1');
        
        collections.texts.forEach(text => {
            const textClone = svgCloneKeepPosition(text);
            textsGroup.appendChild(textClone);
        });
        
        newSvg.appendChild(textsGroup);
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(newSvg);
}

function downloadRedk() {
    downloadCurrentResult('redk-scheme-final.svg');
}

function clearRedk() {
    redkSvgText = null;
    redkJsonData = null;
    redkSvgLoaded = false;
    redkJsonLoaded = false;
    
    document.getElementById('redk-link').value = '';
    redkWin = null;
    document.getElementById('redk-file').value = '';
    redkNames.svg = '';
    redkNames.json = '';
    redkRefreshUi();
    
    document.getElementById('redk-download').style.display = 'none';
    
    clearResult();
}

// Инициализация
document.addEventListener('DOMContentLoaded', initRedk);
