// ============ СУЩЕСТВУЮЩИЕ ФУНКЦИИ ============
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

function formatSeatId(row, place) {
    return `Ряд_x5F_${row}_x7C_${place}-${place}`;
}

function parseSVG(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const error = doc.querySelector('parsererror');
    if (error) {
        throw new Error('Невалидный SVG');
    }
    return doc;
}

function serializeSVG(doc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

// ============ НОВЫЕ ФУНКЦИИ ДЛЯ МАСШТАБИРОВАНИЯ ============

/**
 * Масштабирование всей SVG схемы
 * @param {string} svgContent - содержимое SVG
 * @param {number} scaleFactor - коэффициент масштабирования
 * @returns {string} - масштабированный SVG
 */
function scaleSVGDocument(svgContent, scaleFactor) {
    const doc = parseSVG(svgContent);
    const svg = doc.documentElement;
    
    // Применяем трансформацию ко всему SVG
    const currentTransform = svg.getAttribute('transform') || '';
    svg.setAttribute('transform', `${currentTransform} scale(${scaleFactor})`.trim());
    
    // Масштабируем viewBox
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            const [x, y, width, height] = parts;
            svg.setAttribute('viewBox', `${x} ${y} ${width * scaleFactor} ${height * scaleFactor}`);
        }
    }
    
    // Масштабируем width/height если есть
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (width && height) {
        svg.setAttribute('width', parseFloat(width) * scaleFactor);
        svg.setAttribute('height', parseFloat(height) * scaleFactor);
    }
    
    return serializeSVG(doc);
}

/**
 * Уменьшение каждого места на заданный процент
 * @param {string} svgContent - содержимое SVG
 * @param {number} shrinkFactor - коэффициент уменьшения (0.8 = 80%)
 * @returns {string} - SVG с уменьшенными местами
 */
function shrinkSeats(svgContent, shrinkFactor = 0.8) {
    const doc = parseSVG(svgContent);
    const seats = doc.querySelectorAll('circle[tc-seat-no]');
    
    seats.forEach(seat => {
        const r = seat.getAttribute('r');
        if (r) {
            const newR = parseFloat(r) * shrinkFactor;
            seat.setAttribute('r', newR.toString());
            // cx и cy остаются без изменений = уменьшение относительно центра
        }
    });
    
    return serializeSVG(doc);
}

/**
 * Определение радиуса места в SVG
 * @param {string} svgContent - содержимое SVG
 * @returns {number|null} - радиус в пикселях или null
 */
function getSeatRadius(svgContent) {
    const doc = parseSVG(svgContent);
    const firstSeat = doc.querySelector('circle[tc-seat-no]');
    
    if (firstSeat) {
        const r = firstSeat.getAttribute('r');
        if (r) {
            return parseFloat(r);
        }
    }
    return null;
}
