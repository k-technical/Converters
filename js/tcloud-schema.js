// Модуль tcloud: очистка SVG и перенос элементов в группы
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

// ---- Автозагрузка по ссылке (нужен скрипт-помощник) ----
let tcloudWin = null;

function tcloudOpenWidget() {
    const url = document.getElementById('tcloud-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку (начинается с https://)', true); return; }
    tcloudWin = window.open(url, '_blank');
    if (!tcloudWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    setStatus('Жду данные… (должен работать скрипт-помощник)');
}

function tcloudApplyBundle(d) {
    if (!d || typeof d.svg !== 'string' || !/<svg[\s>]/i.test(d.svg.slice(0, 2000))) {
        setStatus('Неверный формат данных от помощника', true);
        return;
    }
    tcloudSvgContent = d.svg;
    tcloudMarkLoaded('со страницы');
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
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице)', true);
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

        // Контуры секторов (shape): id Контур_1
        doc.querySelectorAll('[id^="sector_shape"]').forEach(el => {
            el.setAttribute('id', 'Контур_1');
            contourCount++;
        });

        // Названия секторов без лишних знаков и двойных пробелов
        doc.querySelectorAll('[class~="tc-map-sector"]').forEach(g => {
            const name = cleanName(decodeIdEscapes(g.getAttribute('id') || g.getAttribute('data-name') || ''));
            if (name) g.setAttribute('id', name);
        });

        if (skippedNonCircle > 0) {
            addWarn('В рядах есть ' + skippedNonCircle + ' элементов, не являющихся кругами-местами (они удалены вместе с рядом)');
        }

        // Масштаб SVG под размер места и уменьшение мест
        let scaleInfo = '';
        if (seatElements.length > 0) {
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

// Масштаб и размер мест: общая функция applySeatScale из utils.js
function tcloudApplyScale(doc, seatElements) {
    return applySeatScale(doc, seatElements);
}

function downloadTcloud() {
    downloadCurrentResult('tcloud-cleaned.svg');
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
