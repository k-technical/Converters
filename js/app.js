// Состояние приложения
let currentTab = 'yandex';
let currentSvgResult = null;

// Инициализация
function initApp() {
    // Обработчики табов
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Показываем Яндекс по умолчанию
    switchTab('yandex');
}

// Переключение табов
function switchTab(tabName) {
    currentTab = tabName;
    
    // Обновляем активный таб
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    
    // Скрываем все панели
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Показываем нужную
    document.getElementById(`panel-${tabName}`).style.display = 'flex';
    
    // Очищаем результат
    clearResult();
}

// Показ статуса
function setStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = isError ? 'stats error active' : 'stats active';
}

// Показ превью
function showPreview(svgContent) {
    const container = document.getElementById('previewContainer');
    container.innerHTML = svgContent;
    currentSvgResult = svgContent;
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
    currentSvgResult = null;
    
    // Скрываем кнопки скачивания
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
