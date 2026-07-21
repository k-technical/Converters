let tsSvgContent = '';

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

        // 1. Определяем радиус места
        const originalRadius = getSeatRadius(tsSvgContent);
        if (!originalRadius) {
            setStatus('Не удалось определить радиус места (атрибут r)', true);
            return;
        }

        // 2. Проверяем, что радиус не нулевой
        if (originalRadius === 0) {
            setStatus('Радиус места равен 0. Проверьте SVG файл', true);
            return;
        }

        // 3. Вычисляем коэффициент масштабирования
        const TARGET_RADIUS = 15;
        const scaleFactor = TARGET_RADIUS / originalRadius;
        
        console.log('📏 Исходный радиус:', originalRadius, 'px');
        console.log('🎯 Целевой радиус:', TARGET_RADIUS, 'px');
        console.log('📐 Коэффициент масштаба:', scaleFactor.toFixed(4), 'x');

        // 4. Этап 1: Масштабируем всю схему
        console.log('⏳ Масштабирование схемы...');
        let processedSvg = scaleSVGDocument(tsSvgContent, scaleFactor);

        // 5. Этап 2: Уменьшаем каждое место на 20%
        const SHRINK_FACTOR = 0.8; // 100% → 80%
        console.log('⏳ Уменьшение мест на 20%...');
        processedSvg = shrinkSeats(processedSvg, SHRINK_FACTOR);

        // 6. Парсим обработанный SVG
        const doc = parseSVG(processedSvg);
        
        let seatCount = 0;
        let contourCount = 0;

        // 7. Группировка по секторам
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

        // 8. Обработка каждого сектора
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

        // 9. Очистка ID контуров
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

        // 10. Сериализация и очистка
        let finalSvg = serializeSVG(doc);
        finalSvg = finalSvg.replace(/xmlns:ns\d+="[^"]*"/g, '');

        // 11. Показываем результат
        showPreview(finalSvg);
        
        // Проверяем финальный радиус (для отладки)
        const finalRadius = getSeatRadius(finalSvg);
        console.log('✅ Финальный радиус места:', finalRadius, 'px');
        
        setStatus(
            `✅ Обработано: ${seatCount} мест, ${contourCount} контуров, ` +
            `масштаб: ${scaleFactor.toFixed(2)}x, места уменьшены на 20%`
        );
        
        document.getElementById('ts-download').style.display = 'block';

    } catch (e) {
        handleError(e);
        console.error('Ошибка в processTs:', e);
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
