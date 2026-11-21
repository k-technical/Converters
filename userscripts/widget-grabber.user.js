// ==UserScript==
// @name         widget-grabber
// @description  Забирает данные схемы со страницы виджета и отдаёт их конвертеру (Ya.Schema 2 Public и T-cloud)
// @match        https://ДОМЕН-ВИДЖЕТА-1/*
// @match        https://ДОМЕН-ВИДЖЕТА-2/*
// @run-at       document-idle
// ==/UserScript==
// Замените ДОМЕН-ВИДЖЕТА-1 и ДОМЕН-ВИДЖЕТА-2 на домены из ваших ссылок на виджеты (формат https://домен/*).
// Если домен один, вторую строку @match удалите.
(function () {
    if (window.top !== window.self) return;
    const RE = /PUBLIC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const cache = new Map(); // url -> текст (каждый файл запрашиваем один раз)
    let done = false;

    function badge(text, payload) {
        let b = document.getElementById('__widget_grabber');
        if (!b) {
            b = document.createElement('div');
            b.id = '__widget_grabber';
            b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0d1117;color:#c9d1d9;' +
                'border:1px solid #3fb950;border-radius:8px;padding:10px 14px;font:13px -apple-system,Segoe UI,sans-serif;max-width:280px';
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

    function send(payload) {
        if (window.opener) {
            window.opener.postMessage(payload, '*');
            badge('Отправлено в конвертер ✓');
        } else {
            badge('Нет связи с конвертером. Откройте виджет кнопкой из конвертера или скопируйте данные.', payload);
        }
    }

    async function load(u) {
        if (cache.has(u)) return cache.get(u);
        let t = '';
        try { t = (await (await fetch(u)).text()).replace(/^\uFEFF/, '').trim(); } catch (e) { /* чужой ресурс */ }
        cache.set(u, t);
        return t;
    }

    async function grab() {
        const urls = [...new Set(performance.getEntriesByType('resource').map(r => r.name))];

        // 1) Ya.Schema 2 Public: два файла PUBLIC-<uuid> (JSON с levels и подложка)
        const pub = urls.filter(u => RE.test(u));
        if (pub.length >= 2) {
            let json = null, svg = null;
            for (const u of pub) {
                const t = await load(u);
                if (/<svg[\s>]/i.test(t.slice(0, 2000))) {
                    svg = t;
                } else if (t[0] === '{') {
                    try {
                        const o = JSON.parse(t);
                        if (o && (Array.isArray(o.levels) || o.result)) json = t;
                    } catch (e) { /* не JSON схемы */ }
                }
            }
            if (json && svg) { send({ type: 'ya-schema-files', json: json, svg: svg }); return true; }
        }

        // 2) T-cloud: один SVG со схемой (есть атрибуты tc-row-no)
        const svgs = urls.filter(u => /\.svg(\?|#|$)/i.test(u)).slice(0, 40);
        for (const u of svgs) {
            const t = await load(u);
            if (/<svg[\s>]/i.test(t.slice(0, 2000)) && /tc-row-no/.test(t)) {
                send({ type: 'tcloud-svg', svg: t });
                return true;
            }
        }
        return false;
    }

    let tries = 0;
    const timer = setInterval(async () => {
        if (done || ++tries > 90) { clearInterval(timer); return; }
        if (await grab()) { done = true; clearInterval(timer); }
    }, 1000);
})();
