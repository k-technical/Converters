// ============ НОВАЯ ВЕРСИЯ С ОТЛАДКОЙ ============

/**
 * Масштабирование всей SVG схемы
 */
function scaleSVGDocument(svgContent, scaleFactor) {
    console.log('🔍 Масштабирование с коэффициентом:', scaleFactor);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.documentElement;
    
    // 1. Применяем transform к корневому элементу (ЭТО ГЛАВНОЕ)
    svg.setAttribute('transform', `scale(${scaleFactor})`);
    
    // 2. Масштабируем width/height
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (width && height) {
        svg.setAttribute('width', parseFloat(width) * scaleFactor);
        svg.setAttribute('height', parseFloat(height) * scaleFactor);
    }
    
    // 3. Масштабируем viewBox
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            const [x, y, w, h] = parts;
            svg.setAttribute('viewBox', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
        }
    }
    
    // ⚠️ НЕ ТРОГАЕМ АТРИБУТЫ ЭЛЕМЕНТОВ
    // transform на корневом элементе масштабирует всё визуально
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}
    
    // ДОПОЛНИТЕЛЬНО: масштабируем все элементы с координатами
    scaleAllCoordinates(doc, scaleFactor);
    
    const result = serializeSVG(doc);
    console.log('✅ Масштабирование завершено');
    return result;
}

/**
 * Масштабирование всех координат в SVG
 */
function scaleAllCoordinates(doc, scaleFactor) {
    const elements = doc.querySelectorAll('[cx], [cy], [r], [x], [y], [width], [height]');
    let count = 0;
    
    elements.forEach(el => {
        ['cx', 'cy', 'r', 'x', 'y', 'width', 'height'].forEach(attr => {
            if (el.hasAttribute(attr)) {
                const value = parseFloat(el.getAttribute(attr));
                if (!isNaN(value)) {
                    const newValue = value * scaleFactor;
                    el.setAttribute(attr, newValue.toString());
                    count++;
                }
            }
        });
    });
    
    console.log(`🔄 Масштабировано ${count} атрибутов элементов`);
}

/**
 * Получение bounding box SVG
 */
function getSVGBoundingBox(doc) {
    const svg = doc.documentElement;
    const allElements = svg.querySelectorAll('*');
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    allElements.forEach(el => {
        const x = parseFloat(el.getAttribute('x')) || 0;
        const y = parseFloat(el.getAttribute('y')) || 0;
        const width = parseFloat(el.getAttribute('width')) || 0;
        const height = parseFloat(el.getAttribute('height')) || 0;
        const cx = parseFloat(el.getAttribute('cx')) || 0;
        const cy = parseFloat(el.getAttribute('cy')) || 0;
        const r = parseFloat(el.getAttribute('r')) || 0;
        
        // Если есть cx, cy, r
        if (cx && cy && r) {
            if (cx - r < minX) minX = cx - r;
            if (cy - r < minY) minY = cy - r;
            if (cx + r > maxX) maxX = cx + r;
            if (cy + r > maxY) maxY = cy + r;
        }
        // Если есть x, y, width, height
        else if (x || y || width || height) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + width > maxX) maxX = x + width;
            if (y + height > maxY) maxY = y + height;
        }
    });
    
    if (minX !== Infinity && maxX !== -Infinity) {
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
    return null;
}

/**
 * Уменьшение каждого места (улучшенная версия)
 */
function shrinkSeats(svgContent, shrinkFactor = 0.8) {
    console.log('🔍 shrinkSeats вызван с коэффициентом:', shrinkFactor);
    
    const doc = parseSVG(svgContent);
    const seats = doc.querySelectorAll('circle[tc-seat-no]');
    
    console.log(`🪑 Найдено мест для уменьшения: ${seats.length}`);
    
    let count = 0;
    seats.forEach(seat => {
        const r = seat.getAttribute('r');
        if (r) {
            const oldR = parseFloat(r);
            const newR = oldR * shrinkFactor;
            seat.setAttribute('r', newR.toString());
            count++;
            if (count <= 3) {
                console.log(`  📏 Место ${count}: ${oldR}px → ${newR}px`);
            }
        }
    });
    
    if (count > 3) {
        console.log(`  ... и еще ${count - 3} мест`);
    }
    console.log(`✅ Уменьшено ${count} мест`);
    
    return serializeSVG(doc);
}
