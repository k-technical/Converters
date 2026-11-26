// ==UserScript==
// @name         widget-hook
// @description  Перехватывает данные страницы (после расшифровки) и отдаёт их конвертеру
// @match        https://*.intickets.ru/*
// @run-at       document-start
// @inject-into  page
// ==/UserScript==
// Работает в контексте страницы: данные приходят зашифрованными и расшифровываются самой страницей,
// поэтому их можно взять только в момент разбора JSON.
(function () {
    if (window.__widgetHook) return;
    window.__widgetHook = true;

    const VERSION = '1';
    const WAIT_SVG_MS = 4000; // сколько ждём подложку после того, как найдены данные
    let best = null;          // данные: [[сектора], [места]]
    let bestSvg = '';         // самая большая подложка (SVG) среди ответов страницы
    let timer = null;
    let sent = false;

    // Совместимость: массив jl с найденными данными (для ручной команды в консоли)
    window.jl = window.jl || [];

    function isSeatData(r) {
        return Array.isArray(r) && Array.isArray(r[0]) && Array.isArray(r[1]) && r[1].length > 20 &&
            Array.isArray(r[1][0]) && r[1][0].length === 6 && typeof r[1][0][1] === 'string' &&
            typeof r[1][0][3] === 'number' && typeof r[1][0][4] === 'number';
    }

    function badge(text, payload) {
        if (!document.body) { document.addEventListener('DOMContentLoaded', () => badge(text, payload)); return; }
        let b = document.getElementById('__widget_hook');
        if (!b) {
            b = document.createElement('div');
            b.id = '__widget_hook';
            b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0d1117;color:#c9d1d9;' +
                'border:1px solid #3fb950;border-radius:8px;padding:10px 14px;font:13px -apple-system,Segoe UI,sans-serif;max-width:300px';
            document.body.appendChild(b);
        }
        b.textContent = text;
        if (payload) {
            const btn = document.createElement('button');
            btn.textContent = 'Копировать для конвертера';
            btn.style.cssText = 'display:block;margin-top:8px;padding:6px 10px;border-radius:6px;border:1px solid #58a6ff;background:#161b22;color:#58a6ff;cursor:pointer';
            btn.onclick = () => navigator.clipboard.writeText(JSON.stringify(payload)).then(() => { btn.textContent = 'Скопировано ✓'; });
            b.appendChild(btn);
        }
    }

    function getOpener() {
        if (window.opener) return window.opener;
        try { return window.top.opener; } catch (e) { return null; }
    }

    function flush() {
        if (sent || !best) return;
        sent = true;
        const payload = { type: 'inti-data', json: JSON.stringify(best), svg: bestSvg };
        const op = getOpener();
        if (op) {
            op.postMessage(payload, '*');
            badge('Отправлено в конвертер ✓ (мест: ' + best[1].length + (bestSvg ? ', подложка найдена' : ', без подложки') + ')');
        } else {
            badge('Нет связи с конвертером. Откройте страницу кнопкой из конвертера или скопируйте данные.', payload);
        }
    }

    function onSeatData(r) {
        if (best && best[1].length >= r[1].length) return;
        best = r;
        window.jl.length = 0;
        window.jl.push(r);
        badge('Данные найдены (мест: ' + r[1].length + '), жду подложку…');
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, WAIT_SVG_MS);
    }

    // Разбор JSON: страница вызывает его уже для расшифрованных данных
    const JP = JSON.parse;
    JSON.parse = function () {
        const r = JP.apply(this, arguments);
        try { if (isSeatData(r)) onSeatData(r); } catch (e) { /* не мешаем странице */ }
        return r;
    };

    // Подложка: самый большой SVG среди ответов страницы
    function checkText(t) {
        if (typeof t !== 'string' || t.length < 3000) return;
        if (/<svg[\s>]/i.test(t.slice(0, 2000)) && t.length > bestSvg.length) {
            bestSvg = t;
            if (best && !sent) { if (timer) clearTimeout(timer); timer = setTimeout(flush, 600); }
        }
    }

    try {
        const FT = window.fetch;
        window.fetch = function () {
            const p = FT.apply(this, arguments);
            p.then(res => { try { res.clone().text().then(checkText).catch(() => {}); } catch (e) { /* пропускаем */ } }).catch(() => {});
            return p;
        };
        const XS = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
            this.addEventListener('load', () => { try { checkText(this.responseText); } catch (e) { /* не текстовый ответ */ } });
            return XS.apply(this, arguments);
        };
    } catch (e) { /* без перехвата подложки: её можно загрузить вручную */ }
})();
