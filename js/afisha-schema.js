// Afisha Schema - генератор схем залов из билетных файлов
let afishaJsonData = null;
let afishaJsonLoaded = false;
let afishaFileName = '';
let afishaSvgContent = '';

function initAfisha() {
    const dropzone = document.getElementById('afisha-dropzone');
    const fileInput = document.getElementById('afisha-file');

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
        if (file) {
            readAfishaFile(file);
        } else {
            setStatus('Загрузите файл с данными', true);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readAfishaFile(file);
    });
}

function readAfishaFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target.result;
            let cleanText = content.trim();
            if (cleanText.charCodeAt(0) === 0xFEFF) {
                cleanText = cleanText.slice(1);
            }
            
            const parsed = JSON.parse(cleanText);
            
            // Проверяем структуру
            if (!parsed.levels || !Array.isArray(parsed.levels)) {
                throw new Error('Некорректный формат: отсутствует массив "levels"');
            }
            
            afishaJsonData = parsed;
            afishaJsonLoaded = true;
            afishaFileName = file.name;
            
            const dropzone = document.getElementById('afisha-dropzone');
            dropzone.classList.add('active');
            dropzone.querySelector('p').textContent = file.name;
            
            const fileName = document.getElementById('afisha-file-name');
            const stats = getAfishaStats(afishaJsonData);
            fileName.textContent = 'Загружен: ' + file.name + ' (' + stats.seats + ' мест, ' + stats.zones + ' зон)';
            fileName.style.display = 'block';
            
            setStatus('Данные загружены: ' + stats.seats + ' мест, ' + stats.zones + ' зон. Нажмите "Конвертировать"');
            
        } catch (err) {
            setStatus('Ошибка: ' + err.message, true);
            afishaJsonLoaded = false;
        }
    };
    reader.onerror = () => {
        setStatus('Ошибка чтения файла', true);
    };
    reader.readAsText(file);
}

function getAfishaStats(data) {
    let seats = 0;
    let zones = 0;
    
    if (data && data.levels) {
        data.levels.forEach(level => {
            zones++;
            if (level.rows && Array.isArray(level.rows)) {
                level.rows.forEach(row => {
                    if (row.seats && Array.isArray(row.seats)) {
                        seats += row.seats.length;
                    }
                });
            }
        });
    }
    
    return { seats, zones };
}

function processAfisha() {
    try {
        if (!afishaJsonLoaded || !afishaJsonData) {
            throw new Error('Загрузите билетный файл');
        }

        const result = buildAfishaSVG(afishaJsonData);
        
        if (!result) {
            throw new Error('Ошибка построения схемы');
        }
        
        afishaSvgContent = result;
        showPreview(result);
        
        const stats = getAfishaStats(afishaJsonData);
        setStatus('Готово: ' + stats.seats + ' мест, ' + stats.zones + ' зон');
        document.getElementById('afisha-download').style.display = 'block';

    } catch (e) {
        handleError(e);
    }
}

function buildAfishaSVG(data) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns', ns);
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let totalSeats = 0;
    
    // Функция трансформации названия зоны
    function transformZoneName(name) {
        if (!name) return 'Неизвестная зона';
        let newName = name.replace(/[№\u2116#]/g, '');
        newName = newName.replace(/\s+/g, ' ').trim();
        if (/^\d/.test(newName)) {
            newName = ' ' + newName;
        }
        return newName;
    }
    
    // Обрабатываем все уровни
    data.levels.forEach(level => {
        const zoneName = transformZoneName(level.name);
        const gZone = document.createElementNS(ns, 'g');
        gZone.setAttribute('id', zoneName);
        
        let zoneSeatsCount = 0;
        
        if (level.rows && Array.isArray(level.rows)) {
            level.rows.forEach(row => {
                const rowNumber = row.number || '0';
                
                if (row.seats && Array.isArray(row.seats)) {
                    row.seats.forEach(seat => {
                        const x = parseFloat(seat.x);
                        const y = parseFloat(seat.y);
                        const seatNumber = seat.number || '0';
                        
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                        
                        const seatNaming = 'Ряд_' + rowNumber + '|' + seatNumber + '-' + seatNumber;
                        
                        const circle = document.createElementNS(ns, 'circle');
                        circle.setAttribute('id', seatNaming);
                        circle.setAttribute('cx', String(x));
                        circle.setAttribute('cy', String(y));
                        circle.setAttribute('r', '6');
                        circle.setAttribute('fill', 'none');
                        circle.setAttribute('stroke', '#AFAFAF');
                        circle.setAttribute('stroke-width', '1');
                        
                        gZone.appendChild(circle);
                        zoneSeatsCount++;
                        totalSeats++;
                    });
                }
            });
        }
        
        svg.appendChild(gZone);
    });
    
    // Устанавливаем viewBox
    if (totalSeats > 0) {
        const padding = 30;
        const width = (maxX - minX) + padding * 2;
        const height = (maxY - minY) + padding * 2;
        const viewX = minX - padding;
        const viewY = minY - padding;
        
        svg.setAttribute('viewBox', viewX + ' ' + viewY + ' ' + width + ' ' + height);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
    }
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svg);
}

function downloadAfisha() {
    if (!afishaSvgContent) {
        setStatus('Нет результата для скачивания', true);
        return;
    }
    downloadCurrentResult('afisha-scheme.svg');
}

function clearAfisha() {
    afishaJsonData = null;
    afishaJsonLoaded = false;
    afishaFileName = '';
    afishaSvgContent = '';
    
    document.getElementById('afisha-file').value = '';
    const dropzone = document.getElementById('afisha-dropzone');
    dropzone.classList.remove('active');
    dropzone.querySelector('p').textContent = 'Загрузите билетный файл (JSON с levels)';
    document.getElementById('afisha-file-name').style.display = 'none';
    document.getElementById('afisha-download').style.display = 'none';
    clearResult();
    setStatus('Ожидание загрузки файла');
}

// Инициализация
document.addEventListener('DOMContentLoaded', initAfisha);