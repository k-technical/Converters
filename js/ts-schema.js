let tsSvgContent = '';

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (добавлены сюда) ============

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
    
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (width && height) {
        svg.setAttribute('width', parseFloat(width) * scaleFactor);
        svg.setAttribute('height', parseFloat(height) * scaleFactor);
    }
    
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            const [x, y, w, h] = parts;
            svg.setAttribute('viewBox', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
        }
    }
    
    const elements = doc.querySelectorAll('[cx], [cy], [r], [x], [y], [width], [height]');
    elements.forEach(el => {
        ['cx', 'cy', 'r', 'x', 'y', 'width', 'height'].forEach(attr => {
            if (el.hasAttribute(attr)) {
                const value = parseFloat(el.getAttribute(attr));
                if (!isNaN(value)) {
                    el.setAttribute(attr, (value * scaleFactor).toString());
                }
            }
        });
    });
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

function shrinkSeats(svgContent, shrinkFactor = 0.8) {
    console.log('🔍 Уменьшение мест с коэффициентом:', shrinkFactor);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const seats = doc.querySelectorAll('circle[tc-seat-no]');
    
    seats.forEach(seat => {
        const r = seat.getAttribute('r');
        if (r) {
            seat.setAttribute('r', (parseFloat(r) * shrinkFactor).toString());
        }
    });
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

// ============ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ ============

function initTs() {
    const dropzone = document.getElementById('ts-dropzone');
    const fileInput = document.getElementById('ts-file');

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

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readTsFile(file);
    });
}

function readTsFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        tsSvgContent = e.target.result;
        const dropzone = document.getElementById('ts-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = `Файл: ${file.name}`;
        
        const fileName = document.getElementById('ts-file-name');
        fileName.textContent = `✓ Загружен: ${file.name}`;
        fileName.style.display = 'block';
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
        console.log('📄 Длина исходного SVG:', tsSvgContent.length, 'символов');

        // 1. Определяем радиус места
        console.log('🔍 Поиск радиуса места...');
        const originalRadius = getSeatRadius(tsSvgContent);
        
        if (!originalRadius) {
            setStatus('Не удалось определить радиус места (атрибут r)', true);
            console.error('❌ Радиус не найден');
            return;
        }
        
        console.log('✅ Найден радиус:', originalRadius, 'px');

        // 2. Проверяем, что радиус не нулевой
        if (originalRadius === 0) {
            setStatus('Радиус места равен 0. Проверьте SVG файл', true);
            console.error('❌ Радиус равен 0');
            return;
        }

        // 3. Вычисляем коэффициент масштабирования
        const TARGET_RADIUS = 15;
        const scaleFactor = TARGET_RADIUS / originalRadius;
        
        console.log('📊 Параметры масштабирования:');
        console.log('  Исходный радиус:', originalRadius, 'px');
        console.log('  Целевой радиус:', TARGET_RADIUS, 'px');
        console.log('  Коэффициент:', scaleFactor.toFixed(4), 'x');

        // 4. Этап 1: Масштабируем всю схему
        console.log('⏳ Шаг 1: Масштабирование схемы...');
        let processedSvg = scaleSVGDocument(tsSvgContent, scaleFactor);
        console.log('✅ Масштабирование завершено');

        // 5. Этап 2: Уменьшаем каждое место на 20%
        const SHRINK_FACTOR = 0.8;
        console.log('⏳ Шаг 2: Уменьшение мест на', (1 - SHRINK_FACTOR) * 100, '%...');
        processedSvg = shrinkSeats(processedSvg, SHRINK_FACTOR);
        console.log('✅ Уменьшение мест завершено');

        // 6. Проверяем финальный радиус
        const finalRadius = getSeatRadius(processedSvg);
        console.log('📏 Финальный радиус:', finalRadius, 'px');

        // 7. Парсим обработанный SVG для дальнейшей обработки
        const parser = new DOMParser();
        const doc = parser.parseFromString(processedSvg, 'image/svg+xml');
        
        let seatCount = 0;
        let contourCount = 0;

        // 8. Группировка по секторам
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

        // 9. Обработка каждого сектора
        sectors.forEach((rows, sectorName) => {
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

            // Удаляем ряды
            rows.forEach(row => row.remove());

            // Добавляем места напрямую в сектор
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

        // 10. Очистка ID контуров
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

        // 11. Сериализация и очистка
        const serializer = new XMLSerializer();
        let finalSvg = serializer.serializeToString(doc.documentElement);
        finalSvg = finalSvg.replace(/xmlns:ns\d+="[^"]*"/g, '');

        // 12. Показываем результат
        showPreview(finalSvg);
        
        setStatus(
            `✅ Обработано: ${seatCount} мест, ${contourCount} контуров, ` +
            `масштаб: ${scaleFactor.toFixed(2)}x, финальный радиус: ${finalRadius}px`
        );
        
        document.getElementById('ts-download').style.display = 'block';
        
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
    document.getElementById('ts-file').value = '';
    const dropzone = document.getElementById('ts-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    document.getElementById('ts-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initTs);
