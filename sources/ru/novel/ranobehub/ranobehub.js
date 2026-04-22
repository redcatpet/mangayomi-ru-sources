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
    "version": "0.3.0",
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
        const res = await this.client.get(
            `${this.source.apiUrl}/search?page=${page}&query=${encodeURIComponent(query || "")}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
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
        const status = statusMap[info.status && info.status.title] ?? 5;

        const chapters = [];
        for (const vol of contents) {
            for (const ch of (vol.chapters || [])) {
                // IMPORTANT: ch.url is an HTML page URL; the JSON /chapters/{id} endpoint 404s.
                const chUrl = ch.url || `${this.source.baseUrl}/ranobe/${ranobeId}/${vol.num || 1}/${ch.num || 0}`;
                chapters.push({
                    name: `${vol.num ? "Том " + vol.num + " · " : ""}Глава ${ch.num || "?"}` + (ch.name ? `: ${ch.name}` : ""),
                    url: chUrl,
                    dateUpload: ch.changed_at ? (isNaN(+ch.changed_at) ? new Date(ch.changed_at).valueOf() : (+ch.changed_at) * 1000).toString() : Date.now().toString(),
                    scanlator: null
                });
            }
        }

        return {
            name: (info.names && (info.names.rus || info.names.eng)) || info.name || String(slug),
            imageUrl: (info.posters && (info.posters.medium || info.posters.small)) || "",
            description: info.description || info.synopsis || "",
            author: ((info.authors || []).map(a => a.name || a) || []).join(", "),
            genre: (info.tags && (info.tags.events || []).concat(info.tags.genres || []) || []).map(t => t.name || t),
            status: status,
            chapters: chapters.reverse()
        };
    }

    async getHtmlContent(name, url) {
        const res = await this.client.get(url, {
            ...this.headers,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        });
        if (res.statusCode !== 200) return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}</p>`;
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
        // Strip ads and scripts
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                   .replace(/<ins[\s\S]*?<\/ins>/gi, "")
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
