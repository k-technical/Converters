// Модуль rado: JSON -> SVG
let radoJsonData = null;
let radoJsonLoaded = false;
let radoFileName = '';

function initRado() {
    // Принимает один или два файла сразу (схему и файл события)
    setupDropzone('rado-dropzone', 'rado-file', readRadoFiles, true);
}

// Разбор файла: схема (descriptor.entities) или файл события (подсказываем, какой файл нужен)
function radoParse(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (jsonError) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Файл не содержит валидный JSON');
        parsed = JSON.parse(jsonMatch[0]);
    }
    if (parsed.descriptor && parsed.descriptor.entities) return parsed.descriptor;
    if (parsed.entities) return parsed;
    const schemeId = parsed.event && parsed.event.placeSchemeId;
    if (schemeId) {
        throw new Error('Это файл события, в нём нет мест. Нужен файл схемы с номером ' + schemeId + ' (placeSchemeId)');
    }
    throw new Error('Не найдено поле "entities"');
}

function radoApply(text, name) {
    try {
        radoJsonData = radoParse(text);
        radoJsonLoaded = true;
        radoFileName = name;
        const dropzone = document.getElementById('rado-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = name;
        const fileName = document.getElementById('rado-file-name');
        const stats = getRadoStats(radoJsonData);
        fileName.textContent = 'Загружен: ' + name + ' (' + stats.seats + ' мест)';
        fileName.style.display = 'block';
        return true;
    } catch (err) {
        setStatus('Ошибка: ' + err.message, true);
        return false;
    }
}

async function readRadoFiles(files) {
    for (const file of files) {
        const text = (await file.text()).replace(/^\uFEFF/, '').trim();
        if (radoApply(text, file.name)) { /* схема найдена */ }
    }
    // Схема загружена: сразу строим SVG
    if (radoJsonLoaded) processRado();
}


function radoApplyBundle(d) {
    if (!d || typeof d.json !== 'string') { setStatus('Неверный формат данных от помощника', true); return; }
    if (radoApply(d.json, 'со страницы')) processRado();
}




function getRadoStats(data) {
    let seats = 0;
    let rows = 0;
    let zones = 0;
    let entities = 0;
    
    if (data && data.entities) {
        entities = data.entities.length;
        data.entities.forEach(entity => {
            if (entity.type === 'entranceBlock') {
                zones++;
            }
            if (entity.type === 'rowBlock' && entity.rows) {
                rows += entity.rows.length;
                entity.rows.forEach(row => {
                    if (row.seats) {
                        seats += row.seats.filter(s => s.type !== 'noseat').length;
                    }
                });
            }
        });
    }
    
    return { seats, rows, zones, entities };
}

function processRado() {
    try {
        if (!radoJsonLoaded || !radoJsonData) {
            throw new Error('Загрузите schema.json');
        }

        const result = buildRadoSVG(radoJsonData);
        
        if (!result) {
            throw new Error('Ошибка построения SVG');
        }
        
        showPreview(result);
        
        const stats = getRadoStats(radoJsonData);
        setStatus('Готово: ' + stats.seats + ' мест, ' + stats.rows + ' рядов, ' + stats.zones + ' зон');
        document.getElementById('rado-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function buildRadoSVG(data) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 3000 1600');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.backgroundColor = '#ffffff';
    // Подключаем к невидимому контейнеру, чтобы getBBox работал
    const host = hiddenHost();
    host.appendChild(svg);

    if (data.entities) {
        data.entities.forEach(entity => {
            switch (entity.type) {
                case 'entranceBlock':
                    drawRadoEntranceBlock(svg, entity, ns);
                    break;
                case 'pathBlock':
                    drawRadoPathBlock(svg, entity, ns);
                    break;
                case 'rowBlock':
                    drawRadoRowBlock(svg, entity, ns);
                    break;
                case 'textBlock':
                    drawRadoTextBlock(svg, entity, ns);
                    break;
                default:
                    console.warn('Неизвестный тип:', entity.type);
            }
        });
    }
    
    // viewBox по размеру содержимого (если измерить нельзя, остаётся 0 0 3000 1600)
    try {
        const bb = svg.getBBox();
        if (bb.width > 0 && bb.height > 0) {
            const p = 20;
            svg.setAttribute('viewBox', (bb.x - p) + ' ' + (bb.y - p) + ' ' + (bb.width + 2 * p) + ' ' + (bb.height + 2 * p));
        }
    } catch (e) { /* оставляем стандартный viewBox */ }

    // Масштаб под размер места: коэффициент, увеличение и итоговое место 12 px
    const seatCircles = Array.from(svg.querySelectorAll('circle'));
    if (seatCircles.length > 0) applySeatScale({ documentElement: svg }, seatCircles);

    const serializer = new XMLSerializer();
    const result = serializer.serializeToString(svg);
    host.remove();
    return result;
}

function drawRadoEntranceBlock(parent, entity, ns) {
    try {
        const group = document.createElementNS(ns, 'g');
        group.setAttribute('id', cleanName(entity.name, 'entrance-' + entity.id));
        parent.appendChild(group); // сначала в DOM, чтобы getBBox работал
        
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', entity.points);
        path.setAttribute('fill', entity.color || '#cccccc');
        path.setAttribute('stroke', entity.stroke?.color || 'none');
        path.setAttribute('stroke-width', String(entity.stroke?.width || 0));
        path.setAttribute('opacity', String(entity.fill?.opacity || 1));
        
        group.appendChild(path);
        
        if (entity.name) {
            const text = document.createElementNS(ns, 'text');
            text.textContent = entity.name;
            text.setAttribute('fill', '#333');
            text.setAttribute('font-size', '24px');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('font-family', 'Arial, sans-serif');
            
            try {
                const bbox = path.getBBox ? path.getBBox() : { x: 0, y: 0, width: 200, height: 50 };
                text.setAttribute('x', String(bbox.x + bbox.width / 2 - (entity.name.length * 6)));
                text.setAttribute('y', String(bbox.y + bbox.height / 2 + 8));
                text.setAttribute('text-anchor', 'middle');
            } catch(e) {
                text.setAttribute('x', '1500');
                text.setAttribute('y', '800');
                text.setAttribute('text-anchor', 'middle');
            }
            
            group.appendChild(text);
        }
    } catch(e) {
        console.warn('Ошибка entranceBlock:', e);
    }
}

function drawRadoPathBlock(parent, entity, ns) {
    try {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', entity.points);
        path.setAttribute('fill', entity.fill?.color || 'none');
        path.setAttribute('stroke', entity.stroke?.color || '#e2e2e2');
        path.setAttribute('stroke-width', String(entity.stroke?.width || 1));
        if (entity.stroke?.linecap) {
            path.setAttribute('stroke-linecap', entity.stroke.linecap);
        }
        if (entity.stroke?.linejoin) {
            path.setAttribute('stroke-linejoin', entity.stroke.linejoin);
        }
        if (entity.fill?.opacity !== undefined) {
            path.setAttribute('fill-opacity', String(entity.fill.opacity));
        }
        if (entity.stroke?.opacity !== undefined) {
            path.setAttribute('stroke-opacity', String(entity.stroke.opacity));
        }
        
        parent.appendChild(path);
    } catch(e) {
        console.warn('Ошибка pathBlock:', e);
    }
}

// Итоговое расстояние между центрами соседних мест в ряду, px
const RADO_SEAT_PITCH = 20;

function drawRadoRowBlock(parent, entity, ns) {
    try {
        if (!entity.rows || entity.rows.length === 0) return;
        
        // Создаём группу для стола
        const group = document.createElementNS(ns, 'g');
        const groupName = cleanName(entity.name, 'Стол_' + entity.id);
        group.setAttribute('id', groupName);
        group.setAttribute('class', 'sector-group');
        
        const seatSize = 10;
        // Расстояние между центрами мест по горизонтали после масштаба (итоговое, px)
        const seatSpacing = RADO_SEAT_PITCH * (seatSize * 2) / SEAT_TARGET_SIZE - seatSize * 2;
        const rowSpacing = 30;

        // Поворот и радиус ряда пока не учитываются: предупреждаем, чтобы это не прошло незамеченным
        if (entity.rotation) addWarn('Блок «' + groupName + '»: поворот ' + entity.rotation + '° не учитывается');
        if (entity.radius) addWarn('Блок «' + groupName + '»: изгиб рядов (radius ' + entity.radius + ') не учитывается');
        
        const blockX = entity.x || 0;
        const blockY = entity.y || 0;
        
        // Проверяем, есть ли явные координаты у мест
        const hasExplicitCoords = entity.rows.some(row => 
            row.seats && row.seats.some(seat => seat.position)
        );
        
        if (hasExplicitCoords) {
            entity.rows.forEach((row, rowIdx) => {
                const rowNumber = rowIdx + 1;
                
                if (row.seats) {
                    row.seats.forEach(seat => {
                        if (seat.type !== 'noseat') {
                            const pos = seat.position || { x: 0, y: 0 };
                            const seatId = seat._originalName || seat.name || String(rowNumber);
                            const circle = document.createElementNS(ns, 'circle');
                            circle.setAttribute('cx', String(pos.x || 0));
                            circle.setAttribute('cy', String(pos.y || 0));
                            circle.setAttribute('r', String(seatR(seatSize)));
                            circle.setAttribute('fill', 'none');
                            circle.setAttribute('stroke', '#AEAEAE');
                            circle.setAttribute('stroke-width', '1');
                            circle.setAttribute('id', fmtId((row.name || rowNumber), seatId, false));
                            
                            group.appendChild(circle);
                        }
                    });
                }
            });
            parent.appendChild(group);
            return;
        }
        
        // Нет явных координат — используем сетку
        entity.rows.forEach((row, rowIdx) => {
            const rowNumber = rowIdx + 1;
            const y = blockY + rowIdx * (seatSize * 2 + rowSpacing);
            
            if (row.seats) {
                let x = blockX;
                row.seats.forEach(seat => {
                    if (seat.type !== 'noseat') {
                        const seatId = seat._originalName || seat.name || String(rowNumber);
                        const circle = document.createElementNS(ns, 'circle');
                        circle.setAttribute('cx', String(x + seatSize));
                        circle.setAttribute('cy', String(y + seatSize));
                        circle.setAttribute('r', String(seatR(seatSize)));
                        circle.setAttribute('fill', 'none');
                        circle.setAttribute('stroke', '#AEAEAE');
                        circle.setAttribute('stroke-width', '1');
                        circle.setAttribute('id', fmtId((row.name || rowNumber), seatId, false));
                        
                        group.appendChild(circle);
                    }
                    x += seatSize * 2 + seatSpacing;
                });
            }
        });
        
        parent.appendChild(group);
    } catch(e) {
        console.warn('Ошибка rowBlock:', e);
    }
}

function drawRadoTextBlock(parent, entity, ns) {
    try {
        const text = document.createElementNS(ns, 'text');
        text.textContent = entity.text || '';
        text.setAttribute('x', String(entity.x || 0));
        text.setAttribute('y', String(entity.y || 0));
        text.setAttribute('fill', entity.color || '#666');
        text.setAttribute('font-size', String(entity.fontSize || 16) + 'px');
        text.setAttribute('font-family', 'Arial, sans-serif');
        if (entity.fontWeight) {
            text.setAttribute('font-weight', entity.fontWeight);
        }
        if (entity.rotation) {
            text.setAttribute('transform', 'rotate(' + entity.rotation + ', ' + (entity.x || 0) + ', ' + (entity.y || 0) + ')');
        }
        
        parent.appendChild(text);
    } catch(e) {
        console.warn('Ошибка textBlock:', e);
    }
}

function downloadRado() {
    downloadCurrentResult('rado-scheme.svg');
}

function clearRado() {
    radoJsonData = null;
    radoJsonLoaded = false;
    radoFileName = '';
    
    document.getElementById('rado-file').value = '';
    const dropzone = document.getElementById('rado-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Загрузите schema.json';
    document.getElementById('rado-file-name').style.display = 'none';
    document.getElementById('rado-download').style.display = 'none';
    clearResult();
    setStatus('Ожидание загрузки файла');
}

// Инициализация
document.addEventListener('DOMContentLoaded', initRado);
