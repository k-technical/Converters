// T-Land Schema - группировка мест по секторам
let tlandSvgContent = '';

function initTland() {
    const dropzone = document.getElementById('tland-dropzone');
    const fileInput = document.getElementById('tland-file');

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
        if (file && (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
            readTlandFile(file);
        } else {
            setStatus('Пожалуйста, загрузите SVG файл', true);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readTlandFile(file);
    });
}

function readTlandFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        tlandSvgContent = e.target.result;
        const dropzone = document.getElementById('tland-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = `Файл: ${file.name}`;
        
        const fileName = document.getElementById('tland-file-name');
        fileName.textContent = `✓ Загружен: ${file.name}`;
        fileName.style.display = 'block';
        
        setStatus(`Файл "${file.name}" загружен, ${tlandSvgContent.length} символов`);
    };
    reader.onerror = () => {
        setStatus('Ошибка чтения файла', true);
    };
    reader.readAsText(file);
}

function processTland() {
    try {
        if (!tlandSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        const result = processTlandSVG(tlandSvgContent);
        
        if (result.count === 0) {
            throw new Error('Не найдено ни одного элемента с атрибутами section и seat');
        }
        
        showPreview(result.svg);
        
        // Формируем детальную статистику
        let statsText = `✓ Обработано: ${result.count} мест, ${result.sectors} секторов`;
        if (result.sectorStats && result.sectorStats.length > 0) {
            const details = result.sectorStats.map(s => `${s.name} (${s.count})`).join(', ');
            statsText += `\n📊 ${details}`;
        }
        setStatus(statsText);
        document.getElementById('tland-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function processTlandSVG(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;

    // Проверка на ошибки парсинга
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
        throw new Error('Невалидный SVG файл');
    }

    // Находим все элементы с атрибутами section и seat (rect, circle, path)
    const elements = root.querySelectorAll('[section][seat]');
    
    if (elements.length === 0) {
        return { svg: svgText, count: 0, sectors: 0, sectorNames: [], sectorStats: [] };
    }

    // Группируем по сектору
    const sectorGroups = new Map();
    const processedElements = [];

    elements.forEach(el => {
        const section = el.getAttribute('section');
        const seat = el.getAttribute('seat');
        const row = el.getAttribute('row') || '1';
        const elId = el.getAttribute('id') || `place_${seat || 'unknown'}`;

        if (!section || seat === null) {
            return;
        }

        // Формируем новое название: Ряд_X|N-N
        const newName = formatSeatId(row, seat);
        
        // Определяем тип элемента и его размеры
        const tagName = el.tagName.toLowerCase();
        let cx, cy, radius = 6; // дефолтный радиус
        
        if (tagName === 'rect') {
            const x = parseFloat(el.getAttribute('x') || 0);
            const y = parseFloat(el.getAttribute('y') || 0);
            const width = parseFloat(el.getAttribute('width') || 0);
            const height = parseFloat(el.getAttribute('height') || 0);
            cx = x + width / 2;
            cy = y + height / 2;
            // Радиус = половина меньшей стороны (чтобы круг вписался в прямоугольник)
            radius = Math.min(width, height) / 2;
            if (isNaN(radius) || radius <= 0) radius = 5;
        } else if (tagName === 'circle') {
            cx = parseFloat(el.getAttribute('cx') || 0);
            cy = parseFloat(el.getAttribute('cy') || 0);
            radius = parseFloat(el.getAttribute('r') || 0);
            if (isNaN(radius) || radius <= 0) radius = 5;
        } else if (tagName === 'path') {
            // Для path пытаемся найти координаты из атрибутов
            cx = parseFloat(el.getAttribute('cx') || 0);
            cy = parseFloat(el.getAttribute('cy') || 0);
            // Пробуем найти радиус из атрибута r или data-radius
            radius = parseFloat(el.getAttribute('r') || el.getAttribute('data-radius') || 0);
            if (isNaN(radius) || radius <= 0) radius = 5;
        } else {
            // Другие элементы: пытаемся найти координаты
            cx = parseFloat(el.getAttribute('cx') || el.getAttribute('x') || 0);
            cy = parseFloat(el.getAttribute('cy') || el.getAttribute('y') || 0);
            radius = parseFloat(el.getAttribute('r') || 0);
            if (isNaN(radius) || radius <= 0) radius = 5;
        }
        
        // Если координаты не найдены, пропускаем элемент
        if (isNaN(cx) || isNaN(cy)) {
            return;
        }
        
        // Создаём КРУГ с сохранением исходного размера
        const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#AEAEAE');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('id', newName);
        circle.setAttribute('data-original-id', elId);
        circle.setAttribute('data-seat', seat);
        circle.setAttribute('data-row', row);
        circle.setAttribute('data-section', section);
        
        // Добавляем title для тултипа
        const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${section} | Ряд ${row} | Место ${seat}`;
        circle.appendChild(title);
        
        // Добавляем в группу сектора
        if (!sectorGroups.has(section)) {
            sectorGroups.set(section, []);
        }
        sectorGroups.get(section).push(circle);
        processedElements.push(el);
    });

    // Удаляем старые элементы
    processedElements.forEach(el => {
        if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    });

    // Создаём группы для секторов
    const sortedSectors = Array.from(sectorGroups.keys()).sort((a, b) => {
        // Пробуем сортировать как числа, если это числа
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b, 'ru');
    });
    
    const sectorNames = [];
    const sectorStats = [];
    
    sortedSectors.forEach(sectionName => {
        const seats = sectorGroups.get(sectionName);
        if (seats.length === 0) return;
        
        // Сортируем места по номеру
        seats.sort((a, b) => {
            const seatA = parseInt(a.getAttribute('data-seat') || '0', 10);
            const seatB = parseInt(b.getAttribute('data-seat') || '0', 10);
            return seatA - seatB;
        });
        
        // Создаём группу
        const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
        // Делаем безопасное имя для id
        const safeId = sectionName.replace(/[^a-zA-Z0-9_\-\u0400-\u04FF]/g, '_');
        g.setAttribute('id', safeId);
        g.setAttribute('data-sector', sectionName);
        g.setAttribute('class', 'sector-group');
        
        // Добавляем все места
        seats.forEach(seat => {
            g.appendChild(seat);
        });
        
        root.appendChild(g);
        sectorNames.push(sectionName);
        sectorStats.push({
            name: sectionName,
            count: seats.length
        });
    });

    // Сериализуем
    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(doc);
    
    // Очищаем от лишних namespace
    result = result.replace(/xmlns:ns\d+="[^"]*"/g, '');

    // Подсчитываем общее количество мест
    let totalSeats = 0;
    for (const [_, seats] of sectorGroups) {
        totalSeats += seats.length;
    }

    return {
        svg: result,
        count: totalSeats,
        sectors: sectorGroups.size,
        sectorNames: sectorNames,
        sectorStats: sectorStats
    };
}

function downloadTland() {
    downloadCurrentResult('tland-grouped.svg');
}

function clearTland() {
    tlandSvgContent = '';
    document.getElementById('tland-file').value = '';
    const dropzone = document.getElementById('tland-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    document.getElementById('tland-file-name').style.display = 'none';
    clearResult();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initTland);