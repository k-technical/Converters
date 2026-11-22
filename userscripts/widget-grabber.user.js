// ==UserScript==
// @name         widget-grabber
// @description  Забирает данные схемы со страницы виджета и отдаёт их конвертеру (Ya.Schema 2 Public, T-cloud, Q.Schema)
// @match        https://widget.afisha.yandex.ru/*
// @match        https://ticketscloud.com/*
// @match        https://*.qtickets.ru/*
// @run-at       document-start
// ==/UserScript==
// Замените домены на адреса из ваших ссылок (формат https://домен/*).
// Для третьей строки используйте шаблон с поддоменами: https://*.домен/* (подходит для любых поддоменов).
// Ненужные строки @match удалите.
(function () {
    const IS_TOP = window.top === window.self;
    const RE_PUBLIC = /PUBLIC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const cache = new Map();   // url -> текст (каждый файл запрашиваем один раз)
    const seen = new Set();    // все адреса загруженных ресурсов
    const errors = [];
    let done = false;
    let tries = 0;
    let state = 'Помощник работает. Откройте схему зала на странице…';

    // Буфер ресурсов браузера по умолчанию 250 записей, на тяжёлых страницах схема в него не попадает.
    // Поэтому увеличиваем буфер и собираем адреса "вживую".
    try { performance.setResourceTimingBufferSize(5000); } catch (e) { /* не критично */ }
    try {
        new PerformanceObserver(list => list.getEntries().forEach(e => seen.add(e.name)))
            .observe({ type: 'resource', buffered: true });
    } catch (e) { /* старый браузер: используем getEntriesByType */ }

    function allUrls() {
        try { performance.getEntriesByType('resource').forEach(r => seen.add(r.name)); } catch (e) { /* пропускаем */ }
        try { document.querySelectorAll('script[src]').forEach(s => seen.add(s.src)); } catch (e) { /* DOM ещё не готов */ }
        return Array.from(seen);
    }

    function debugText() {
        const urls = allUrls();
        const rel = urls.filter(u => /public|scheme|\.svg|widget/i.test(u)).slice(0, 60);
        return 'Диагностика помощника\n' + location.origin + '\nресурсов: ' + urls.length +
            '\nошибки: ' + (errors.join('; ') || 'нет') + '\n' + rel.join('\n');
    }

    function badge(text, payload) {
        if (!document.body) return;
        let b = document.getElementById('__widget_grabber');
        if (!b) {
            b = document.createElement('div');
            b.id = '__widget_grabber';
            b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0d1117;color:#c9d1d9;' +
                'border:1px solid #3fb950;border-radius:8px;padding:10px 14px;font:13px -apple-system,Segoe UI,sans-serif;max-width:300px';
            document.body.appendChild(b);
        }
        b.textContent = text;
        const addBtn = (label, fn) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = 'display:block;margin-top:8px;padding:6px 10px;border-radius:6px;border:1px solid #58a6ff;background:#161b22;color:#58a6ff;cursor:pointer';
            btn.onclick = () => fn(btn);
            b.appendChild(btn);
        };
        if (payload) {
            addBtn('Копировать для конвертера', btn => navigator.clipboard.writeText(JSON.stringify(payload)).then(() => { btn.textContent = 'Скопировано ✓'; }));
        } else {
            addBtn('Копировать диагностику', btn => navigator.clipboard.writeText(debugText()).then(() => { btn.textContent = 'Скопировано ✓'; }));
        }
    }

    function getOpener() {
        if (window.opener) return window.opener;
        try { return window.top.opener; } catch (e) { return null; }
    }

    function send(payload) {
        const op = getOpener();
        if (op) {
            op.postMessage(payload, '*');
            badge('Отправлено в конвертер ✓');
        } else {
            badge('Нет связи с конвертером. Откройте страницу кнопкой из конвертера или скопируйте данные.', payload);
        }
    }

    // Текст файла: сначала обычный fetch, затем (если разрешён в расширении) GM.xmlHttpRequest
    async function load(u) {
        if (cache.has(u)) return cache.get(u);
        let t = '';
        try {
            t = (await (await fetch(u)).text()).replace(/^\uFEFF/, '').trim();
        } catch (e) {
            try {
                if (typeof GM !== 'undefined' && GM.xmlHttpRequest) {
                    t = await new Promise((res, rej) => GM.xmlHttpRequest({
                        method: 'GET', url: u, onload: r => res(String(r.responseText || '')), onerror: rej
                    }));
                    t = t.replace(/^\uFEFF/, '').trim();
                }
            } catch (e2) { /* ниже запишем ошибку */ }
            if (!t) {
                let host = u;
                try { host = new URL(u).host; } catch (e3) { /* оставляем как есть */ }
                errors.push('не скачался ' + host);
            }
        }
        cache.set(u, t);
        return t;
    }

    async function grab() {
        const urls = allUrls();

        // 1) Ya.Schema 2 Public: два файла PUBLIC-<uuid> (JSON с levels и подложка)
        const pub = urls.filter(u => RE_PUBLIC.test(u));
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

        // 2) Q.Schema: файл с кодом схемы (*_public.js или встроенный) + SVG подложка
        let code = '';
        const jsUrl = urls.find(u => /_public\.js(\?|#|$)/i.test(u) || /scheme[^/]*\.js(\?|#|$)/i.test(u));
        if (jsUrl) code = await load(jsUrl);
        if (!/schemeConfig/.test(code)) {
            try {
                const inline = Array.from(document.scripts).map(s => s.textContent || '').find(t => /window\.schemeConfig\s*=/.test(t));
                code = inline || '';
            } catch (e) { code = ''; }
        }
        if (/schemeConfig/.test(code)) {
            const im = code.match(/"image"\s*:\s*"([^"]+\.svg[^"]*)"/);
            const imgUrl = urls.find(u => /scheme[^/]*\.svg(\?|#|$)|\/schemes\/[^?#]*\.svg/i.test(u)) || (im ? im[1].replace(/\\\//g, '/') : '');
            if (imgUrl) {
                const svg = await load(imgUrl);
                if (/<svg[\s>]/i.test(svg.slice(0, 2000))) { send({ type: 'q-files', js: code, svg: svg }); return true; }
            }
            state = 'Код схемы найден, подложка не скачалась. Нажмите «Копировать диагностику».';
        }

        // 3) T-cloud: один SVG со схемой (есть атрибуты tc-row-no)
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

    // Проверка раз в 1.5 секунды до 5 минут (схема может открыться не сразу)
    const timer = setInterval(async () => {
        if (done) { clearInterval(timer); return; }
        if (++tries > 200) {
            clearInterval(timer);
            if (IS_TOP) badge('Данные схемы не найдены. Нажмите «Копировать диагностику» и пришлите текст.');
            return;
        }
        let ok = false;
        try { ok = await grab(); } catch (e) { errors.push(String(e && e.message || e)); }
        if (ok) { done = true; clearInterval(timer); return; }
        if (IS_TOP && tries % 2 === 1) badge(state + ' (ресурсов: ' + seen.size + ')');
    }, 1500);
})();
