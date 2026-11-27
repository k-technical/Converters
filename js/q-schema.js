// Модуль q: SVG-подложка + код с данными -> SVG
let qSvgContent = '';

function initQ() {
    setupDropzone('q-dropzone', 'q-file', readQFiles, true);
}

// Принимает один или два файла: SVG-подложка и JS-код определяются по содержимому
async function readQFiles(files) {
    const names = [];
    for (const file of files) {
        const text = await file.text();
        const t = text.replace(/^\uFEFF/, '');
        if (/<svg[\s>]/i.test(t.slice(0, 2000))) {
            qSvgContent = t;
            names.push('подложка: ' + file.name);
        } else if (/schemeConfig|var\s+seats\s*=/.test(t)) {
            document.getElementById('q-code').value = t;
            names.push('код: ' + file.name);
        } else {
            setStatus('Не удалось определить файл «' + file.name + '» (нужен SVG или JS с кодом данных)', true);
        }
    }
    if (!names.length) return;
    qMarkLoaded(names);
    if (qSvgContent && document.getElementById('q-code').value.trim()) processQ();
}

function qMarkLoaded(names) {
    const dropzone = document.getElementById('q-dropzone');
    dropzone.classList.add('active');
    dropzone.querySelector('p').textContent = 'Файлы загружены';
    const label = document.getElementById('q-file-name');
    label.textContent = '✓ ' + names.join(' | ');
    label.style.display = 'block';
}

// ---- Точный разбор кода: блоки (function(cfg){var a=...;var seats=[[...]];var keys=[...] ----
function qExtractConfig(code) {
    const marker = 'window.schemeConfig=';
    const i = code.indexOf(marker);
    if (i < 0) return null;
    let p = i + marker.length;
    if (code[p] !== '{') return null;
    let depth = 0, inStr = false, esc = false;
    for (let j = p; j < code.length; j++) {
        const ch = code[j];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) {
            try { return JSON.parse(code.slice(p, j + 1)); } catch (e) { return null; }
        }
    }
    return null;
}

function qParseStructured(code) {
    const blocks = code.split(/\(function\(cfg\)\{/).slice(1);
    const seats = [];
    blocks.forEach(b => {
        const sIdx = b.indexOf('var seats=');
        const kIdx = b.indexOf('var keys=');
        if (sIdx < 0 || kIdx < 0) return;
        try {
            // Переменные a, b, c... из начала блока
            const vars = {};
            const headBody = b.slice(0, sIdx).replace(/^\s*var\s+/, '');
            const re = /([A-Za-z_$][\w$]*)\s*=\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|null|true|false)/g;
            let m;
            while ((m = re.exec(headBody)) !== null) vars[m[1]] = JSON.parse(m[2]);

            const arrEnd = b.indexOf(';var keys=', sIdx);
            const arrText = b.slice(sIdx + 'var seats='.length, arrEnd);
            const resolved = arrText.replace(/"(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*/g, tok => {
                if (tok[0] === '"' || tok === 'null' || tok === 'true' || tok === 'false') return tok;
                return tok in vars ? JSON.stringify(vars[tok]) : 'null';
            });
            const rows = JSON.parse(resolved);
            const keys = JSON.parse(b.slice(kIdx + 'var keys='.length, b.indexOf(']', kIdx) + 1));
            rows.forEach(r => {
                const o = {};
                keys.forEach((k, idx) => { o[k] = r[idx]; });
                if (typeof o.x === 'number' && typeof o.y === 'number' && o.place != null) {
                    seats.push({
                        row: o.row != null ? String(o.row) : '0',
                        place: String(o.place),
                        x: o.x,
                        y: o.y,
                        zone: o.zone_id || '',
                        admission: !!o.admission
                    });
                }
            });
        } catch (e) { /* блок нестандартный: пропускаем */ }
    });
    return seats;
}

function extractSeatsFromCode(code, maxCoord = 2000) {
    const seats = [];
    const lines = code.split('\n');
    
    lines.forEach((line) => {
        const arrayMatches = line.matchAll(/\[(.*?)\]/g);
        
        for (const match of arrayMatches) {
            const content = match[1];
            
            const numbers = content.match(/\b\d+\b/g)?.map(Number) || [];
            if (numbers.length < 4) continue;
            
            for (let i = 0; i < numbers.length - 1; i++) {
                const x = numbers[i];
                const y = numbers[i + 1];
                
                if (x > 30 && x < maxCoord && y > 30 && y < maxCoord) {
                    
                    const otherNumbersWithIndex = [];
                    for (let idx = 0; idx < numbers.length; idx++) {
                        if (idx !== i && idx !== i + 1) {
                            otherNumbersWithIndex.push({
                                value: numbers[idx],
                                position: idx
                            });
                        }
                    }
                    
                    if (otherNumbersWithIndex.length === 0) continue;
                    
                    const placeObj = otherNumbersWithIndex[0];
                    let placeName = placeObj.value.toString();
                    
                    const quotedStrings = content.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
                    for (const str of quotedStrings) {
                        if (str.match(/^[A-Za-zА-Яа-я]$/)) {
                            placeName = str;
                            break;
                        }
                    }
                    
                    let rowName = '0';
                    if (otherNumbersWithIndex.length >= 2) {
                        rowName = otherNumbersWithIndex[1].value.toString();
                    }
                    
                    for (const str of quotedStrings) {
                        if (!str.match(/^[A-Za-zА-Яа-я]$/)) {
                            rowName = str;
                            break;
                        }
                    }
                    
                    seats.push({
                        row: rowName,
                        place: placeName,
                        x: x,
                        y: y
                    });
                }
            }
        }
    });
    
    const unique = [];
    const seen = new Set();
    
    seats.forEach(seat => {
        const key = `${seat.x},${seat.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(seat);
        }
    });
    
    return unique;
}

function qDedupe(seats) {
    const seen = new Set();
    return seats.filter(s => {
        const key = s.x + ',' + s.y;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function processQ() {
    try {
        if (!qSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        const code = document.getElementById('q-code').value;
        if (!code) {
            throw new Error('Вставьте код с координатами');
        }

        const vbm = qSvgContent.match(/viewBox\s*=\s*"([^"]*)"/i);
        const vb = vbm ? parseViewBox(vbm[1]) : null;
        const maxCoord = vb ? Math.max(2000, vb[2], vb[3]) : 2000;

        // Точный разбор; если формат кода другой, запасной эвристический
        const cfg = qExtractConfig(code);
        const screen = cfg && cfg.screens && (cfg.screens.default || Object.values(cfg.screens)[0]);
        let seats = qDedupe(qParseStructured(code));
        let exact = true;
        if (!seats.length) {
            seats = extractSeatsFromCode(code, maxCoord);
            exact = false;
        }
        if (!seats.length) throw new Error('В коде не найдены места');

        const zoneNames = {};
        if (screen && screen.zones) Object.keys(screen.zones).forEach(k => { zoneNames[k] = screen.zones[k].name || k; });
        const cfgRadius = screen && screen.states && screen.states.default && parseFloat(screen.states.default.radius);
        const r = seatR(cfgRadius > 0 ? cfgRadius : 6);

        // Места за пределами подложки: скорее всего подложка от других данных
        let box = vb;
        if (!box) {
            const rt = (qSvgContent.match(/<svg[^>]*>/i) || [''])[0];
            const wm = rt.match(/\swidth\s*=\s*"([\d.]+)/i), hm = rt.match(/\sheight\s*=\s*"([\d.]+)/i);
            if (wm && hm) box = [0, 0, parseFloat(wm[1]), parseFloat(hm[1])];
        }
        if (box) {
            const outside = seats.filter(s => s.x < box[0] || s.y < box[1] || s.x > box[0] + box[2] || s.y > box[1] + box[3]).length;
            if (outside > 0) addWarn(outside + ' мест за пределами подложки (проверьте, что подложка подходит к данным)');
        }
        if (!exact) addWarn('Формат кода нестандартный: места найдены приблизительно, проверьте ряды и номера');

        const svgDoc = parseSVG(qSvgContent);
        const svg = svgDoc.documentElement;
        const NS = 'http://www.w3.org/2000/svg';
        const grouped = exact; // группы по зонам: всегда, если код разобран точно
        const existingIds = new Set(Array.from(svgDoc.querySelectorAll('[id]')).map(e => e.getAttribute('id')));

        const makeCircle = (seat) => {
            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', seat.x);
            circle.setAttribute('cy', seat.y);
            circle.setAttribute('r', String(r));
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', SEAT_STROKE);
            circle.setAttribute('stroke-width', '1');
            circle.setAttribute('id', formatSeatId(seat.row, seat.place));
            return circle;
        };

        const stats = {};
        const groupsByZone = new Map();
        let contoursGroup = null;
        let firstSeatGroup = null;
        if (grouped) {
            const groups = new Map();
            seats.forEach(seat => {
                const key = seat.zone || 'seats';
                if (!groups.has(key)) {
                    const g = document.createElementNS(NS, 'g');
                    // Если в подложке уже есть элемент с таким id, добавляем суффикс
                    let gid = cleanName(zoneNames[key] || key, 'zone');
                    if (existingIds.has(gid)) gid += ' места';
                    existingIds.add(gid);
                    g.setAttribute('id', gid);
                    groups.set(key, g);
                    groupsByZone.set(key, g);
                    svg.appendChild(g);
                    if (!firstSeatGroup) firstSeatGroup = g;
                }
                groups.get(key).appendChild(makeCircle(seat));
                stats[zoneNames[key] || key] = (stats[zoneNames[key] || key] || 0) + 1;
            });
        } else {
            const seatsGroup = document.createElementNS(NS, 'g');
            seatsGroup.setAttribute('id', 'seats-overlay');
            seats.forEach(seat => seatsGroup.appendChild(makeCircle(seat)));
            svg.appendChild(seatsGroup);
            firstSeatGroup = seatsGroup;
        }

        // Контуры зон (поле outline): одинаковые контуры (например, варианты танцпола) добавляем один раз
        let outlineCount = 0;
        if (screen && screen.zones) {
            const byPath = new Map();
            Object.keys(screen.zones).forEach(zid => {
                const d = String(screen.zones[zid].outline || '').trim();
                if (!d) return;
                if (!byPath.has(d)) byPath.set(d, []);
                byPath.get(d).push(zid);
            });
            byPath.forEach((zoneIds, d) => {
                const path = document.createElementNS(NS, 'path');
                path.setAttribute('id', 'Контур_1');
                path.setAttribute('d', d);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#000000');
                path.setAttribute('stroke-width', '1');
                let target = null;
                if (grouped) {
                    const withSeats = zoneIds.find(z => groupsByZone.has(z));
                    if (withSeats) target = groupsByZone.get(withSeats);
                }
                if (!target) {
                    target = document.createElementNS(NS, 'g');
                    let gid = grouped ? cleanName(zoneNames[zoneIds[0]] || zoneIds[0], 'zone') : 'Контуры';
                    if (existingIds.has(gid)) gid += grouped ? ' контур' : '';
                    if (!grouped && contoursGroup) target = contoursGroup;
                    else {
                        existingIds.add(gid);
                        target.setAttribute('id', gid);
                        svg.insertBefore(target, firstSeatGroup);
                        if (!grouped) contoursGroup = target;
                    }
                }
                target.insertBefore(path, target.firstChild);
                outlineCount++;
            });
        }

        const finalSVG = serializeSVG(svgDoc);
        const details = Object.keys(stats).map(n => n + ' (' + stats[n] + ')').join(', ');

        showPreview(finalSVG);
        setStatus(`✓ Создано: ${seats.length} мест` + (outlineCount ? `, ${outlineCount} контуров зон` : '') + (details ? '\n📊 ' + details : ''));

        document.getElementById('q-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}


function qApplyBundle(d) {
    if (!d || typeof d.js !== 'string' || typeof d.svg !== 'string') { setStatus('Неверный формат данных от помощника', true); return; }
    document.getElementById('q-code').value = d.js;
    qSvgContent = d.svg;
    qMarkLoaded(['код: со страницы', 'подложка: со страницы']);
    processQ();
}



function downloadQ() {
    downloadCurrentResult('q-result.svg');
}

function clearQ() {
    document.getElementById('q-code').value = '';
    document.getElementById('q-file').value = '';
    qSvgContent = '';
    const dropzone = document.getElementById('q-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите сюда SVG-подложку и файл с кодом';
    document.getElementById('q-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initQ);
