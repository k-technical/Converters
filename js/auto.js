// Общая вкладка автозагрузки: ссылка открывается в новом окне, скрипт-помощник на странице отдаёт данные,
// а тип данных определяет, какой конвертер их обрабатывает
const AUTO_HANDLERS = {
    'ya-schema-files': { label: 'Ya', apply: d => yaApplyBundle(d), download: () => downloadYa(), clear: () => clearYa() },
    'tcloud-svg': { label: 'T-cloud', apply: d => tcloudApplyBundle(d), download: () => downloadTcloud(), clear: () => clearTcloud() },
    'q-files': { label: 'Q-ti', apply: d => qApplyBundle(d), download: () => downloadQ(), clear: () => clearQ() },
    'tland-svg': { label: 'T-Land', apply: d => tlandApplyBundle(d), download: () => downloadTland(), clear: () => clearTland() },
    'redk-files': { label: 'Red-K', apply: d => redkApplyBundle(d), download: () => downloadRedk(), clear: () => clearRedk() },
    'rado-json': { label: 'Rad-o', apply: d => radoApplyBundle(d), download: () => downloadRado(), clear: () => clearRado() },
    'inti-data': { label: 'Inti-IF', apply: d => intiApplyBundle(d), download: () => downloadInti(), clear: () => clearInti() }
};

let autoWin = null;
let autoType = null;

function autoOpen() {
    const url = document.getElementById('auto-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку (начинается с https://)', true); return; }
    autoWin = window.open(url, '_blank');
    if (!autoWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    document.getElementById('auto-detected').textContent = 'Жду данные от страницы…';
}

// Данные от помощника: по типу сообщения выбираем конвертер
function autoDispatch(d) {
    const handler = d && AUTO_HANDLERS[d.type];
    if (!handler) {
        document.getElementById('auto-detected').textContent = '';
        setStatus('Для этих данных нет конвертера на этой вкладке (тип: ' + (d && d.type) + ')', true);
        return false;
    }
    autoType = d.type;
    document.getElementById('auto-detected').textContent = 'Определено: ' + handler.label;
    handler.apply(d);
    document.getElementById('auto-download').style.display = currentSvgResult ? 'block' : 'none';
    return true;
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (!autoWin || e.source !== autoWin) return; // только от окна, открытого кнопкой
    autoDispatch(d);
    try { autoWin.close(); } catch (err) { /* окно можно закрыть вручную */ }
});

async function autoPaste() {
    try {
        const d = JSON.parse(await navigator.clipboard.readText());
        if (!d || !AUTO_HANDLERS[d.type]) throw new Error('not bundle');
        autoDispatch(d);
    } catch (e) {
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице)', true);
    }
}

function autoDownload() {
    if (!autoType || !AUTO_HANDLERS[autoType]) { setStatus('Нет результата для скачивания', true); return; }
    AUTO_HANDLERS[autoType].download();
}

function autoClear() {
    if (autoType && AUTO_HANDLERS[autoType]) AUTO_HANDLERS[autoType].clear();
    autoType = null;
    autoWin = null;
    document.getElementById('auto-link').value = '';
    document.getElementById('auto-detected').textContent = '';
    document.getElementById('auto-download').style.display = 'none';
    clearResult();
}
