// Скачивание SVG
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

// Парсинг JSON
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

// Формат ID места
function formatSeatId(row, place) {
    return `Ряд_x5F_${row}_x7C_${place}-${place}`;
}

// Парсинг SVG строки в DOM
function parseSVG(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const error = doc.querySelector('parsererror');
    if (error) {
        throw new Error('Невалидный SVG');
    }
    return doc;
}

// Сериализация SVG DOM в строку
function serializeSVG(doc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}

// ============ МАСШТАБИРОВАНИЕ СХЕМЫ (рабочая версия) ============
function scaleSVGDocument(svgContent, scaleFactor) {
    console.log('🔍 Масштабирование с коэффициентом:', scaleFactor);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.documentElement;
    
    // 1. Масштабируем width/height
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (width && height) {
        svg.setAttribute('width', parseFloat(width) * scaleFactor);
        svg.setAttribute('height', parseFloat(height) * scaleFactor);
    }
    
    // 2. Масштабируем viewBox
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
            const [x, y, w, h] = parts;
            svg.setAttribute('viewBox', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
            console.log('  Новый viewBox:', `${x} ${y} ${w * scaleFactor} ${h * scaleFactor}`);
        }
    } else {
        const w = parseFloat(svg.getAttribute('width')) || 800;
        const h = parseFloat(svg.getAttribute('height')) || 600;
        svg.setAttribute('viewBox', `0 0 ${w * scaleFactor} ${h * scaleFactor}`);
    }
    
    // 3. УДАЛЯЕМ transform
    svg.removeAttribute('transform');
    
    // 4. Масштабируем элементы
    const allElements = doc.querySelectorAll('*');
    const attrsToScale = ['cx', 'cy', 'r', 'x', 'y', 'width', 'height'];
    
    allElements.forEach(el => {
        // Масштабируем атрибуты
        attrsToScale.forEach(attr => {
            if (el.hasAttribute(attr)) {
                const value = parseFloat(el.getAttribute(attr));
                if (!isNaN(value) && isFinite(value)) {
                    el.setAttribute(attr, (value * scaleFactor).toString());
                }
            }
        });
        
        // ============ МАСШТАБИРУЕМ PATH (исправленная версия) ============
        if (el.tagName === 'path' || el.tagName === 'PATH') {
            const d = el.getAttribute('d');
            if (d) {
                // Масштабируем ВСЕ числа
                const scaledD = d.replace(/-?\d+\.?\d*/g, (match) => {
                    return (parseFloat(match) * scaleFactor).toString();
                });
                el.setAttribute('d', scaledD);
            }
        }
        // ================================================================
    });
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
}
