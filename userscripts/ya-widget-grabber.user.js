// ==UserScript==
// @name         ya-widget-grabber
// @description  Забирает JSON схемы и подложку со страницы виджета и отдаёт их конвертеру
// @match        https://ДОМЕН-ВИДЖЕТА/*
// @run-at       document-idle
// ==/UserScript==
// Перед использованием замените ДОМЕН-ВИДЖЕТА на домен из вашей ссылки (например https://домен/*).
(function () {
    if (window.top !== window.self) return;
    const RE = /PUBLIC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    let done = false;

    function badge(text, withCopy, payload) {
        let b = document.getElementById('__ya_grabber');
        if (!b) {
            b = document.createElement('div');
            b.id = '__ya_grabber';
            b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0d1117;color:#c9d1d9;' +
                'border:1px solid #3fb950;border-radius:8px;padding:10px 14px;font:13px -apple-system,Segoe UI,sans-serif;max-width:280px';
            document.body.appendChild(b);
        }
        b.textContent = text;
        if (withCopy) {
            const btn = document.createElement('button');
            btn.textContent = 'Копировать для конвертера';
            btn.style.cssText = 'display:block;margin-top:8px;padding:6px 10px;border-radius:6px;border:1px solid #58a6ff;background:#161b22;color:#58a6ff;cursor:pointer';
            btn.onclick = () => navigator.clipboard.writeText(JSON.stringify(payload)).then(() => { btn.textContent = 'Скопировано ✓'; });
            b.appendChild(btn);
        }
    }

    async function grab() {
        const urls = [...new Set(performance.getEntriesByType('resource').map(r => r.name).filter(u => RE.test(u)))];
        if (urls.length < 2) return false;
        let json = null, svg = null;
        for (const u of urls) {
            try {
                const t = (await (await fetch(u)).text()).replace(/^\uFEFF/, '').trim();
                if (/<svg[\s>]/i.test(t.slice(0, 2000))) {
                    svg = t;
                } else if (t[0] === '{') {
                    const o = JSON.parse(t);
                    if (o && (Array.isArray(o.levels) || o.result)) json = t;
                }
            } catch (e) { /* пропускаем чужие ресурсы */ }
        }
        if (!json || !svg) return false;

        const payload = { type: 'ya-schema-files', json: json, svg: svg };
        if (window.opener) {
            window.opener.postMessage(payload, '*');
            badge('Отправлено в конвертер ✓');
        } else {
            badge('Нет связи с конвертером. Откройте виджет кнопкой из конвертера или скопируйте данные.', true, payload);
        }
        return true;
    }

    let tries = 0;
    const timer = setInterval(async () => {
        if (done || ++tries > 90) { clearInterval(timer); return; }
        if (await grab()) { done = true; clearInterval(timer); }
    }, 1000);
})();
