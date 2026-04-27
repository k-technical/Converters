// Обработка Ya.Schema
function processYa() {
    try {
        const svgText = document.getElementById('ya-svg').value.trim();
        const jsonText = document.getElementById('ya-json').value.trim();

        if (!svgText || !jsonText) {
            throw new Error('Заполните оба поля');
        }

        const svgParsed = extractJSON(svgText);
        let svgContent = '';
        if (svgParsed.result && typeof svgParsed.result === 'string') {
            svgContent = svgParsed.result;
        } else {
            throw new Error('В первом поле нет SVG в поле result');
        }

        const jsonParsed = extractJSON(jsonText);
        let jsonData = jsonParsed;
        if (jsonParsed.result && typeof jsonParsed.result === 'string') {
            jsonData = JSON.parse(jsonParsed.result);
        } else if (jsonParsed.result && typeof jsonParsed.result === 'object') {
            jsonData = jsonParsed.result;
        }

        if (!jsonData.levels) {
            throw new Error('Во втором поле нет "levels"');
        }

        const result = buildGroupsFromLevels(jsonData, svgContent);
        
        // Поворот если нужно
        let finalSvg = result.svg;
        const shouldRotate = document.getElementById('ya-rotate').checked;
        
        if (shouldRotate) {
            finalSvg = rotateSVG(finalSvg);
        }
        
        showPreview(finalSvg);
        
        const rotateText = shouldRotate ? ' (развёрнуто на 180°)' : '';
        setStatus(`✓ Объединено: ${result.groupsCount} групп${rotateText}`);
        
        document.getElementById('ya-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function rotateSVG(svgString) {
    const doc = parseSVG(svgString);
    const svg = doc.documentElement;
    
    const viewBox = svg.getAttribute('viewBox');
    let cx, cy;
    
    if (viewBox) {
        const parts = viewBox.split(/\s+/).map(Number);
        cx = parts[0] + parts[2] / 2;
        cy = parts[1] + parts[3] / 2;
    } else {
        const width = parseFloat(svg.getAttribute('width')) || 1000;
        const height = parseFloat(svg.getAttribute('height')) || 1000;
        cx = width / 2;
        cy = height / 2;
    }
    
    // 1. Сохраняем все атрибуты родительских групп для текста
    const textElements = svg.querySelectorAll('text');
    const textData = [];
    
    textElements.forEach(text => {
        // Собираем стили от всех родительских групп
        const styles = {};
        let parent = text.parentNode;
        while (parent && parent !== svg) {
            if (parent.tagName === 'g') {
                const fill = parent.getAttribute('fill');
                const fontFamily = parent.getAttribute('font-family');
                const fontSize = parent.getAttribute('font-size');
                const fontWeight = parent.getAttribute('font-weight');
                if (fill && !styles.fill) styles.fill = fill;
                if (fontFamily && !styles.fontFamily) styles.fontFamily = fontFamily;
                if (fontSize && !styles.fontSize) styles.fontSize = fontSize;
                if (fontWeight && !styles.fontWeight) styles.fontWeight = fontWeight;
            }
            parent = parent.parentNode;
        }
        
        // Сохраняем данные текста
        const textTransform = text.getAttribute('transform') || '';
        const translateMatch = textTransform.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
        
        let tx = 0, ty = 0;
        if (translateMatch) {
            tx = parseFloat(translateMatch[1]);
            ty = parseFloat(translateMatch[2]);
        }
        
        const tspan = text.querySelector('tspan');
        let tspanX = 0, tspanY = 0;
        if (tspan) {
            tspanX = parseFloat(tspan.getAttribute('x')) || 0;
            tspanY = parseFloat(tspan.getAttribute('y')) || 0;
        }
        
        textData.push({
            element: text,
            tx: tx,
            ty: ty,
            tspanX: tspanX,
            tspanY: tspanY,
            tspanElement: tspan,
            styles: styles,
            textAnchor: text.getAttribute('text-anchor') || tspan?.getAttribute('text-anchor') || 'start',
            fontSize: text.getAttribute('font-size') || styles.fontSize || '12',
            fontFamily: text.getAttribute('font-family') || styles.fontFamily || 'Arial',
            fill: text.getAttribute('fill') || styles.fill || '#000000',
            content: text.textContent.trim()
        });
    });
    
    // 2. Поворачиваем всё на 180°
    const existingContent = document.createDocumentFragment();
    while (svg.firstChild) {
        existingContent.appendChild(svg.firstChild);
    }
    
    const transformGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    transformGroup.appendChild(existingContent);
    svg.appendChild(transformGroup);
    
    // 3. Удаляем старые тексты из transformGroup
    const oldTexts = transformGroup.querySelectorAll('text');
    oldTexts.forEach(t => t.remove());
    
    // 4. Создаём временный SVG для измерений
    const measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    measureSvg.setAttribute('width', '1000');
    measureSvg.setAttribute('height', '1000');
    measureSvg.style.position = 'absolute';
    measureSvg.style.visibility = 'hidden';
    document.body.appendChild(measureSvg);
    
    // 5. Создаём Буквы_1 с правильно повёрнутым текстом
    const lettersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lettersGroup.setAttribute('id', 'Буквы_1');
    
    textData.forEach(data => {
        // Создаём текст для измерения
        const measureText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        measureText.setAttribute('font-size', data.fontSize);
        measureText.setAttribute('font-family', data.fontFamily);
        measureText.textContent = data.content;
        measureSvg.appendChild(measureText);
        
        const bbox = measureText.getBBox();
        const textWidth = bbox.width;
        const textHeight = bbox.height;
        measureSvg.removeChild(measureText);
        
        // Центр текста относительно tspan
        let centerX = data.tspanX;
        if (data.textAnchor === 'middle') {
            centerX = data.tspanX;
        } else if (data.textAnchor === 'end') {
            centerX = data.tspanX - textWidth / 2;
        } else {
            centerX = data.tspanX + textWidth / 2;
        }
        const centerY = data.tspanY - textHeight / 3;
        
        // Оборачиваем в группу с поворотом вокруг центра текста
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrapper.setAttribute('transform', `rotate(180, ${centerX}, ${centerY})`);
        
        // Создаём новый text
        const newText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        newText.setAttribute('font-size', data.fontSize);
        newText.setAttribute('font-family', data.fontFamily);
        newText.setAttribute('fill', data.fill);
        newText.setAttribute('transform', `translate(${data.tx}, ${data.ty})`);
        
        const newTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        newTspan.setAttribute('x', data.tspanX);
        newTspan.setAttribute('y', data.tspanY);
        newTspan.textContent = data.content;
        
        newText.appendChild(newTspan);
        wrapper.appendChild(newText);
        lettersGroup.appendChild(wrapper);
    });
    
    // Убираем временный SVG
    document.body.removeChild(measureSvg);
    
    transformGroup.appendChild(lettersGroup);
    
    return serializeSVG(doc);
}

function buildGroupsFromLevels(data, svgContent) {
    let groups = [];

    function cleanGroupName(name) {
        if (!name) return 'Без имени';
        return name.replace(/[,&\-+()]/g, '').trim();
    }

    function formatPlaceName(row, place) {
        let rowValue = (row && row.trim() !== '') ? row : '-';
        return 'Ряд_' + rowValue + '|' + place + '-' + place;
    }

    if (data.levels && Array.isArray(data.levels)) {
        data.levels.forEach(level => {
            let groupContent = [];
            let groupName = cleanGroupName(level.name);

            if (level.outline) {
                groupContent.push(`    <path id="Контур_1" d="${level.outline}" fill="none" stroke="#000000" stroke-width="1"/>`);
            }

            if (level.sections) {
                level.sections.forEach(section => {
                    if (section.outline) {
                        groupContent.push(`    <path id="Контур_1" d="${section.outline}" fill="none" stroke="#000000" stroke-width="1"/>`);
                    }
                });
            }

            if (level.seats) {
                level.seats.forEach(seat => {
                    if (seat.x_coord && seat.y_coord && seat.place) {
                        const placeId = formatPlaceName(seat.row, seat.place);
                        groupContent.push(`    <circle id="${placeId}" cx="${seat.x_coord}" cy="${seat.y_coord}" r="5" fill="none" stroke="#AEAEAE" stroke-width="1" data-row="${seat.row || '-'}" data-place="${seat.place}"/>`);
                    }
                });
            }

            if (groupContent.length > 0) {
                groups.push(`  <g id="${groupName}">\n${groupContent.join('\n')}\n  </g>`);
            }
        });
    }

    let baseSVG = svgContent.replace(/<\/svg>\s*$/, '');
    let result = baseSVG + '\n  <g id="tables-from-json">\n' + groups.join('\n') + '\n  </g>\n</svg>';

    return {
        svg: result,
        groupsCount: groups.length
    };
}

function downloadYa() {
    downloadCurrentResult('ya-schema-merged.svg');
}

function clearYa() {
    document.getElementById('ya-svg').value = '';
    document.getElementById('ya-json').value = '';
    document.getElementById('ya-rotate').checked = false;
    clearResult();
}
