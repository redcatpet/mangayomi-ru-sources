const mangayomiSources = [{
    "name": "RanobeHub",
    "lang": "ru",
    "baseUrl": "https://ranobehub.org",
    "apiUrl": "https://ranobehub.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.3.9",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranobehub.js",
    "notes": "Публичный JSON API для каталога + HTML-страница главы (div[data-container]). Главы не через API — REST-эндпойнт /chapters/{id} возвращает 404."
}];

const RH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": RH_UA,
            "Accept": "application/json, text/html,*/*",
            "Referer": this.source.baseUrl + "/"
        };
    }

    extractSlug(item) {
        if (item.url) {
            const m = item.url.match(/\/ranobe\/([\w\-]+)/);
            if (m) return m[1];
        }
        return String(item.id);
    }

    parseList(body) {
        const j = JSON.parse(body);
        const list = (j.resource || j.data || []).map(r => ({
            name: (r.names && (r.names.rus || r.names.eng)) || r.name || "",
            imageUrl: (r.poster && (r.poster.medium || r.poster.small)) || "",
            link: this.extractSlug(r)
        }));
        const pag = j.meta && j.meta.pagination;
        const hasNextPage = pag ? pag.current_page < pag.total_pages : list.length >= 20;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search?page=${page}&sort=computed_rating&order=desc`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search?page=${page}&sort=last_chapter_at&order=desc`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async search(query, page, filters) {
        const q = (query || "").trim();
        if (!q) {
            // Empty query — fall back to popular catalog (covers Mangayomi's
            // "Recommendations" feature when called with empty query).
            return await this.getPopular(page);
        }
        // /api/search?query=... is a paginated catalog that ignores the query.
        // Real fulltext search is /api/fulltext/global?query=...&take=N — used by the
        // website's search box (route name "api.fulltext.search" in build.js).
        // Response is `[{meta: {key, title}, data: [...]}]` — pull the "ranobe" group.
        const url = `${this.source.baseUrl}/api/fulltext/global?query=${encodeURIComponent(q)}&take=30`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        let groups;
        try { groups = JSON.parse(res.body); } catch (e) { return { list: [], hasNextPage: false }; }
        const ranobeGroup = (Array.isArray(groups) ? groups : []).find(g => g && g.meta && g.meta.key === "ranobe");
        const items = (ranobeGroup && ranobeGroup.data) || [];
        const list = items.map(r => ({
            name: (r.names && (r.names.rus || r.names.eng || r.names.original)) || r.name || "",
            // Detail-page covers come from /api/ranobe/{id} — list items don't carry posters.
            imageUrl: (r.poster && (r.poster.medium || r.poster.small)) || (r.posters && (r.posters.medium || r.posters.small)) || "",
            link: this.extractSlug(r)
        })).filter(x => x.name && x.link);
        return { list, hasNextPage: false };
    }

    async getDetail(slug) {
        const idMatch = String(slug).match(/^(\d+)/);
        const ranobeId = idMatch ? idMatch[1] : slug;

        const infoRes = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}`, this.headers);
        const chRes = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}/contents`, this.headers);

        if (infoRes.statusCode !== 200) {
            return { name: String(slug), imageUrl: "", description: "(Ошибка)", status: 5, genre: [], chapters: [] };
        }
        const info = (JSON.parse(infoRes.body).data) || {};
        const contents = chRes.statusCode === 200 ? (JSON.parse(chRes.body).volumes || []) : [];

        const statusMap = { "В процессе": 0, "Завершено": 1, "Заморожен": 2, "Заброшен": 3 };
        const statusKey = (info.status && info.status.title) || "";
        const mapped = statusMap[statusKey];
        const status = mapped == null ? 5 : mapped;

        const chapters = [];
        for (const vol of contents) {
            const vNum = vol.num != null ? vol.num : 1;
            for (const ch of (vol.chapters || [])) {
                const cNum = ch.num != null ? ch.num : "?";
                // Append chapter ID as query so every URL ends with a unique integer.
                // Solo Leveling has 398/457 chapters with float `num` (1.01, 1.02 …) — URLs
                // therefore end in "/{vol}/{1.01}" etc., and Mangayomi's chapter sort/dedup
                // regex (likely `/\d+$/`) extracts only "01" → integer 1, colliding with
                // chapter 1 in the same volume. A trailing `?cid={id}` ensures the regex
                // sees the chapter ID (always unique integer); the server ignores the query.
                const baseUrl = ch.url || `${this.source.baseUrl}/ranobe/${ranobeId}/${vNum}/${cNum}`;
                const chUrl = ch.id ? baseUrl + (baseUrl.indexOf("?") < 0 ? "?cid=" : "&cid=") + ch.id : baseUrl;
                let dateUpload;
                if (ch.changed_at) {
                    const n = +ch.changed_at;
                    dateUpload = (isNaN(n) ? new Date(ch.changed_at).valueOf() : n * 1000).toString();
                } else {
                    dateUpload = Date.now().toString();
                }
                // Build name. If ch.name already starts with "Глава" (or "Том"), use it directly
                // — avoids redundant "Глава 1.01: Глава 1.1. Десятый" on titles like Solo Leveling
                // where 398/457 chapters have float `num` AND a name that already includes "Глава X".
                const rawName = (ch.name || "").trim();
                const startsWithGlava = /^(Том|Глава|Пролог|Эпилог|Интерлюд)/i.test(rawName);
                let chName;
                if (rawName && startsWithGlava) {
                    chName = (vol.num ? "Том " + vNum + " · " : "") + rawName;
                } else if (rawName) {
                    chName = (vol.num ? "Том " + vNum + " · " : "") + "Глава " + cNum + ": " + rawName;
                } else {
                    chName = (vol.num ? "Том " + vNum + " · " : "") + "Глава " + cNum;
                }
                chapters.push({
                    name: chName,
                    url: String(chUrl),
                    dateUpload: dateUpload,
                    scanlator: null
                });
            }
        }

        // Authors carry name_rus/name_eng; translators carry name. Combine both as "Author / tr. Translator".
        const authorList = (info.authors || []).map(a => a.name_rus || a.name_eng || a.name).filter(x => x);
        const translatorList = (info.translators || []).map(t => t.name_rus || t.name_eng || t.name).filter(x => x);
        const authorStr = authorList.join(", ") + (translatorList.length ? ` (пер. ${translatorList.join(", ")})` : "");

        // Tags are { events, genres } where each item has { title, names: { rus, eng } }.
        const tagItems = [].concat((info.tags && info.tags.genres) || [], (info.tags && info.tags.events) || []);
        const genre = tagItems.map(t => t.title || (t.names && (t.names.rus || t.names.eng)) || "").filter(x => x);

        // info.description is HTML markup (`<p>…</p><p>…</p>`); strip tags to plain text
        // and fall back to synopsis (already plain but truncated with "…").
        const descRaw = info.description || info.synopsis || "";
        const description = descRaw
            .replace(/<\/p>\s*<p>/gi, "\n\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();

        return {
            name: (info.names && (info.names.rus || info.names.eng)) || info.name || String(slug),
            imageUrl: (info.posters && (info.posters.medium || info.posters.big || info.posters.small)) || "",
            description: description,
            author: authorStr,
            genre: genre,
            status: status,
            chapters: chapters.slice().reverse()
        };
    }

    async resolveStaleChapterUrl(url) {
        if (!url || !url.match) return url;
        // Pre-v0.3 of this extension stored chapter URLs as
        // `${apiUrl}/ranobe/{ranobeId}/chapters/{chapterId}` — that JSON endpoint now 404s.
        // Mangayomi caches chapter URLs in its local DB and won't refresh them on getDetail
        // unless the user removes & re-adds the title. Rescue: detect the broken pattern,
        // resolve the chapter ID against the contents API, and fall through to the
        // canonical HTML URL.
        const m = url.match(/\/api\/ranobe\/(\d+)\/chapters\/(\d+)/);
        if (m) {
            const ranobeId = m[1];
            const chapterId = m[2];
            try {
                const res = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}/contents`, this.headers);
                if (res.statusCode !== 200) return url;
                const data = JSON.parse(res.body);
                for (const vol of (data.volumes || [])) {
                    for (const ch of (vol.chapters || [])) {
                        if (String(ch.id) === chapterId && ch.url) return ch.url;
                    }
                }
            } catch (e) {}
            return url;
        }
        // Strip our own `?cid=` / `&cid=` disambiguator before fetching (server ignores
        // it but stripping avoids ambiguity in logs).
        return url.replace(/[?&]cid=\d+/, "");
    }

    async getHtmlContent(name, url) {
        url = await this.resolveStaleChapterUrl(url);
        // Object.assign instead of spread — flutter_qjs supports both, but spread on
        // a getter property has burned us before, and explicit copy is unambiguous.
        const headers = Object.assign({}, this.headers, {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        });
        const res = await this.client.get(url, headers);
        if (res.statusCode !== 200) {
            return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}. URL: ${url}</p>`;
        }
        const body = res.body || "";

        // Chapter body lives inside `<div class="ui text container" data-container="{chapterId}">`
        const startRe = /<div[^>]+class="ui text container[^"]*"[^>]+data-container="[^"]+"[^>]*>/;
        const m = body.match(startRe);
        let html = "";
        if (m) {
            const from = m.index + m[0].length;
            // Greedy-enough end: find next chapter-footer or chapter-comments
            const rest = body.substring(from);
            const endMarkers = ["chapter-footer", "chapter-comments", "<footer", "app-clap-button"];
            let end = rest.length;
            for (const e of endMarkers) {
                const i = rest.indexOf(e);
                if (i >= 0 && i < end) end = i;
            }
            // Back up to closest preceding </div>
            const chunk = rest.substring(0, end);
            const lastDivClose = chunk.lastIndexOf("</div>");
            html = lastDivClose > 0 ? chunk.substring(0, lastDivClose) : chunk;
        }
        // Fallback: concat all <p>...</p> blocks
        if (!html) {
            const paras = body.match(/<p>[\s\S]*?<\/p>/g) || [];
            html = paras.join("\n");
        }
        // Strip header widgets (book thumbnail/title/divider, rating/comment hoticons,
        // chapter title-wrapper) and ads/scripts so only the prologue text remains.
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                   .replace(/<ins[\s\S]*?<\/ins>/gi, "")
                   .replace(/<div[^>]*class="[^"]*tablet or lower hidden[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "")
                   .replace(/<div[^>]*class="[^"]*chapter-hoticons[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "")
                   .replace(/<div[^>]*class="[^"]*title-wrapper[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                   .replace(/<div[^>]*class="[^"]*ads[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                   .replace(/<div[^>]*id="[^"]*y251595[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
        if (!html.trim()) return `<h2>${name || ""}</h2><p>(Не удалось извлечь текст главы)</p>`;
        return `<h2>${name || ""}</h2><hr>${html}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    async cleanHtmlContent(html) {
        return (html || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
