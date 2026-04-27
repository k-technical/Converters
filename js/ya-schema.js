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
    let vbX = 0, vbY = 0, vbW = 492, vbH = 502;
    
    if (viewBox) {
        const parts = viewBox.split(/\s+/).map(Number);
        vbX = parts[0];
        vbY = parts[1];
        vbW = parts[2];
        vbH = parts[3];
    } else {
        vbW = parseFloat(svg.getAttribute('width')) || 492;
        vbH = parseFloat(svg.getAttribute('height')) || 502;
    }
    
    const cx = vbX + vbW / 2;
    const cy = vbY + vbH / 2;
    
    // 1. Вынимаем все текстовые группы
    const textGroups = svg.querySelectorAll('g');
    const savedTextGroups = [];
    
    textGroups.forEach(g => {
        const texts = g.querySelectorAll('text');
        if (texts.length > 0) {
            savedTextGroups.push(g);
            g.remove();
        }
    });
    
    // 2. Поворачиваем всё остальное на 180°
    const existingContent = document.createDocumentFragment();
    while (svg.firstChild) {
        existingContent.appendChild(svg.firstChild);
    }
    
    const transformGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    transformGroup.appendChild(existingContent);
    svg.appendChild(transformGroup);
    
    // 3. Буквы_1 — тексты без поворота, но с отражёнными координатами
    const lettersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lettersGroup.setAttribute('id', 'Буквы_1');
    
    savedTextGroups.forEach(g => {
        // Копируем группу
        const newG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Копируем атрибуты кроме transform
        for (let i = 0; i < g.attributes.length; i++) {
            const attr = g.attributes[i];
            if (attr.name !== 'transform') {
                newG.setAttribute(attr.name, attr.value);
            }
        }
        
        // Обрабатываем старый transform
        const oldTransform = g.getAttribute('transform');
        if (oldTransform) {
            const translateMatch = oldTransform.match(/translate\(([^)]+)\)/);
            if (translateMatch) {
                const coords = translateMatch[1].split(/\s+/).map(Number);
                // Отражаем translate
                const newTx = 2 * cx - coords[0];
                const newTy = 2 * cy - coords[1];
                newG.setAttribute('transform', `translate(${newTx}, ${newTy})`);
            }
        }
        
        // Копируем все text/tspan и отражаем их координаты
        const textElements = g.querySelectorAll('text');
        textElements.forEach(text => {
            const newText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            
            for (let i = 0; i < text.attributes.length; i++) {
                const attr = text.attributes[i];
                newText.setAttribute(attr.name, attr.value);
            }
            
            // Отражаем tspan координаты
            const tspans = text.querySelectorAll('tspan');
            tspans.forEach(tspan => {
                const newTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                
                for (let i = 0; i < tspan.attributes.length; i++) {
                    const attr = tspan.attributes[i];
                    if (attr.name === 'x') {
                        newTspan.setAttribute('x', 2 * cx - parseFloat(attr.value));
                    } else if (attr.name === 'y') {
                        newTspan.setAttribute('y', 2 * cy - parseFloat(attr.value));
                    } else {
                        newTspan.setAttribute(attr.name, attr.value);
                    }
                }
                
                newTspan.textContent = tspan.textContent;
                newText.appendChild(newTspan);
            });
            
            // Если нет tspan — копируем текст напрямую
            if (tspans.length === 0) {
                newText.textContent = text.textContent;
            }
            
            newG.appendChild(newText);
        });
        
        lettersGroup.appendChild(newG);
    });
    
    svg.appendChild(lettersGroup);
    
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
