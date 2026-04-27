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
    
    // Ищем viewBox
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
    
    // 1. Оборачиваем всё содержимое в поворот на 180°
    const existingContent = document.createDocumentFragment();
    while (svg.firstChild) {
        existingContent.appendChild(svg.firstChild);
    }
    
    const transformGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    transformGroup.appendChild(existingContent);
    svg.appendChild(transformGroup);
    
    // 2. Находим все <text> (теперь они внутри transformGroup)
    const textElements = transformGroup.querySelectorAll('text');
    
    // 3. Создаём Буквы_1 и переносим туда текст с обратным поворотом
    const lettersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lettersGroup.setAttribute('id', 'Буквы_1');
    
    textElements.forEach(text => {
        const x = text.getAttribute('x');
        const y = text.getAttribute('y');
        
        // Оборачиваем текст в группу с поворотом вокруг его же координат
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        if (x && y) {
            wrapper.setAttribute('transform', `rotate(180, ${x}, ${y})`);
        } else {
            // Если нет x,y — поворачиваем вокруг начала координат
            wrapper.setAttribute('transform', 'rotate(180)');
        }
        
        // Перемещаем text в wrapper
        text.parentNode.insertBefore(wrapper, text);
        wrapper.appendChild(text);
        
        // Переносим wrapper в Буквы_1
        lettersGroup.appendChild(wrapper);
    });
    
    // 4. Буквы_1 добавляем в transformGroup
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
