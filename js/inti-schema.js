// Модуль inti: данные JSON + необязательная подложка -> SVG
const INTI_PAL = ['#0275cc', '#db0000', '#54ba00', '#fabc41', '#ff00f7', '#00b7b7', '#8a4fff', '#ff7a00'];
let intiSectors = [];
let intiSeats = [];
let intiSub = null;

function initInti() {
    setupDropzone('inti-dropzone', 'inti-file', readIntiFile);
    document.getElementById('inti-subtxt').addEventListener('input', () => loadIntiSub(document.getElementById('inti-subtxt').value));
    document.getElementById('inti-src').addEventListener('input', () => { parseInti(true); });
    document.querySelectorAll('#panel-inti [data-copy]').forEach(b => {
        b.addEventListener('click', () => {
            navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent).then(() => {
                const t = b.textContent;
                b.textContent = 'Скопировано';
                setTimeout(() => { b.textContent = t; }, 1200);
            });
        });
    });
}

async function readIntiFile(file) {
    const t = await file.text();
    document.getElementById('inti-subtxt').value = t;
    loadIntiSub(t);
}

function loadIntiSub(t) {
    const info = document.getElementById('inti-subinfo');
    if (!t.trim()) { intiSub = null; info.textContent = ''; return; }
    const m = t.match(/<svg[^>]*>/i);
    const vb = m && m[0].match(/viewBox\s*=\s*"([^"]*)"/i);
    const box = vb ? parseViewBox(vb[1]) : null;
    if (!m || !box) { intiSub = null; info.textContent = 'Не найден <svg> или viewBox'; return; }
    intiSub = { vb: box, inner: t.slice(t.indexOf(m[0]) + m[0].length, t.lastIndexOf('</svg>')) };
    info.textContent = '✓ подложка загружена, viewBox: ' + box.join(' ');
    info.style.color = '#3fb950';
}

// Проверка и разбор данных; quiet = без сообщений об ошибке (при вводе)
function parseInti(quiet) {
    let d;
    try { d = JSON.parse(document.getElementById('inti-src').value); }
    catch (e) { if (!quiet) throw new Error('Ошибка JSON'); return false; }
    const bad = () => { if (!quiet) throw new Error('Это не данные мест. Нужен массив [[сектора],[места]], где место = [id,"ряд","место",x,y,сектор]'); return false; };
    if (!Array.isArray(d) || !Array.isArray(d[0]) || !Array.isArray(d[1])) return bad();
    const t = d[1][0], q = d[0][0];
    if (!(Array.isArray(t) && t.length === 6 && typeof t[1] === 'string' && typeof t[3] === 'number' &&
          typeof t[4] === 'number' && Array.isArray(q) && typeof q[1] === 'string' && d[1].length > 20)) return bad();
    intiSectors = d[0];
    intiSeats = d[1];
    const sel = document.getElementById('inti-sec');
    const cur = sel.value;
    sel.innerHTML = '<option value="">все</option>' + intiSectors.map(s => `<option value="${esc(s[0])}">${esc(s[1])}</option>`).join('');
    sel.value = cur;
    return true;
}

function processInti() {
    try {
        parseInti(false);
        const secId = document.getElementById('inti-sec').value;
        const fmt = document.getElementById('inti-fmt').value;
        const r = seatR(8);
        const names = {}, idx = {};
        intiSectors.forEach((s, i) => { names[s[0]] = s[1]; idx[s[0]] = i; });
        const list = intiSeats.filter(s => !secId || String(s[5]) === secId);
        if (!list.length) throw new Error('Нет мест');

        const xs = list.map(s => s[3]), ys = list.map(s => s[4]), pad = r + 10;
        let x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
        let w = Math.max(...xs) + pad - x0, h = Math.max(...ys) + pad - y0;
        if (intiSub) [x0, y0, w, h] = intiSub.vb;

        const useColor = document.getElementById('inti-col').checked;
        const seen = new Set();
        let dup = 0;
        const circle = s => {
            const id = fmt.replace(/\{r\}/g, s[1]).replace(/\{s\}/g, s[2]).replace(/\{sec\}/g, names[s[5]]);
            if (seen.has(id)) dup++;
            seen.add(id);
            const c = useColor ? INTI_PAL[idx[s[5]] % INTI_PAL.length] : '#0275cc';
            return `<circle id="${esc(id)}" cx="${s[3]}" cy="${s[4]}" r="${r}" fill="${c}"/>`;
        };

        let body;
        if (document.getElementById('inti-grp').checked) {
            const g = {};
            list.forEach(s => (g[s[5]] = g[s[5]] || []).push(s));
            body = Object.keys(g).map(k => `<g id="${esc(cleanName(names[k], 'sector'))}">\n${g[k].map(circle).join('\n')}\n</g>`).join('\n');
        } else {
            body = list.map(circle).join('\n');
        }
        const back = intiSub ? `<g id="Подложка">${intiSub.inner}</g>\n` : '';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}">\n${back}<g id="Места">\n${body}\n</g>\n</svg>`;

        if (dup) addWarn('Выберите один сектор или добавьте {sec} в формат id');
        showPreview(svg);
        setStatus('✓ Мест: ' + list.length);
        document.getElementById('inti-download').style.display = 'block';
    } catch (e) {
        handleError(e);
    }
}

function downloadInti() { downloadCurrentResult('inti.svg'); }

function clearInti() {
    ['inti-src', 'inti-subtxt'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('inti-file').value = '';
    document.getElementById('inti-link').value = '';
    intiWin = null;
    document.getElementById('inti-subinfo').textContent = '';
    document.getElementById('inti-sec').innerHTML = '<option value="">все</option>';
    intiSub = null; intiSectors = []; intiSeats = [];
    clearResult();
}

// ---- Автозагрузка по ссылке (нужен скрипт-помощник widget-hook.user.js) ----
let intiWin = null;

function intiOpenWidget() {
    const url = document.getElementById('inti-link').value.trim();
    if (!/^https:\/\//i.test(url)) { setStatus('Вставьте ссылку (начинается с https://)', true); return; }
    intiWin = window.open(url, '_blank');
    if (!intiWin) { setStatus('Браузер заблокировал окно: разрешите всплывающие окна для этой страницы', true); return; }
    setStatus('Жду данные… (должен работать скрипт-помощник)');
}

function intiApplyBundle(d) {
    if (!d || typeof d.json !== 'string') { setStatus('Неверный формат данных от помощника', true); return; }
    document.getElementById('inti-src').value = d.json;
    if (typeof d.svg === 'string' && d.svg) {
        document.getElementById('inti-subtxt').value = d.svg;
        loadIntiSub(d.svg);
    }
    try { parseInti(false); } catch (e) { setStatus('Ошибка: ' + e.message, true); return; }
    processInti();
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'inti-data') return;
    if (!intiWin || e.source !== intiWin) return; // только от окна, открытого кнопкой
    intiApplyBundle(d);
    try { intiWin.close(); } catch (err) { /* окно можно закрыть вручную */ }
});

async function intiPasteBundle() {
    try {
        const d = JSON.parse(await navigator.clipboard.readText());
        if (d.type !== 'inti-data') throw new Error('not bundle');
        intiApplyBundle(d);
    } catch (e) {
        setStatus('В буфере нет данных от помощника (нажмите «Копировать для конвертера» на странице)', true);
    }
}

document.addEventListener('DOMContentLoaded', initInti);
