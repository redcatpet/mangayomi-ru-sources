// === lib_family_base.js ===
// Shared helpers for MangaLib/AnimeLib/Ranobelib/YaoiLib/HentaiLib —
// all use `api.cdnlibs.org/api` with `Site-Id` header switching.
//
// Usage: each source file `// @include: lib_family_base` then declares
// `class DefaultExtension extends MProvider` that calls these functions.
// siteId values (confirmed from deployed Aidoku sources):
//   1 = MangaLib (манга)
//   2 = SlashLib
//   3 = RanobeLib (ранобэ)
//   4 = HentaiLib (18+ манга)
//   5 = AniLib   (аниме)
//   6 = YaoiLib  (BL)

const LIB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ProseMirror doc → plain text (descriptions/metadata)
function libProseMirrorToText(node) {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) {
        let out = "";
        for (const n of node) out += libProseMirrorToText(n);
        return out;
    }
    if (typeof node !== "object") return String(node);
    const type = node.type;
    if (type === "text") return node.text || "";
    if (type === "hardBreak") return "\n";
    if (type === "paragraph") return libProseMirrorToText(node.content || []) + "\n\n";
    if (type === "heading") return libProseMirrorToText(node.content || []) + "\n\n";
    if (type === "bulletList" || type === "orderedList") {
        const items = (node.content || []).map(c => "• " + libProseMirrorToText(c).trim()).join("\n");
        return items + "\n\n";
    }
    if (type === "listItem") return libProseMirrorToText(node.content || []);
    if (node.content) return libProseMirrorToText(node.content);
    return "";
}

// ProseMirror doc → HTML (novel reader)
function libProseMirrorToHtml(node) {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) {
        let out = "";
        for (const n of node) out += libProseMirrorToHtml(n);
        return out;
    }
    if (typeof node !== "object") return String(node);
    const type = node.type;
    if (type === "text") {
        let t = node.text || "";
        t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return t;
    }
    if (type === "hardBreak") return "<br>";
    if (type === "paragraph") return "<p>" + libProseMirrorToHtml(node.content || []) + "</p>";
    if (type === "heading") {
        const lvl = (node.attrs && node.attrs.level) || 2;
        return `<h${lvl}>${libProseMirrorToHtml(node.content || [])}</h${lvl}>`;
    }
    if (type === "bulletList") return "<ul>" + libProseMirrorToHtml(node.content || []) + "</ul>";
    if (type === "orderedList") return "<ol>" + libProseMirrorToHtml(node.content || []) + "</ol>";
    if (type === "listItem") return "<li>" + libProseMirrorToHtml(node.content || []) + "</li>";
    if (node.content) return libProseMirrorToHtml(node.content);
    return "";
}

// Proxy cover.imglib.info through weserv.nl — bypasses Referer check
function libProxyImage(url) {
    if (!url) return "";
    const s = String(url);
    if (!s.startsWith("http")) return s;
    const stripped = s.replace(/^https?:\/\//, "");
    return "https://images.weserv.nl/?url=" + encodeURIComponent(stripped);
}

function libCoerceString(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object") {
        if (v.type || v.content) return libProseMirrorToText(v).trim();
        if (v.text != null) return String(v.text);
        if (v.name != null) return String(v.name);
        if (v.value != null) return String(v.value);
    }
    return "";
}

function libApiHeaders(source, siteId) {
    const token = (new SharedPreferences()).get("authToken") || "";
    // Both Origin AND Referer are required — cdnlibs returns 403 without them
    const headers = {
        "Accept": "*/*",
        "Accept-Language": "ru,en;q=0.5",
        "User-Agent": LIB_UA,
        "Site-Id": String(siteId),
        "Origin": source.baseUrl,
        "Referer": source.baseUrl + "/"
    };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
}

// Some users paste a Bearer token issued for a DIFFERENT site (e.g. mangalib token
// pasted into hentailib settings). The API rejects with 422 "audience mismatch".
// Public catalog endpoints work without auth, so retry without the Authorization
// header on 401/422.
async function libGetWithFallback(client, url, source, siteId) {
    const headers = libApiHeaders(source, siteId);
    let res = await client.get(url, headers);
    if (res && (res.statusCode === 401 || res.statusCode === 422) && headers.Authorization) {
        const noAuthHeaders = Object.assign({}, headers);
        delete noAuthHeaders.Authorization;
        const retry = await client.get(url, noAuthHeaders);
        if (retry && retry.statusCode === 200) return retry;
    }
    return res;
}

function libParseStatus(label) {
    if (!label) return 5;
    const m = {
        "Онгоинг": 0, "Продолжается": 0,
        "Завершён": 1, "Завершен": 1,
        "Приостановлен": 2,
        "Выпуск прекращён": 3,
        "Анонс": 4
    };
    return m[label] ?? 5;
}

// Web path prefix per site type — used to build `link` so Mangayomi's "Web view" button
// produces a valid URL (`baseUrl + link` -> "https://mangalib.org/ru/manga/206--one-piece").
// Without this prefix the join produces "https://mangalib.org206--one-piece" → 404.
function libWebPathPrefix(siteId) {
    if (siteId === 5) return "/ru/anime/";
    if (siteId === 3 || siteId === 6) return "/ru/book/";
    return "/ru/manga/";  // site_id=1 (mangalib), 2 (slashlib), 4 (hentailib)
}

// Generic list parser. `resource` = "manga" | "anime" — both live on cdnlibs.
async function libParseList(client, source, siteId, resource, url) {
    try {
        const res = await libGetWithFallback(client, url, source, siteId);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        const json = JSON.parse(res.body);
        const webPrefix = libWebPathPrefix(siteId);
        const list = (json.data || []).map(m => ({
            name: libCoerceString(m.rus_name || m.eng_name || m.name || ""),
            imageUrl: libProxyImage(libCoerceString((m.cover && (m.cover.thumbnail || m.cover.default)) || "")),
            link: webPrefix + libCoerceString(m.slug_url || m.slug || "")
        }));
        let hasNext = false;
        if (json.meta) {
            if (json.meta.has_next_page != null) hasNext = !!json.meta.has_next_page;
            else if (json.meta.current_page != null && json.meta.last_page != null) {
                hasNext = json.meta.current_page < json.meta.last_page;
            } else if (json.meta.pagination) {
                const p = json.meta.pagination;
                hasNext = (p.current_page || 0) < (p.total_pages || p.last_page || 0);
            }
        }
        return { list, hasNextPage: hasNext };
    } catch (e) {
        return { list: [], hasNextPage: false };
    }
}

async function libGetPopular(client, source, siteId, resource, page) {
    // For anime: `views` puts classics (Jujutsu Kaisen, etc.) first.
    // `rate_avg` lists highly-rated upcoming titles with 0 episodes — bad first impression.
    // For manga/novel: `rate_avg` stays — those don't have the 0-chapter problem.
    const sortKey = resource === "anime" ? "views" : "rate_avg";
    return await libParseList(client, source, siteId, resource,
        `${source.apiUrl}/${resource}?page=${page}&site_id[]=${siteId}&sort_by=${sortKey}`);
}

async function libGetLatest(client, source, siteId, resource, page) {
    // anime endpoint rejects sort_by=last_chapter_at (422); use last_episode_at instead.
    const sortKey = resource === "anime" ? "last_episode_at" : "last_chapter_at";
    return await libParseList(client, source, siteId, resource,
        `${source.apiUrl}/${resource}?page=${page}&site_id[]=${siteId}&sort_by=${sortKey}`);
}

async function libSearch(client, source, siteId, resource, query, page, filters) {
    let url = `${source.apiUrl}/${resource}?page=${page}&site_id[]=${siteId}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (filters && filters.length) {
        // [0] SortFilter — sort_by + sort_type
        const f0 = filters[0];
        if (f0 && f0.values) {
            const idx = (f0.state && f0.state.index != null) ? f0.state.index : 0;
            const val = f0.values[idx].value;
            if (val) url += `&sort_by=${val}`;
            if (f0.state && f0.state.ascending) url += `&sort_type=asc`;
        }
        // [1] Genres (TriState: 1=include, 2=exclude)
        const f1 = filters[1];
        if (f1 && f1.state) {
            for (const g of f1.state) {
                if (g.state === 1) url += `&genres[]=${g.value}`;
                else if (g.state === 2) url += `&genres_exclude[]=${g.value}`;
            }
        }
        // [2] Status (CheckBox group)
        const f2 = filters[2];
        if (f2 && f2.state) for (const s of f2.state) if (s.state) url += `&status[]=${s.value}`;
        // [3] Types (CheckBox group) — not applicable to anime but harmless
        const f3 = filters[3];
        if (f3 && f3.state) for (const t of f3.state) if (t.state) url += `&types[]=${t.value}`;
    }
    return await libParseList(client, source, siteId, resource, url);
}

// Shared filter list — works for manga/novel/anime (some params ignored by server if not applicable).
// Based on kodjodevf mangalib reference + live probe.
function libFilterList() {
    return [
        {
            type_name: "SortFilter",
            type: "sort",
            name: "Сортировка",
            state: { type_name: "SortState", index: 0, ascending: false },
            values: [
                ["По популярности", ""],
                ["По рейтингу", "rate_avg"],
                ["По просмотрам", "views"],
                ["Количество глав", "chap_count"],
                ["Дата релиза", "releaseDate"],
                ["Дата обновления", "last_chapter_at"],
                ["Дата добавления", "created_at"],
                ["Название (A-Z)", "name"],
                ["Название (А-Я)", "rus_name"]
            ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
        },
        {
            type_name: "GroupFilter",
            type: "genres",
            name: "Жанры",
            state: [
                ["Арт", 32], ["Безумие", 91], ["Боевик", 34], ["Боевые искусства", 35],
                ["Вампиры", 36], ["Военное", 89], ["Гарем", 37], ["Гендерная интрига", 38],
                ["Героическое фэнтези", 39], ["Демоны", 81], ["Детектив", 40], ["Детское", 88],
                ["Драма", 43], ["Игра", 44], ["Исэкай", 79], ["История", 45], ["Киберпанк", 46],
                ["Кодомо", 76], ["Комедия", 47], ["Космос", 83], ["Магия", 85],
                ["Махо-сёдзё", 48], ["Машины", 90], ["Меха", 49], ["Мистика", 50],
                ["Музыка", 80], ["Научная фантастика", 51], ["Омегаверс", 77], ["Пародия", 86],
                ["Повседневность", 52], ["Полиция", 82], ["Постапокалиптика", 53],
                ["Приключения", 54], ["Психология", 55], ["Романтика", 56],
                ["Сверхъестественное", 58], ["Сёдзё", 59], ["Сёдзё-ай", 60],
                ["Сёнэн-ай", 62], ["Спорт", 63], ["Супер сила", 87], ["Сэйнэн", 64],
                ["Трагедия", 65], ["Триллер", 66], ["Ужасы", 67], ["Фантастика", 68],
                ["Фэнтези", 69], ["Хентай", 84], ["Эротика", 71], ["Этти", 72]
            ].map(x => ({ type_name: "TriState", name: x[0], value: String(x[1]) }))
        },
        {
            type_name: "GroupFilter",
            type: "status",
            name: "Статус",
            state: [
                ["Онгоинг", 1], ["Завершён", 2], ["Анонс", 3], ["Приостановлен", 4], ["Выпуск прекращён", 5]
            ].map(x => ({ type_name: "CheckBox", name: x[0], value: String(x[1]) }))
        },
        {
            type_name: "GroupFilter",
            type: "types",
            name: "Тип (только манга/новелла)",
            state: [
                ["Манга", 1], ["OEL-манга", 4], ["Манхва", 5], ["Маньхуа", 6],
                ["Руманга", 8], ["Комикс", 9]
            ].map(x => ({ type_name: "CheckBox", name: x[0], value: String(x[1]) }))
        }
    ];
}

// Strip optional /ru/manga/, /ru/anime/, /ru/book/ prefix (or full https://… URL) from
// link to recover the bare API slug. Tolerates the v0.5.x change where `link` started
// including a web path prefix so Mangayomi's "Web view" button works.
function libExtractSlug(slug) {
    let s = String(slug || "");
    // Drop scheme + host if user/Mangayomi passed full URL
    s = s.replace(/^https?:\/\/[^/]+/, "");
    // Drop /ru/manga/, /ru/anime/, /ru/book/, /ru/hentai/, /ru/novel/ etc.
    s = s.replace(/^\/+(ru\/)?(manga|anime|book|novel|hentai)\/+/, "");
    // Drop any leading slashes left
    return s.replace(/^\/+/, "");
}

// Manga/hentai/yaoi detail — includes chapters list
async function libMangaDetail(client, source, siteId, slug) {
    const apiSlug = libExtractSlug(slug);
    const infoUrl = `${source.apiUrl}/manga/${apiSlug}?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists`;
    const infoRes = await libGetWithFallback(client, infoUrl, source, siteId);
    if (infoRes.statusCode !== 200) {
        const detail = `HTTP ${infoRes.statusCode}` + (infoRes.statusCode === 422 ? ' — возможно Bearer token из другого Lib-сайта (audience mismatch).' : '');
        return { name: apiSlug, imageUrl: "", description: `(Ошибка загрузки: ${detail})`, status: 5, genre: [], chapters: [] };
    }
    const info = JSON.parse(infoRes.body).data;
    const chRes = await libGetWithFallback(client, `${source.apiUrl}/manga/${apiSlug}/chapters`, source, siteId);
    const chapters = chRes.statusCode === 200 ? (JSON.parse(chRes.body).data || []) : [];
    const chBase = `${source.apiUrl}/manga/${apiSlug}/chapter`;

    return {
        name: libCoerceString(info.rus_name || info.eng_name || info.name || apiSlug),
        imageUrl: libProxyImage(libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || "")),
        author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
        artist: (info.artists || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
        status: libParseStatus(info.status && libCoerceString(info.status.label)),
        description: libCoerceString(info.summary || info.description || ""),
        genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
        chapters: chapters.map(c => {
            // branch_id is REQUIRED when non-null; must be OMITTED when null (API returns 422 on empty string).
            const branchId = c.branches && c.branches[0] && c.branches[0].branch_id;
            let url = `${chBase}?number=${c.number}&volume=${c.volume}`;
            if (branchId) url += `&branch_id=${branchId}`;
            return {
                name: `Том ${c.volume} Глава ${c.number}` + (c.name ? `: ${libCoerceString(c.name)}` : ""),
                url,
                dateUpload: new Date((c.branches && c.branches[0] && c.branches[0].created_at) || Date.now()).valueOf().toString(),
                scanlator: (c.branches && c.branches[0] && (c.branches[0].teams || []).map(t => libCoerceString(t && t.name)).filter(Boolean).join(", ")) || null
            };
        }).reverse()
    };
}

async function libMangaPageList(client, source, siteId, url) {
    const headers = libApiHeaders(source, siteId);
    const res = await client.get(url, headers);
    if (res.statusCode !== 200) return [];
    const chapter = JSON.parse(res.body).data;
    if (!chapter || !chapter.pages || chapter.pages.length === 0) return [];

    // Fetch the live list of image servers. The order returned by the API is the
    // priority Mangayomi follows when picking a default; user override (`imageServer`
    // preference) goes first if set.
    //
    // 2026-04: `img2.imglib.info` (the historical "main"/"secondary" CDN for site_id=1)
    // is currently blanket-403-ed by DDoS-Guard. `compress`/`download` (img3.mixlib.me)
    // and `crop` (crops.mangalib.me) still serve. We probe the first image with HEAD;
    // if it 403s on the user-chosen server we walk through the rest of the list and
    // pick the first one that returns 200.
    const sCandidates = [];
    try {
        const sRes = await client.get(`${source.apiUrl}/constants?fields[]=imageServers`, headers);
        const servers = JSON.parse(sRes.body).data.imageServers || [];
        const prefId = (new SharedPreferences()).get("imageServer") || "compress";
        const filtered = servers.filter(s => (s.site_ids || []).includes(siteId) && s.url);
        // user-chosen first, then everyone else in API order
        const userChoice = filtered.find(s => s.id === prefId);
        if (userChoice) sCandidates.push(userChoice);
        for (const s of filtered) if (!sCandidates.includes(s)) sCandidates.push(s);
    } catch (e) { /* fall through to hardcoded defaults */ }
    if (sCandidates.length === 0) {
        // Hardcoded fallbacks per site if /constants is unreachable.
        if (siteId === 4) sCandidates.push({ url: "https://img2h.hentaicdn.org" });
        else if (siteId === 2) sCandidates.push({ url: "https://img2.hentaicdn.org" });
        else { sCandidates.push({ url: "https://img3.mixlib.me" }); sCandidates.push({ url: "https://img2.imglib.info" }); }
    }

    const pageHeaders = {
        "User-Agent": LIB_UA,
        "Referer": source.baseUrl + "/",
        "Origin": source.baseUrl,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    };

    // Helper: build pages array given a CDN prefix.
    const build = (prefix) => {
        const cleanPrefix = String(prefix).replace(/\/+$/, "");
        return chapter.pages.map(p => {
            let path = p.url || "";
            if (!path) return null;
            // p.url like "//manga/one-piece/chapters/54644/01.jpg" — collapse leading //
            path = path.replace(/^\/+/, "/");
            const full = path.startsWith("http") ? path : (cleanPrefix + path);
            return { url: full, headers: pageHeaders };
        }).filter(Boolean);
    };

    // Probe each candidate's first page until one returns 200.
    // Skip the probe for absolute URLs (very rare) — they would already include a host.
    for (let i = 0; i < sCandidates.length; i++) {
        const candidate = sCandidates[i];
        const pages = build(candidate.url);
        if (!pages.length) continue;
        if (pages[0].url.startsWith(String(candidate.url).replace(/\/+$/, "")) === false) {
            // page url was absolute — no probe possible, just return it
            return pages;
        }
        try {
            const probe = await client.get(pages[0].url, pageHeaders);
            if (probe && probe.statusCode === 200) return pages;
        } catch (e) { /* try next candidate */ }
    }
    // All probes failed — return the user's choice anyway so the user sees an error
    // instead of an empty silent screen.
    return build(sCandidates[0].url);
}

function libSourcePreferences() {
    return [
        {
            key: "imageServer",
            listPreference: {
                title: "Сервер изображений",
                summary: "Какой CDN пробовать первым. Расширение делает HEAD-проверку первой страницы и автоматически переключается на следующий сервер если выбранный вернул 403. С 2026-04 'Основной' (img2.imglib.info) блокируется DDoS-Guard, 'Сжатый' (img3.mixlib.me) — рабочий.",
                valueIndex: 0,
                entries: ["Сжатый (рекомендуется)", "Download", "Основной (может 403)", "Второй", "Crop (превью)"],
                entryValues: ["compress", "download", "main", "secondary", "crop"]
            }
        },
        {
            key: "authToken",
            editTextPreference: {
                title: "Auth token (Bearer)",
                summary: "Опционально. Получить через DevTools на сайте после логина (Authorization: Bearer ...). Нужен для 18+ контента.",
                value: "",
                dialogTitle: "Bearer token",
                dialogMessage: "Вставьте JWT без слова Bearer"
            }
        }
    ];
}
