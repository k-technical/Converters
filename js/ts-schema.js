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

// ============ ФУНКЦИИ ИЗ app.js (дублируем для автономности) ============
let currentSvgResult = null;

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
    currentSvgResult = svgContent;
}

function handleError(error, fallbackMessage = 'Произошла ошибка') {
    const message = error.message || fallbackMessage;
    setStatus(message, true);
    console.error(error);
}

function downloadCurrentResult(filename) {
    if (!currentSvgResult) {
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
    currentSvgResult = null;
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
    console.log('🔍 Масштабирование схемы с коэффициентом:', scaleFactor);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.documentElement;
    
    // Масштабируем width/height
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (width && height) {
        const w = parseFloat(width);
        const h = parseFloat(height);
        if (!isNaN(w) && !isNaN(h)) {
            svg.setAttribute('width', w * scaleFactor);
            svg.setAttribute('height', h * scaleFactor);
            console.log('  width:', w, '→', w * scaleFactor);
            console.log('  height:', h, '→', h * scaleFactor);
        }
    }
    
    // Масштабируем viewBox (главный способ!)
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            const [x, y, w, h] = parts;
            svg.setAttribute('viewBox', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
            console.log('  viewBox:', viewBox, '→', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
        }
    } else {
        console.warn('⚠️ viewBox не найден, создаем на основе размеров...');
        // Создаем viewBox из width/height
        const w = parseFloat(svg.getAttribute('width')) || 800;
        const h = parseFloat(svg.getAttribute('height')) || 600;
        svg.setAttribute('viewBox', `0 0 ${w * scaleFactor} ${h * scaleFactor}`);
    }
    
    // ⚠️ НЕ ТРОГАЕМ КООРДИНАТЫ ЭЛЕМЕНТОВ - они остаются на месте!
    // Масштабирование происходит через viewBox
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

function shrinkSeatsRadius(svgContent, shrinkFactor = 0.8) {
    console.log('🔍 Уменьшение радиуса мест на', (1 - shrinkFactor) * 100, '%');
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

        if (originalRadius === 0) {
            setStatus('❌ Радиус места равен 0', true);
            return;
        }

        // 2. Вычисляем коэффициент
        const TARGET_RADIUS = 15;
        const scaleFactor = TARGET_RADIUS / originalRadius;
        
        console.log('📊 Параметры:');
        console.log('  Исходный радиус:', originalRadius, 'px');
        console.log('  Целевой радиус:', TARGET_RADIUS, 'px');
        console.log('  Коэффициент масштаба:', scaleFactor.toFixed(4), 'x');

        // 3. Шаг 1: Масштабируем схему через viewBox
        console.log('⏳ Шаг 1: Масштабирование схемы...');
        let processedSvg = scaleSVGDocument(tsSvgContent, scaleFactor);
        console.log('✅ Масштабирование завершено');

        // 4. Шаг 2: Уменьшаем радиус каждого места на 20%
        const SHRINK_FACTOR = 0.8;
        console.log('⏳ Шаг 2: Уменьшение радиуса мест на 20%...');
        processedSvg = shrinkSeatsRadius(processedSvg, SHRINK_FACTOR);
        console.log('✅ Уменьшение мест завершено');

        // 5. Проверяем финальный радиус
        const finalRadius = getSeatRadius(processedSvg);
        console.log('📏 Финальный радиус:', finalRadius, 'px');

        // 6. Обрабатываем ID и стили (как раньше)
        const parser = new DOMParser();
        const doc = parser.parseFromString(processedSvg, 'image/svg+xml');
        
        let seatCount = 0;
        let contourCount = 0;

        const allRowGroups = doc.querySelectorAll('[tc-row-no]');
        console.log('🔍 Найдено групп с tc-row-no:', allRowGroups.length);
        
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
        
        console.log('📂 Найдено секторов:', sectors.size);

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

        // 7. Показываем результат
        showPreview(finalSvg);
        
        setStatus(
            `✅ Обработано: ${seatCount} мест, ${contourCount} контуров, ` +
            `масштаб: ${scaleFactor.toFixed(2)}x, финальный радиус: ${finalRadius}px`
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
