// Состояние приложения
let currentTab = 'ya';
let currentSvgResult = null;

// Инициализация
function initApp() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    switchTab('ya');
}

// Переключение табов
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
    
    clearResult();
    // Убираем автоматическое сообщение при переключении
}

// Предупреждения модулей: показываются в статусе после результата
let pendingWarns = [];
function addWarn(msg) { pendingWarns.push(msg); }

// Показ статуса
function setStatus(message, isError = false) {
    const status = document.getElementById('status');
    let text = message;
    if (!isError && pendingWarns.length) {
        text += '\n⚠ ' + pendingWarns.join('\n⚠ ');
    }
    pendingWarns = [];
    status.textContent = text;
    status.className = isError ? 'stats error active' : 'stats active';
}

// Повторяющиеся id (кроме служебных Контур_*, Подложка*)
function findDuplicateIds(svg) {
    const seen = new Set();
    let dup = 0;
    const re = /\sid="([^"]*)"/g;
    let m;
    while ((m = re.exec(svg)) !== null) {
        const id = m[1];
        if (/^(Контур|Подложка|Буквы)/.test(id)) continue;
        if (seen.has(id)) dup++; else seen.add(id);
    }
    return dup;
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
    if (dup > 0) addWarn('Повторяющихся id: ' + dup + ' (проверьте перед загрузкой)');
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
