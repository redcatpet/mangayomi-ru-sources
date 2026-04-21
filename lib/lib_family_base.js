// === lib_family_base.js ===
// Shared base for MangaLib/AnimeLib/Ranobelib/YaoiLib/HentaiLib family —
// they all share `api.cdnlibs.org` / `api.mangalib.me` JSON backend with
// a `Site-Id` header switching between products.
//
// Usage: subclass LibFamilyBase in each source file and override:
//   get siteId() { return 1; /* 1=Manga, 3=Hentai, 4=Yaoi, 5=Anime, ...*/ }
//   get itemType() { return 0; /* 0=manga, 1=anime, 2=novel */ }
// Also add `// @include: lib_family_base` at top of source for build step.

const LIB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Lib API returns rich text (summary, chapter content) as ProseMirror doc trees:
// {type:'doc', content:[{type:'paragraph', content:[{type:'text', text:'...'}, {type:'hardBreak'}]}]}
// Flatten to plain string.
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

// Convert ProseMirror doc to HTML (for novel chapter content — kept as HTML in reader).
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
        // Escape minimal HTML
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

// cover.imglib.info requires Referer header — Mangayomi's image loader
// doesn't always pass it, so 403 in the catalog. Proxy through weserv.nl
// which strips referrer checks and adds CORS.
function libProxyImage(url) {
    if (!url) return "";
    const s = String(url);
    if (!s.startsWith("http")) return s;
    const stripped = s.replace(/^https?:\/\//, "");
    return "https://images.weserv.nl/?url=" + encodeURIComponent(stripped);
}

// Coerce any value to a display string. Handles ProseMirror objects,
// plain Maps with {text} fields, and passes through real strings.
function libCoerceString(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object") {
        // ProseMirror doc
        if (v.type || v.content) return libProseMirrorToText(v).trim();
        // Plain object with text/name/value
        if (v.text != null) return String(v.text);
        if (v.name != null) return String(v.name);
        if (v.value != null) return String(v.value);
    }
    return "";
}

class LibFamilyBase extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // ---- Overridable hooks ----
    get siteId() {
        throw new Error("LibFamilyBase.siteId must be overridden");
    }
    get itemType() { return 0; }

    get apiHeaders() {
        const token = (new SharedPreferences()).get("authToken") || "";
        const headers = {
            "Accept": "*/*",
            "Accept-Language": "ru,en;q=0.5",
            "User-Agent": LIB_UA,
            "Site-Id": String(this.siteId),
            "Referer": this.source.baseUrl + "/"
        };
        if (token) headers["Authorization"] = "Bearer " + token;
        return headers;
    }

    get apiUrl() { return this.source.apiUrl; }

    // ---- Status mapping ----
    parseStatus(label) {
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

    // ---- Listing ----
    async parseList(url) {
        try {
            const res = await this.client.get(url, this.apiHeaders);
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };
            const json = JSON.parse(res.body);
            const list = (json.data || []).map(m => ({
                name: libCoerceString(m.rus_name || m.eng_name || m.name || ""),
                imageUrl: libProxyImage(libCoerceString((m.cover && (m.cover.thumbnail || m.cover.default)) || "")),
                link: libCoerceString(m.slug_url || m.slug || "")
            }));
            return { list: list, hasNextPage: !!(json.meta && json.meta.has_next_page) };
        } catch (e) {
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        return await this.parseList(`${this.apiUrl}/manga?page=${page}&site_id[]=${this.siteId}&sort_by=rate_avg`);
    }

    async getLatestUpdates(page) {
        return await this.parseList(`${this.apiUrl}/manga?page=${page}&site_id[]=${this.siteId}&sort_by=last_chapter_at`);
    }

    async search(query, page, filters) {
        let url = `${this.apiUrl}/manga?q=${encodeURIComponent(query)}&page=${page}&site_id[]=${this.siteId}`;
        return await this.parseList(url);
    }

    // ---- Detail ----
    async getDetail(url) {
        const slug = url;
        const infoRes = await this.client.get(
            `${this.apiUrl}/manga/${slug}?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists`,
            this.apiHeaders
        );
        const chRes = await this.client.get(
            `${this.apiUrl}/manga/${slug}/chapters`,
            this.apiHeaders
        );
        if (infoRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка загрузки — возможно нужен токен)", status: 5, genre: [], chapters: [] };
        }
        const info = JSON.parse(infoRes.body).data;
        const chapters = chRes.statusCode === 200 ? JSON.parse(chRes.body).data : [];
        const chBase = `${this.apiUrl}/manga/${slug}/chapter`;

        return {
            name: libCoerceString(info.rus_name || info.eng_name || info.name || slug),
            imageUrl: libProxyImage(libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || "")),
            author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
            artist: (info.artists || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
            status: this.parseStatus(info.status && libCoerceString(info.status.label)),
            description: libCoerceString(info.summary || info.description || ""),
            genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
            chapters: chapters.map(c => ({
                name: `Том ${c.volume} Глава ${c.number}` + (c.name ? `: ${libCoerceString(c.name)}` : ""),
                url: `${chBase}?number=${c.number}&volume=${c.volume}`,
                dateUpload: new Date((c.branches && c.branches[0] && c.branches[0].created_at) || Date.now()).valueOf().toString(),
                scanlator: (c.branches && c.branches[0] && (c.branches[0].teams || []).map(t => libCoerceString(t && t.name)).filter(Boolean).join(", ")) || null
            })).reverse()
        };
    }

    // ---- Pages (manga) ----
    async getPageList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        if (res.statusCode !== 200) return [];
        const chapter = JSON.parse(res.body).data;
        // Fetch image servers list and pick one by user preference
        let prefix = "";
        try {
            const sRes = await this.client.get(`${this.apiUrl}/constants?fields[]=imageServers`, this.apiHeaders);
            const servers = JSON.parse(sRes.body).data.imageServers || [];
            const prefId = (new SharedPreferences()).get("imageServer") || "main";
            const filtered = servers.filter(s => (s.site_ids || []).includes(this.siteId) || !s.site_ids);
            const chosen = filtered.find(s => s.id === prefId) || filtered[0] || servers[0];
            if (chosen) prefix = chosen.url;
        } catch (e) { /* ignore, prefix stays empty */ }

        return (chapter.pages || []).map(p => ({
            url: prefix + p.url,
            headers: this.apiHeaders
        }));
    }

    getSourcePreferences() {
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

    getFilterList() {
        return [];
    }
}
