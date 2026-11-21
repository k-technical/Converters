let tcloudSvgContent = '';

function initTcloud() {
    setupDropzone('tcloud-dropzone', 'tcloud-file', readTcloudFile);
}

function readTcloudFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        tcloudSvgContent = e.target.result;
        const dropzone = document.getElementById('tcloud-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = 'Файл: ' + file.name;
        
        const fileName = document.getElementById('tcloud-file-name');
        fileName.textContent = 'Загружен: ' + file.name;
        fileName.style.display = 'block';
    };
    reader.readAsText(file);
}

function tcloudMarkLoaded(name) {
    const dropzone = document.getElementById('tcloud-dropzone');
    dropzone.classList.add('active');
    dropzone.querySelector('p').textContent = 'Файл: ' + name;
    const fileName = document.getElementById('tcloud-file-name');
    fileName.textContent = 'Загружен: ' + name;
    fileName.style.display = 'block';
}

// ---- Автозагрузка по ссылке на виджет (нужен скрипт-помощник на странице виджета) ----
let tcloudWin = null;

function tcloudOpenWidget() {
    const url = document.getElementById('tcloud-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку на виджет (начинается с https://)', true); return; }
    tcloudWin = window.open(url, '_blank');
    if (!tcloudWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    setStatus('Жду данные от виджета… (на странице виджета должен работать скрипт-помощник)');
}

function tcloudApplyBundle(d) {
    if (!d || typeof d.svg !== 'string' || !/<svg[\s>]/i.test(d.svg.slice(0, 2000))) {
        setStatus('Неверный формат данных от помощника', true);
        return;
    }
    tcloudSvgContent = d.svg;
    tcloudMarkLoaded('из виджета');
    processTcloud();
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'tcloud-svg') return;
    if (!tcloudWin || e.source !== tcloudWin) return; // только от окна, открытого кнопкой
    tcloudApplyBundle(d);
    try { tcloudWin.close(); } catch (err) { /* окно можно закрыть вручную */ }
});

async function tcloudPasteBundle() {
    try {
        const d = JSON.parse(await navigator.clipboard.readText());
        if (d.type !== 'tcloud-svg') throw new Error('not bundle');
        tcloudApplyBundle(d);
    } catch (e) {
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице виджета)', true);
    }
}

function processTcloud() {
    try {
        if (!tcloudSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        const doc = parseSVG(tcloudSvgContent);
        
        let seatCount = 0;
        let contourCount = 0;
        let skippedNonCircle = 0;
        const seatElements = [];

        const allRowGroups = doc.querySelectorAll('[tc-row-no]');

        const sectors = new Map();
        
        allRowGroups.forEach(row => {
            const parent = row.parentNode;
            if (parent) {
                const parentId = parent.id || 'unknown';
                if (!sectors.has(parentId)) {
                    sectors.set(parentId, []);
                }
                sectors.get(parentId).push(row);
            }
        });

        sectors.forEach((rows, sectorName) => {
            const parent = rows[0].parentNode;
            const seatsWithRows = [];
            
            rows.forEach(row => {
                const foreign = row.querySelectorAll(':scope > *:not(circle[tc-seat-no])').length;
                if (foreign > 0) skippedNonCircle += foreign;
                const rowNo = row.getAttribute('tc-row-no');
                const seats = row.querySelectorAll('circle[tc-seat-no]');
                
                seats.forEach(seat => {
                    const seatNo = seat.getAttribute('tc-seat-no');
                    seatsWithRows.push({
                        element: seat,
                        rowNo: rowNo,
                        seatNo: seatNo
                    });
                });
            });

            rows.forEach(row => row.remove());

            seatsWithRows.forEach(({element, rowNo, seatNo}) => {
                const newId = formatSeatId(rowNo, seatNo);
                element.setAttribute('id', newId);
                element.setAttribute('fill', 'none');
                element.setAttribute('stroke', '#AEAEAE');
                element.setAttribute('stroke-width', '1');
                seatCount++;
                seatElements.push(element);
                parent.appendChild(element);
            });
        });

        const allElements = doc.querySelectorAll('[id]');
        allElements.forEach(elem => {
            const oldId = elem.getAttribute('id');
            if (oldId && oldId.includes('Контур_') && !oldId.includes('Ряд_x5F_')) {
                const match = oldId.match(/(Контур_\d+)/);
                if (match && match[1] !== oldId) {
                    elem.setAttribute('id', match[1]);
                    contourCount++;
                }
            }
        });

        if (skippedNonCircle > 0) {
            addWarn('В рядах есть ' + skippedNonCircle + ' элементов, не являющихся кругами-местами (они удалены вместе с рядом)');
        }

        // Масштаб схемы под размер места и уменьшение мест
        let scaleInfo = '';
        if (document.getElementById('tcloud-scale').checked && seatElements.length > 0) {
            scaleInfo = tcloudApplyScale(doc, seatElements);
        }

        let processedSvg = serializeSVG(doc);
        processedSvg = processedSvg.replace(/xmlns:ns\d+="[^"]*"/g, '');

        showPreview(processedSvg);
        setStatus('Обработано: ' + seatCount + ' мест, ' + contourCount + ' контуров' + (scaleInfo ? '\n' + scaleInfo : ''));
        
        document.getElementById('tcloud-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function tcloudNum(n) {
    return String(Math.round(n * 10000) / 10000);
}

// Коэффициент = целевой размер / исходный размер места; схема масштабируется через width/height
// (содержимое остаётся в исходных координатах), места уменьшаются до заданного процента
function tcloudApplyScale(doc, seatElements) {
    const target = parseFloat(document.getElementById('tcloud-target').value);
    const pct = parseFloat(document.getElementById('tcloud-pct').value);
    if (!(target > 0)) throw new Error('Укажите размер места после масштаба (больше 0)');
    if (!(pct > 0 && pct <= 100)) throw new Error('Процент размера мест должен быть от 1 до 100');

    const sizes = seatElements.map(el => parseFloat(el.getAttribute('r')) * 2).filter(v => v > 0).sort((a, b) => a - b);
    if (!sizes.length) throw new Error('У мест нет радиуса r, масштаб посчитать нельзя');
    const size = sizes[Math.floor(sizes.length / 2)];
    const k = target / size;

    const svg = doc.documentElement;
    let box = parseViewBox(svg.getAttribute('viewBox'));
    if (!box) {
        const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
        if (!(w > 0 && h > 0)) throw new Error('У схемы нет viewBox и width/height, масштаб не применить');
        box = [0, 0, w, h];
        svg.setAttribute('viewBox', box.join(' '));
    }

    seatElements.forEach(el => {
        const r = parseFloat(el.getAttribute('r'));
        if (r > 0) el.setAttribute('r', tcloudNum(r * pct / 100));
        el.setAttribute('stroke-width', tcloudNum(1 / k)); // после масштаба обводка 1 px
    });

    svg.setAttribute('width', tcloudNum(box[2] * k));
    svg.setAttribute('height', tcloudNum(box[3] * k));

    return '📐 Размер места ' + tcloudNum(size) + ' → коэффициент ' + tcloudNum(k) +
        ', схема ' + tcloudNum(box[2] * k) + '×' + tcloudNum(box[3] * k) +
        ' px, место ' + tcloudNum(size * k * pct / 100) + ' px';
}

function downloadTcloud() {
    downloadCurrentResult('tcloud-schema-cleaned.svg');
}

function clearTcloud() {
    tcloudSvgContent = '';
    document.getElementById('tcloud-file').value = '';
    document.getElementById('tcloud-link').value = '';
    tcloudWin = null;
    const dropzone = document.getElementById('tcloud-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    document.getElementById('tcloud-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initTcloud);
