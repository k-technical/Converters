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

function processTcloud() {
    try {
        if (!tcloudSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        const doc = parseSVG(tcloudSvgContent);
        
        let seatCount = 0;
        let contourCount = 0;

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

        let processedSvg = serializeSVG(doc);
        processedSvg = processedSvg.replace(/xmlns:ns\d+="[^"]*"/g, '');

        showPreview(processedSvg);
        setStatus('Обработано: ' + seatCount + ' мест, ' + contourCount + ' контуров');
        
        document.getElementById('tcloud-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function downloadTcloud() {
    downloadCurrentResult('tcloud-schema-cleaned.svg');
}

function clearTcloud() {
    tcloudSvgContent = '';
    document.getElementById('tcloud-file').value = '';
    const dropzone = document.getElementById('tcloud-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Перетащите SVG-файл сюда';
    document.getElementById('tcloud-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initTcloud);
