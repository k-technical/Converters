// Состояние приложения
let currentTab = 'auto';
let currentSvgResult = null;

// Инициализация
function initApp() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    switchTab('auto');
}

// Переключение табов
// Ручная загрузка файлов: один из конвертеров выбирается в списке
const MANUAL_PANELS = ['ya', 'tcloud', 'q', 'tland', 'redk', 'rado', 'inti'];

function manualShow(name) {
    MANUAL_PANELS.forEach(n => {
        const p = document.getElementById('panel-' + n);
        if (p) p.style.display = (n === name) ? 'flex' : 'none';
    });
}

function manualSelect(name) {
    manualShow(name);
    clearResult();
}

function switchTab(tabName) {
    currentTab = tabName;
    
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    const targetPanel = document.getElementById('panel-' + tabName);
    if (targetPanel) {
        targetPanel.style.display = 'flex';
    }

    // Вкладка ручной загрузки: показываем выбранный конвертер
    if (tabName === 'manual') manualShow(document.getElementById('manual-select').value);
    
    clearResult();
    // Убираем автоматическое сообщение при переключении
}

// Предупреждения модулей: показываются в статусе после результата
let pendingWarns = [];
function addWarn(msg) { pendingWarns.push(msg); }

// Показ статуса: только ошибки и предупреждения (красным), успешные сообщения не показываются
function setStatus(message, isError = false) {
    const status = document.getElementById('status');
    let text = '';
    if (isError) {
        text = message;
        if (pendingWarns.length) text += '\n⚠ ' + pendingWarns.join('\n⚠ ');
    } else if (pendingWarns.length) {
        text = '⚠ ' + pendingWarns.join('\n⚠ ');
    }
    pendingWarns = [];
    status.textContent = text;
    status.className = text ? 'stats error active' : 'stats';
}

// Повторяющиеся id внутри одной группы (одинаковые id в разных секторах - нормально)
function findDuplicateIds(svg) {
    const skip = /^(Контур|Подложка|Буквы)/;
    try {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        if (doc.querySelector('parsererror')) throw new Error('parse');
        const seen = new Set();
        let dup = 0;
        doc.querySelectorAll('[id]').forEach(el => {
            const id = el.getAttribute('id');
            if (skip.test(id)) return;
            const p = el.parentNode;
            const scope = p && p.getAttribute ? (p.getAttribute('id') || '') : '';
            const key = scope + '\u0001' + id;
            if (seen.has(key)) dup++; else seen.add(key);
        });
        return dup;
    } catch (e) {
        const seen = new Set();
        let dup = 0;
        const re = /\sid="([^"]*)"/g;
        let m;
        while ((m = re.exec(svg)) !== null) {
            if (skip.test(m[1])) continue;
            if (seen.has(m[1])) dup++; else seen.add(m[1]);
        }
        return dup;
    }
}

// Для превью убираем скрипты и обработчики (скачиваемый файл не меняется)
function sanitizeForPreview(svg) {
    try {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        if (doc.querySelector('parsererror')) return svg;
        doc.querySelectorAll('script,foreignObject').forEach(n => n.remove());
        doc.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(at => { if (/^on/i.test(at.name)) el.removeAttribute(at.name); });
        });
        return new XMLSerializer().serializeToString(doc.documentElement);
    } catch (e) { return svg; }
}

// Показ превью
function showPreview(svgContent) {
    const container = document.getElementById('previewContainer');
    container.innerHTML = sanitizeForPreview(svgContent);
    currentSvgResult = svgContent;
    const dup = findDuplicateIds(svgContent);
    if (dup > 0) addWarn('Повторяющихся id внутри групп: ' + dup);
}

// Скачивание текущего результата
function downloadCurrentResult(filename) {
    if (!currentSvgResult) {
        setStatus('Нет результата для скачивания', true);
        return;
    }
    downloadSVG(currentSvgResult, filename);
}

// Очистка результата
function clearResult() {
    document.getElementById('previewContainer').innerHTML = '';
    document.getElementById('status').className = 'stats';
    document.getElementById('status').textContent = '';
    pendingWarns = [];
    currentSvgResult = null;
    
    document.querySelectorAll('[id$="-download"]').forEach(btn => {
        btn.style.display = 'none';
    });
}

// Обработка ошибок
function handleError(error, fallbackMessage = 'Произошла ошибка') {
    const message = error.message || fallbackMessage;
    setStatus(message, true);
    console.error(error);
}

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', initApp);
