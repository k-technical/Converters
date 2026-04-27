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
    
    // 1. Поворачиваем всё на 180°
    const existingContent = document.createDocumentFragment();
    while (svg.firstChild) {
        existingContent.appendChild(svg.firstChild);
    }
    
    const transformGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    transformGroup.appendChild(existingContent);
    svg.appendChild(transformGroup);
    
    // 2. Находим все <text>, разгруппировываем — вытаскиваем на верх transformGroup
    const textElements = transformGroup.querySelectorAll('text');
    const textData = [];
    
    textElements.forEach(text => {
        // Сохраняем данные
        const textTransform = text.getAttribute('transform') || '';
        const translateMatch = textTransform.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
        const tx = translateMatch ? parseFloat(translateMatch[1]) : 0;
        const ty = translateMatch ? parseFloat(translateMatch[2]) : 0;
        
        const tspan = text.querySelector('tspan');
        const tspanX = tspan ? parseFloat(tspan.getAttribute('x')) || 0 : 0;
        const tspanY = tspan ? parseFloat(tspan.getAttribute('y')) || 0 : 0;
        
        // Собираем стили
        const fill = text.getAttribute('fill') || '#000';
        const fontSize = text.getAttribute('font-size') || '12';
        const fontFamily = text.getAttribute('font-family') || 'Arial';
        const content = text.textContent.trim();
        
        textData.push({ tx, ty, tspanX, tspanY, fill, fontSize, fontFamily, content });
    });
    
    // Удаляем старые тексты
    textElements.forEach(t => {
        // Убираем пустые родительские группы если остались
        const parent = t.parentNode;
        t.remove();
        if (parent && parent !== transformGroup && parent.childNodes.length === 0) {
            parent.remove();
        }
    });
    
    // 3. Создаём временный SVG и измеряем каждый текст
    const hiddenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hiddenSvg.setAttribute('width', '0');
    hiddenSvg.setAttribute('height', '0');
    hiddenSvg.style.position = 'absolute';
    hiddenSvg.style.visibility = 'hidden';
    document.body.appendChild(hiddenSvg);
    
    // 4. Для каждого текста вычисляем центр и оборачиваем
    const lettersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lettersGroup.setAttribute('id', 'Буквы_1');
    
    textData.forEach(data => {
        // Создаём текст для измерения
        const measureText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        measureText.setAttribute('font-size', data.fontSize);
        measureText.setAttribute('font-family', data.fontFamily);
        measureText.textContent = data.content;
        hiddenSvg.appendChild(measureText);
        
        const bbox = measureText.getBBox();
        hiddenSvg.removeChild(measureText);
        
        // Центр текста
        const textCenterX = data.tspanX + bbox.width / 2;
        const textCenterY = data.tspanY - bbox.height / 4;
        
        // Оборачиваем
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrapper.setAttribute('transform', `rotate(180, ${textCenterX}, ${textCenterY})`);
        
        const newText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        newText.setAttribute('fill', data.fill);
        newText.setAttribute('font-size', data.fontSize);
        newText.setAttribute('font-family', data.fontFamily);
        newText.setAttribute('transform', `translate(${data.tx}, ${data.ty})`);
        
        const newTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        newTspan.setAttribute('x', data.tspanX);
        newTspan.setAttribute('y', data.tspanY);
        newTspan.textContent = data.content;
        
        newText.appendChild(newTspan);
        wrapper.appendChild(newText);
        lettersGroup.appendChild(wrapper);
    });
    
    document.body.removeChild(hiddenSvg);
    
    // 5. Добавляем Буквы_1 на верх transformGroup
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
