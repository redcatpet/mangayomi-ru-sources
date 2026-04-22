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

// Generic list parser. `resource` = "manga" | "anime" — both live on cdnlibs.
async function libParseList(client, source, siteId, resource, url) {
    try {
        const res = await client.get(url, libApiHeaders(source, siteId));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        const json = JSON.parse(res.body);
        const list = (json.data || []).map(m => ({
            name: libCoerceString(m.rus_name || m.eng_name || m.name || ""),
            imageUrl: libProxyImage(libCoerceString((m.cover && (m.cover.thumbnail || m.cover.default)) || "")),
            link: libCoerceString(m.slug_url || m.slug || "")
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
    return await libParseList(client, source, siteId, resource,
        `${source.apiUrl}/${resource}?page=${page}&site_id[]=${siteId}&sort_by=rate_avg`);
}

async function libGetLatest(client, source, siteId, resource, page) {
    return await libParseList(client, source, siteId, resource,
        `${source.apiUrl}/${resource}?page=${page}&site_id[]=${siteId}&sort_by=last_chapter_at`);
}

async function libSearch(client, source, siteId, resource, query, page) {
    const q = encodeURIComponent(query || "");
    return await libParseList(client, source, siteId, resource,
        `${source.apiUrl}/${resource}?q=${q}&page=${page}&site_id[]=${siteId}`);
}

// Manga/hentai/yaoi detail — includes chapters list
async function libMangaDetail(client, source, siteId, slug) {
    const headers = libApiHeaders(source, siteId);
    const infoRes = await client.get(
        `${source.apiUrl}/manga/${slug}?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists`,
        headers
    );
    if (infoRes.statusCode !== 200) {
        return { name: slug, imageUrl: "", description: "(Ошибка загрузки — возможно нужен токен)", status: 5, genre: [], chapters: [] };
    }
    const info = JSON.parse(infoRes.body).data;
    const chRes = await client.get(`${source.apiUrl}/manga/${slug}/chapters`, headers);
    const chapters = chRes.statusCode === 200 ? (JSON.parse(chRes.body).data || []) : [];
    const chBase = `${source.apiUrl}/manga/${slug}/chapter`;

    return {
        name: libCoerceString(info.rus_name || info.eng_name || info.name || slug),
        imageUrl: libProxyImage(libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || "")),
        author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
        artist: (info.artists || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
        status: libParseStatus(info.status && libCoerceString(info.status.label)),
        description: libCoerceString(info.summary || info.description || ""),
        genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
        chapters: chapters.map(c => ({
            name: `Том ${c.volume} Глава ${c.number}` + (c.name ? `: ${libCoerceString(c.name)}` : ""),
            url: `${chBase}?number=${c.number}&volume=${c.volume}&branch_id=${(c.branches && c.branches[0] && c.branches[0].branch_id) || ""}`,
            dateUpload: new Date((c.branches && c.branches[0] && c.branches[0].created_at) || Date.now()).valueOf().toString(),
            scanlator: (c.branches && c.branches[0] && (c.branches[0].teams || []).map(t => libCoerceString(t && t.name)).filter(Boolean).join(", ")) || null
        })).reverse()
    };
}

async function libMangaPageList(client, source, siteId, url) {
    const headers = libApiHeaders(source, siteId);
    const res = await client.get(url, headers);
    if (res.statusCode !== 200) return [];
    const chapter = JSON.parse(res.body).data;
    let prefix = "";
    try {
        const sRes = await client.get(`${source.apiUrl}/constants?fields[]=imageServers`, headers);
        const servers = JSON.parse(sRes.body).data.imageServers || [];
        const prefId = (new SharedPreferences()).get("imageServer") || "main";
        const filtered = servers.filter(s => (s.site_ids || []).includes(siteId) || !s.site_ids);
        const chosen = filtered.find(s => s.id === prefId) || filtered[0] || servers[0];
        if (chosen) prefix = chosen.url;
    } catch (e) {}
    return (chapter.pages || []).map(p => ({ url: prefix + p.url, headers }));
}

function libSourcePreferences() {
    return [
        {
            key: "imageServer",
            listPreference: {
                title: "Сервер изображений",
                summary: "Какой CDN использовать для картинок",
                valueIndex: 0,
                entries: ["Основной", "Второй", "Сжатый", "Download"],
                entryValues: ["main", "secondary", "compress", "download"]
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
