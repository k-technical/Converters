// ==UserScript==
// @name         widget-grabber
// @description  Забирает данные схемы со страницы виджета и отдаёт их конвертеру (Ya.Schema 2 Public, T-cloud, Q.Schema)
// @match        https://widget.afisha.yandex.ru/*
// @match        https://ticketscloud.com/*
// @match        https://*.qtickets.ru/*
// @match        https://*.qtickets.tech/*
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      cdn.qtickets.tech
// ==/UserScript==
// Замените домены на адреса из ваших ссылок (формат https://домен/*).
// Для третьей строки используйте шаблон с поддоменами: https://*.домен/* (подходит для любых поддоменов).
// Ненужные строки @match удалите. Если схема загружается во вложенном окне другого домена, добавьте для него отдельную строку @match.
(function () {
    const VERSION = '5';
    const IS_TOP = window.top === window.self;
    const RE_PUBLIC = /PUBLIC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const cache = new Map();   // url -> текст (каждый файл запрашиваем один раз)
    const seen = new Set();    // все адреса загруженных ресурсов
    const errors = [];
    const fails = new Map(); // url -> число неудачных скачиваний
    const addErr = m => { if (!errors.includes(m)) errors.push(m); };
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

    const frames = new Map(); // сводки от вложенных окон (фреймов)
    const strip = u => String(u).split('?')[0].split('#')[0]; // параметры адреса могут содержать токены сессии

    function debugText() {
        const urls = allUrls();
        let iframes = [];
        try { iframes = Array.from(document.querySelectorAll('iframe')).map(f => strip(f.src || 'без src')); } catch (e) { /* нет DOM */ }
        const fr = Array.from(frames.values()).map(f => '  ' + f.host + f.path + ' | ресурсов: ' + f.n + (f.st ? '\n    статус: ' + f.st : '') + '\n    ошибки: ' + (f.err.join('; ') || 'нет') + (f.rel.length ? '\n    ' + f.rel.join('\n    ') : ''));
        return 'Диагностика помощника (версия ' + VERSION + ')\n' + strip(location.href) + '\nресурсов: ' + urls.length +
            '\nошибки: ' + (errors.join('; ') || 'нет') +
            '\niframe на странице (' + iframes.length + '): ' + (iframes.join(', ') || 'нет') +
            '\nфреймы, где работает помощник (' + fr.length + '):\n' + (fr.join('\n') || '  нет') +
            '\nадреса ресурсов (до 120, без параметров):\n' + urls.slice(0, 120).map(strip).join('\n');
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
        if (!IS_TOP) {
            // Во фрейме нет связи с конвертером: передаём данные главному окну страницы
            try { window.top.postMessage({ type: '__wg_payload', payload: payload }, '*'); } catch (e) { addErr('фрейм не смог передать данные'); }
            return;
        }
        const op = getOpener();
        if (op) {
            op.postMessage(payload, '*');
            badge('Отправлено в конвертер ✓');
        } else {
            badge('Нет связи с конвертером. Откройте страницу кнопкой из конвертера или скопируйте данные.', payload);
        }
    }

    // Главное окно принимает сводки и данные от фреймов
    if (IS_TOP) {
        window.addEventListener('message', (e) => {
            const d = e.data;
            if (!d || typeof d !== 'object') return;
            if (d.type === '__wg_frame') {
                frames.set(String(d.host) + String(d.path), { host: String(d.host), path: String(d.path), n: d.n | 0, rel: Array.isArray(d.rel) ? d.rel.slice(0, 40).map(String) : [], err: Array.isArray(d.err) ? d.err.slice(0, 10).map(String) : [], st: String(d.st || '') });
            } else if (d.type === '__wg_payload' && !done && d.payload && typeof d.payload.type === 'string') {
                done = true;
                send(d.payload);
            }
        });
    }

    // Текст файла: сначала обычный fetch, затем GM.xmlHttpRequest (обходит запрет CORS, если разрешён в шапке скрипта)
    function gmGet(url) {
        return new Promise((res, rej) => {
            const opts = { method: 'GET', url: url, onload: r => res(String((r && r.responseText) || '')), onerror: () => rej(new Error('gm error')), ontimeout: () => rej(new Error('gm timeout')) };
            if (typeof GM !== 'undefined' && GM.xmlHttpRequest) GM.xmlHttpRequest(opts);
            else if (typeof GM_xmlhttpRequest !== 'undefined') GM_xmlhttpRequest(opts);
            else rej(new Error('нет GM API'));
        });
    }

    async function load(u) {
        if (cache.has(u)) return cache.get(u);
        let t = '';
        let how = 'fetch';
        try {
            t = (await (await fetch(u)).text()).replace(/^\uFEFF/, '').trim();
        } catch (e) {
            how = 'GM';
            try { t = (await gmGet(u)).replace(/^\uFEFF/, '').trim(); } catch (e2) { how = 'GM: ' + (e2 && e2.message || e2); }
        }
        if (t) { cache.set(u, t); return t; }
        let host = u;
        try { host = new URL(u).host; } catch (e3) { /* оставляем как есть */ }
        addErr('не скачался ' + host + ' (' + how + ')');
        const n = (fails.get(u) || 0) + 1;
        fails.set(u, n);
        if (n >= 3) cache.set(u, ''); // после трёх неудач не повторяем
        return '';
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

        // 2) Q.Schema: файл с кодом схемы (*.public.js / *_public.js или встроенный) + SVG подложка
        let code = '';
        const jsUrl = urls.find(u => /[._]public\.js(\?|#|$)/i.test(u) || /scheme[^/]*\.js(\?|#|$)/i.test(u));
        if (jsUrl) {
            code = await load(jsUrl);
            state = 'Q: файл кода найден, ' + (code ? 'скачан' : 'не скачался');
        }
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
                state = 'Q: код есть, подложка ' + (svg ? 'скачана, но это не SVG' : 'не скачалась');
            } else {
                state = 'Q: код есть, адрес подложки не найден';
            }
        } else if (jsUrl && code) {
            state = 'Q: файл кода найден, но в нём нет schemeConfig';
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
        try { ok = await grab(); } catch (e) { addErr(String(e && e.message || e)); }
        if (ok) { done = true; clearInterval(timer); return; }
        if (IS_TOP && tries % 2 === 1) badge(state + ' (ресурсов: ' + seen.size + ', фреймов с помощником: ' + frames.size + ')');
        if (!IS_TOP && tries % 2 === 1) {
            try {
                const rel = allUrls().filter(x => /public|scheme|\.svg|widget|\.js(\?|$)/i.test(x)).slice(0, 30).map(strip);
                window.top.postMessage({ type: '__wg_frame', host: location.host, path: location.pathname, n: seen.size, rel: rel, err: errors.slice(-8), st: state }, '*');
            } catch (e) { /* нет доступа */ }
        }
    }, 1500);
})();
