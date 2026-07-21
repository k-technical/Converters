let tsSvgContent = '';

// ============ ФУНКЦИЯ ДЛЯ СКАЧИВАНИЯ ============
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

// ============ ФУНКЦИИ ИЗ app.js ============
function setStatus(message, isError = false) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = isError ? 'stats error active' : 'stats active';
    }
}

function showPreview(svgContent) {
    const container = document.getElementById('previewContainer');
    if (container) {
        container.innerHTML = svgContent;
    }
    if (typeof currentSvgResult !== 'undefined') {
        currentSvgResult = svgContent;
    }
}

function handleError(error, fallbackMessage = 'Произошла ошибка') {
    const message = error.message || fallbackMessage;
    setStatus(message, true);
    console.error(error);
}

function downloadCurrentResult(filename) {
    if (typeof currentSvgResult === 'undefined' || !currentSvgResult) {
        setStatus('Нет результата для скачивания', true);
        return;
    }
    downloadSVG(currentSvgResult, filename);
}

function clearResult() {
    const container = document.getElementById('previewContainer');
    if (container) container.innerHTML = '';
    const status = document.getElementById('status');
    if (status) status.className = 'stats';
    if (typeof currentSvgResult !== 'undefined') {
        currentSvgResult = null;
    }
    document.querySelectorAll('[id$="-download"]').forEach(btn => {
        btn.style.display = 'none';
    });
}

// ============ ОСНОВНЫЕ ФУНКЦИИ ============

function getSeatRadius(svgContent) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const firstSeat = doc.querySelector('circle[tc-seat-no]');
        if (firstSeat) {
            const r = firstSeat.getAttribute('r');
            if (r) {
                return parseFloat(r);
            }
        }
        return null;
    } catch(e) {
        console.error('Ошибка в getSeatRadius:', e);
        return null;
    }
}

function scaleSVGDocument(svgContent, scaleFactor) {
    console.log('🔍 Масштабирование с коэффициентом:', scaleFactor);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.documentElement;
    
    // 1. Применяем transform
    svg.setAttribute('transform', `scale(${scaleFactor})`);
    
    // 2. Масштабируем width/height (если есть)
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (width && height) {
        svg.setAttribute('width', parseFloat(width) * scaleFactor);
        svg.setAttribute('height', parseFloat(height) * scaleFactor);
    }
    
    // 3. Масштабируем viewBox (если есть)
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            const [x, y, w, h] = parts;
            svg.setAttribute('viewBox', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
        }
    }
    
    // 4. НИЧЕГО БОЛЬШЕ НЕ ТРОГАЕМ!
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

function shrinkSeatsRadius(svgContent, shrinkFactor) {
    console.log('🔍 Уменьшение радиуса мест с коэффициентом:', shrinkFactor);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const seats = doc.querySelectorAll('circle[tc-seat-no]');
    
    console.log('  Найдено мест:', seats.length);
    let count = 0;
    
    seats.forEach(seat => {
        const r = seat.getAttribute('r');
        if (r) {
            const oldR = parseFloat(r);
            const newR = oldR * shrinkFactor;
            seat.setAttribute('r', newR.toString());
            count++;
        }
    });
    
    console.log('  Уменьшено мест:', count);
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

function formatSeatId(row, place) {
    return `Ряд_x5F_${row}_x7C_${place}-${place}`;
}

// ============ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ ============

function initTs() {
    const dropzone = document.getElementById('ts-dropzone');
    const fileInput = document.getElementById('ts-file');

    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#58a6ff';
            dropzone.style.background = 'rgba(88, 166, 255, 0.1)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '#30363d';
            dropzone.style.background = '#161b22';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#30363d';
            dropzone.style.background = '#161b22';
            
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.svg')) {
                readTsFile(file);
            } else {
                setStatus('Пожалуйста, выберите SVG файл', true);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) readTsFile(file);
        });
    }
}

function readTsFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        tsSvgContent = e.target.result;
        const dropzone = document.getElementById('ts-dropzone');
        if (dropzone) {
            dropzone.classList.add('active');
            dropzone.querySelector('p').textContent = `Файл: ${file.name}`;
        }
        
        const fileName = document.getElementById('ts-file-name');
        if (fileName) {
            fileName.textContent = `✓ Загружен: ${file.name}`;
            fileName.style.display = 'block';
        }
    };
    reader.readAsText(file);
}

// ============ ОСНОВНАЯ ФУНКЦИЯ ОБРАБОТКИ ============

function processTs() {
    try {
        if (!tsSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        console.log('==================== НАЧАЛО ОБРАБОТКИ ====================');

        // 1. Находим радиус места
        console.log('🔍 Поиск радиуса места...');
        const originalRadius = getSeatRadius(tsSvgContent);
        
        if (!originalRadius) {
            setStatus('❌ Не удалось определить радиус места (атрибут r)', true);
            return;
        }
        
        console.log('✅ Найден радиус:', originalRadius, 'px');

        // 2. Параметры
        const TARGET_RADIUS = 15; // Целевой радиус ДО уменьшения
        const SHRINK_FACTOR = 0.8; // Уменьшение на 20%
        
        const scaleFactor = TARGET_RADIUS / originalRadius;
        
        console.log('📊 Параметры:');
        console.log('  Исходный радиус:', originalRadius, 'px');
        console.log('  Целевой радиус (до уменьшения):', TARGET_RADIUS, 'px');
        console.log('  Финальный радиус:', TARGET_RADIUS * SHRINK_FACTOR, 'px');
        console.log('  Коэффициент масштаба:', scaleFactor.toFixed(4), 'x');

        // ============ ШАГ 1: СНАЧАЛА УМЕНЬШАЕМ МЕСТА ============
        console.log('⏳ Шаг 1: Уменьшение мест на 20%...');
        let processedSvg = shrinkSeatsRadius(tsSvgContent, SHRINK_FACTOR);
        console.log('✅ Уменьшение мест завершено');

        // ============ ШАГ 2: ПОТОМ МАСШТАБИРУЕМ СХЕМУ ============
        console.log('⏳ Шаг 2: Масштабирование схемы...');
        processedSvg = scaleSVGDocument(processedSvg, scaleFactor);
        console.log('✅ Масштабирование завершено');

        // 5. Проверяем финальный радиус
        const finalRadius = getSeatRadius(processedSvg);
        console.log('📏 Финальный числовой радиус:', finalRadius, 'px');

        // 6. Дальнейшая обработка (ID, стили и т.д.)
        const parser = new DOMParser();
        const doc = parser.parseFromString(processedSvg, 'image/svg+xml');
        
        let seatCount = 0;
        let contourCount = 0;

        const allRowGroups = doc.querySelectorAll('[tc-row-no]');
        const sectors = new Map();
        
        allRowGroups.forEach(row => {
            const parent = row.parentNode;
            if (parent) {
                const parentId = parent.id || 'unknown';
                if (!sectors.has(parentId)) {
                    sectors.set(parentId, []);
                }
                sectors.get(parentId).push(row);
            }
        });

        sectors.forEach((rows) => {
            const parent = rows[0].parentNode;
            const seatsWithRows = [];
            
            rows.forEach(row => {
                const rowNo = row.getAttribute('tc-row-no');
                const seats = row.querySelectorAll('circle[tc-seat-no]');
                
                seats.forEach(seat => {
                    const seatNo = seat.getAttribute('tc-seat-no');
                    seatsWithRows.push({
                        element: seat,
                        rowNo: rowNo,
                        seatNo: seatNo
                    });
                });
            });

            rows.forEach(row => row.remove());

            seatsWithRows.forEach(({element, rowNo, seatNo}) => {
                const newId = formatSeatId(rowNo, seatNo);
                element.setAttribute('id', newId);
                element.setAttribute('fill', 'none');
                element.setAttribute('stroke', '#AEAEAE');
                element.setAttribute('stroke-width', '1');
                seatCount++;
                parent.appendChild(element);
            });
        });

        const allElements = doc.querySelectorAll('[id]');
        allElements.forEach(elem => {
            const oldId = elem.getAttribute('id');
            if (oldId && oldId.includes('Контур_') && !oldId.includes('Ряд_x5F_')) {
                const match = oldId.match(/(Контур_\d+)/);
                if (match && match[1] !== oldId) {
                    elem.setAttribute('id', match[1]);
                    contourCount++;
                }
            }
        });

        const serializer = new XMLSerializer();
        let finalSvg = serializer.serializeToString(doc.documentElement);
        finalSvg = finalSvg.replace(/xmlns:ns\d+="[^"]*"/g, '');

        showPreview(finalSvg);
        
        setStatus(
            `✅ Обработано: ${seatCount} мест, ${contourCount} контуров, ` +
            `финальный радиус: ${finalRadius}px`
        );
        
        const downloadBtn = document.getElementById('ts-download');
        if (downloadBtn) {
            downloadBtn.style.display = 'block';
        }
        
        console.log('==================== ОБРАБОТКА ЗАВЕРШЕНА ====================');

    } catch (e) {
        handleError(e);
        console.error('❌ Ошибка в processTs:', e);
    }
}

function downloadTs() {
    downloadCurrentResult('ts-schema-cleaned.svg');
}

function clearTs() {
    tsSvgContent = '';
    const fileInput = document.getElementById('ts-file');
    if (fileInput) fileInput.value = '';
    const dropzone = document.getElementById('ts-dropzone');
    if (dropzone) {
        dropzone.classList.remove('active');
        dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    }
    const fileName = document.getElementById('ts-file-name');
    if (fileName) fileName.style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initTs);
