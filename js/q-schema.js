let qSvgContent = '';

function initQ() {
    const dropzone = document.getElementById('q-dropzone');
    const fileInput = document.getElementById('q-file');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#58a6ff';
        dropzone.style.background = 'rgba(88, 166, 255, 0.1)';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = '#30363d';
        dropzone.style.background = '#161b22';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#30363d';
        dropzone.style.background = '#161b22';
        
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.svg')) {
            readQFile(file);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readQFile(file);
    });
}

function readQFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        qSvgContent = e.target.result;
        const dropzone = document.getElementById('q-dropzone');
        dropzone.classList.add('active');
        dropzone.querySelector('p').textContent = `Файл: ${file.name}`;
        
        const fileName = document.getElementById('q-file-name');
        fileName.textContent = `✓ Загружен: ${file.name}`;
        fileName.style.display = 'block';
    };
    reader.readAsText(file);
}

function extractSeatsFromCode(code) {
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
                
                if (x > 30 && x < 2000 && y > 30 && y < 2000) {
                    
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

function processQ() {
    try {
        if (!qSvgContent) {
            throw new Error('Загрузите SVG файл');
        }

        const code = document.getElementById('q-code').value;
        if (!code) {
            throw new Error('Вставьте код с координатами');
        }

        const seats = extractSeatsFromCode(code);

        const svgDoc = parseSVG(qSvgContent);
        const svg = svgDoc.documentElement;

        const seatsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        seatsGroup.setAttribute('id', 'seats-overlay');

        seats.forEach(seat => {
            const seatId = formatSeatId(seat.row, seat.place);

           const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
circle.setAttribute('cx', seat.x);
circle.setAttribute('cy', seat.y);
circle.setAttribute('r', '6');
circle.setAttribute('fill', 'none');
circle.setAttribute('stroke', '#AEAEAE');
circle.setAttribute('stroke-width', '1');
circle.setAttribute('id', seatId);
seatsGroup.appendChild(circle);
        });

        svg.appendChild(seatsGroup);

        const finalSVG = serializeSVG(svgDoc);
        
        showPreview(finalSVG);
        setStatus(`✓ Создано: ${seats.length} мест`);
        
        document.getElementById('q-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function downloadQ() {
    downloadCurrentResult('q-schema-result.svg');
}

function clearQ() {
    document.getElementById('q-code').value = '';
    document.getElementById('q-file').value = '';
    qSvgContent = '';
    const dropzone = document.getElementById('q-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Загрузите SVG-схему';
    document.getElementById('q-file-name').style.display = 'none';
    clearResult();
}

document.addEventListener('DOMContentLoaded', initQ);
