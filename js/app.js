// Инициализация приложения
let currentTab = 'yandex';
let currentResult = null;

// Табы
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        
        // Переключаем панели
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.style.display = 'none';
        });
        document.getElementById(`panel-${currentTab}`).style.display = 'flex';
        
        // Очищаем результат
        clearResult();
    });
});

function setStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = isError ? 'stats error active' : 'stats active';
}

function showPreview(svgContent) {
    const container = document.getElementById('previewContainer');
    container.innerHTML = svgContent;
}

function clearAll() {
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    clearResult();
}

function clearResult() {
    document.getElementById('previewContainer').innerHTML = '';
    document.getElementById('status').className = 'stats';
    currentResult = null;
}

// Загрузка первоначального состояния
document.getElementById('panel-yandex').style.display = 'flex';
