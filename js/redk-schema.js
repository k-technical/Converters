// Red-K Schema - финальный сборщик схемы
let redkSvgText = null;
let redkJsonData = null;
let redkSvgLoaded = false;
let redkJsonLoaded = false;

// Настройки мест (фиксированные)
const REDK_STROKE_COLOR = '#AEAEAE';
const REDK_SEAT_RADIUS = 12;
const REDK_STROKE_WIDTH = 1;

function initRedk() {
    // SVG загрузка
    const svgDropzone = document.getElementById('redk-svg-dropzone');
    const svgFileInput = document.getElementById('redk-svg-file');
    
    svgDropzone.addEventListener('click', () => svgFileInput.click());
    
    svgDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        svgDropzone.style.borderColor = '#58a6ff';
        svgDropzone.style.background = 'rgba(88, 166, 255, 0.1)';
    });
    
    svgDropzone.addEventListener('dragleave', () => {
        svgDropzone.style.borderColor = '#30363d';
        svgDropzone.style.background = '#161b22';
    });
    
    svgDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        svgDropzone.style.borderColor = '#30363d';
        svgDropzone.style.background = '#161b22';
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
            readRedkSvgFile(file);
        } else {
            setStatus('Загрузите SVG файл', true);
        }
    });
    
    svgFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readRedkSvgFile(file);
    });
    
    // JSON загрузка
    const jsonDropzone = document.getElementById('redk-json-dropzone');
    const jsonFileInput = document.getElementById('redk-json-file');
    
    jsonDropzone.addEventListener('click', () => jsonFileInput.click());
    
    jsonDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        jsonDropzone.style.borderColor = '#58a6ff';
        jsonDropzone.style.background = 'rgba(88, 166, 255, 0.1)';
    });
    
    jsonDropzone.addEventListener('dragleave', () => {
        jsonDropzone.style.borderColor = '#30363d';
        jsonDropzone.style.background = '#161b22';
    });
    
    jsonDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        jsonDropzone.style.borderColor = '#30363d';
        jsonDropzone.style.background = '#161b22';
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.json')) {
            readRedkJsonFile(file);
        } else {
            setStatus('Загрузите JSON файл', true);
        }
    });
    
    jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readRedkJsonFile(file);
    });
}

function readRedkSvgFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        redkSvgText = e.target.result;
        redkSvgLoaded = true;
        
        const dropzone = document.getElementById('redk-svg-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = file.name;
        
        const fileName = document.getElementById('redk-svg-file-name');
        fileName.textContent = 'Загружен: ' + file.name;
        fileName.style.display = 'block';
        
        updateRedkStatus();
    };
    reader.onerror = () => {
        setStatus('Ошибка чтения SVG файла', true);
    };
    reader.readAsText(file);
}

function readRedkJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            redkJsonData = JSON.parse(e.target.result);
            if (!Array.isArray(redkJsonData)) {
                throw new Error('JSON должен быть массивом');
            }
            redkJsonLoaded = true;
            
            const dropzone = document.getElementById('redk-json-dropzone');
            dropzone.classList.add('active');
            dropzone.querySelector('p').textContent = file.name;
            
            const fileName = document.getElementById('redk-json-file-name');
            fileName.textContent = 'Загружен: ' + file.name + ' (' + redkJsonData.length + ' мест)';
            fileName.style.display = 'block';
            
            updateRedkStatus();
        } catch (err) {
            setStatus('Ошибка JSON: ' + err.message, true);
            redkJsonLoaded = false;
        }
    };
    reader.onerror = () => {
        setStatus('Ошибка чтения JSON файла', true);
    };
    reader.readAsText(file);
}

function updateRedkStatus() {
    if (redkSvgLoaded && redkJsonLoaded) {
        setStatus('Готово: SVG + JSON (' + redkJsonData.length + ' мест). Нажмите "Построить схему"');
    } else if (redkSvgLoaded) {
        setStatus('SVG загружен, ожидается JSON');
    } else if (redkJsonLoaded) {
        setStatus('JSON загружен, ожидается SVG');
    } else {
        setStatus('Ожидание загрузки файлов');
    }
}

// ---- Проверка, является ли элемент фоновым прямоугольником ----
function isBackgroundRect(element) {
    if (element.tagName !== 'rect') return false;
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    const style = element.getAttribute('style') || '';
    return width === '5500' && height === '4000' && style.includes('fill: #eeeff4');
}

// ---- Проверка, является ли элемент декоративным контуром подложки ----
function isDecorationContour(element) {
    const style = element.getAttribute('style') || '';
    const fill = element.getAttribute('fill') || '';
    const stroke = element.getAttribute('stroke') || '';
    
    return (style.includes('fill: #fff') || style.includes('fill: #FFFFFF') || fill === '#fff' || fill === '#FFFFFF') &&
           (style.includes('stroke: #eeeff4') || style.includes('stroke: #EEEEF4') || stroke === '#eeeff4' || stroke === '#EEEEF4');
}

// ---- Проверка, является ли элемент текстовой подписью ----
function isTextLabel(element) {
    return element.tagName === 'text';
}

// ---- Проверка, есть ли у элемента обводка/заливка ----
function hasNoStrokeAndFill(element) {
    const style = element.getAttribute('style') || '';
    const stroke = element.getAttribute('stroke') || '';
    const fill = element.getAttribute('fill') || '';
    
    const hasNoStroke = !stroke && !style.includes('stroke:');
    const hasNoFill = (!fill || fill === 'none') && !style.includes('fill:');
    
    return hasNoStroke && hasNoFill;
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

// ---- Группировка мест по секторам ----
function groupSeatsBySectorName(seatsArray) {
    const groups = {};
    seatsArray.forEach(item => {
        const match = item.id.match(/sector\.([^.]+)\./);
        let sector = match ? match[1] : 'unknown';
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
    const idParts = seatId.split('.');
    const rowPart = idParts[idParts.indexOf('row') + 1] || '-';
    const seatPart = idParts[idParts.indexOf('seat') + 1] || '-';
    return 'Ряд_' + rowPart + '|' + seatPart + '-' + seatPart;
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

function processRedk() {
    try {
        if (!redkSvgLoaded || !redkJsonLoaded) {
            throw new Error('Загрузите оба файла: schema.svg и schema.json');
        }

        const result = buildRedkSVG();
        
        if (!result) {
            throw new Error('Ошибка построения схемы');
        }
        
        showPreview(result);
        
        const totalSeats = redkJsonData ? redkJsonData.length : 0;
        const groups = groupSeatsBySectorName(redkJsonData);
        const sectorCount = Object.keys(groups).length;
        
        setStatus('Готово: ' + totalSeats + ' мест, ' + sectorCount + ' секторов');
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

    for (const [sectorName, seats] of Object.entries(seatsBySector)) {
        if (seats.length === 0) continue;
        
        const testPoint = { x: seats[0].centerX, y: seats[0].centerY };
        let foundContour = null;
        
        for (let i = 0; i < collections.otherContours.length; i++) {
            const contour = collections.otherContours[i];
            if (pointInContour(testPoint, contour)) {
                foundContour = contour;
                break;
            }
        }
        
        if (foundContour) {
            sectorToContourMap.set(sectorName, foundContour);
            usedContours.add(foundContour);
            console.log('Сектор ' + sectorName + ' -> найден контур');
        } else {
            console.warn('Для сектора ' + sectorName + ' контур не найден');
        }
    }

    const backgroundGroup = document.createElementNS(ns, 'g');
    backgroundGroup.setAttribute('id', 'Подложка_1');
    
    collections.decorationContours.forEach(contour => {
        const clone = contour.cloneNode(true);
        if (clone.hasAttribute('id')) {
            clone.removeAttribute('id');
        }
        backgroundGroup.appendChild(clone);
    });
    
    newSvg.appendChild(backgroundGroup);

    // Фиксированные настройки мест
    const stroke = REDK_STROKE_COLOR;
    const radius = REDK_SEAT_RADIUS;
    const strokeW = REDK_STROKE_WIDTH;

    for (let [sectorName, originalElement] of sectorToContourMap.entries()) {
        const sectorGroup = document.createElementNS(ns, 'g');
        const groupId = encodeForId(sectorName);
        sectorGroup.setAttribute('id', groupId);

        const contourClone = originalElement.cloneNode(true);
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
            const encodedId = encodeForId(label);
            circle.setAttribute('id', encodedId);
            circle.setAttribute('class', 'st1');

            sectorGroup.appendChild(circle);
        });

        newSvg.appendChild(sectorGroup);
    }

    const unusedContours = collections.otherContours.filter(c => !usedContours.has(c));
    if (unusedContours.length > 0) {
        const unusedGroup = document.createElementNS(ns, 'g');
        unusedGroup.setAttribute('id', 'Прочие_контуры');
        
        unusedContours.forEach(contour => {
            const clone = contour.cloneNode(true);
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
            const textClone = text.cloneNode(true);
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
    
    document.getElementById('redk-svg-file').value = '';
    document.getElementById('redk-json-file').value = '';
    
    const svgDropzone = document.getElementById('redk-svg-dropzone');
    svgDropzone.classList.remove('active');
    svgDropzone.querySelector('p').textContent = 'Загрузите schema.svg';
    
    const jsonDropzone = document.getElementById('redk-json-dropzone');
    jsonDropzone.classList.remove('active');
    jsonDropzone.querySelector('p').textContent = 'Загрузите schema.json';
    
    document.getElementById('redk-svg-file-name').style.display = 'none';
    document.getElementById('redk-json-file-name').style.display = 'none';
    
    document.getElementById('redk-download').style.display = 'none';
    
    clearResult();
    setStatus('Ожидание загрузки файлов');
}

// Инициализация
document.addEventListener('DOMContentLoaded', initRedk);