// Инициализация TS.Schema
function initTs() {
    const dropzone = document.getElementById('ts-dropzone');
    const fileInput = document.getElementById('ts-file');
    const svgInput = document.getElementById('ts-svg');

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
        document.getElementById('ts-svg').value = e.target.result;
        const dropzone = document.getElementById('ts-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = `Файл: ${file.name}`;
    };
    reader.readAsText(file);
}

// Обработка TS.Schema
function processTs() {
    try {
        let svgContent = document.getElementById('ts-svg').value.trim();
        
        if (!svgContent) {
            throw new Error('Загрузите SVG файл или вставьте код');
        }

        const doc = parseSVG(svgContent);
        
        let seatCount = 0;
        let contourCount = 0;

        // Поиск групп с рядами
        const allRowGroups = doc.querySelectorAll('[tc-row-no]');

        // Группировка рядов по родительским секторам
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

        // Обработка каждого сектора
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

            // Убираем группы рядов
            rows.forEach(row => row.remove());

            // Переносим места в сектор с новыми ID
            seatsWithRows.forEach(({element, rowNo, seatNo}) => {
                const newId = formatSeatId(rowNo, seatNo);
                element.setAttribute('id', newId);
                seatCount++;
                parent.appendChild(element);
            });
        });

        // Очистка ID контуров
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

        let processedSvg = serializeSVG(doc);
        processedSvg = processedSvg.replace(/xmlns:ns\d+="[^"]*"/g, '');

        showPreview(processedSvg);
        setStatus(`✓ Обработано: ${seatCount} мест, ${contourCount} контуров`);
        
        document.getElementById('ts-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function downloadTs() {
    downloadCurrentResult('ts-schema-cleaned.svg');
}

function clearTs() {
    document.getElementById('ts-svg').value = '';
    document.getElementById('ts-file').value = '';
    const dropzone = document.getElementById('ts-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    clearResult();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initTs);
