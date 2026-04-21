const mangayomiSources = [{
    "name": "NewManga",
    "lang": "ru",
    "baseUrl": "https://newmanga.org",
    "apiUrl": "https://newmanga.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/newmanga.js",
    "notes": "Next.js SPA с API /api/projects. Структура JSON может периодически меняться."
}];

const NM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": NM_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ru,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
    }

    parseList(body) {
        let j;
        try { j = JSON.parse(body); } catch (e) { return { list: [], hasNextPage: false }; }
        const items = j.items || j.result || j.data || [];
        const list = items.map(m => ({
            name: m.title || (m.names && (m.names.rus || m.names.main)) || "",
            imageUrl: m.image && (m.image.large || m.image.medium || m.image.url) || m.cover || "",
            link: m.alias || m.slug || String(m.id)
        }));
        const pag = j.pagination || j.page || {};
        const hasNextPage = !!pag.next || list.length >= 20;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/projects?sort=views&page=${page}&size=30`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/projects?sort=last_chapter_at&page=${page}&size=30`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.apiUrl}/projects?q=${encodeURIComponent(query || "")}&page=${page}&size=30`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getDetail(slug) {
        const infoRes = await this.client.get(`${this.source.apiUrl}/projects/${slug}`, this.headers);
        if (infoRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка)", status: 5, genre: [], chapters: [] };
        }
        const info = JSON.parse(infoRes.body);
        const chRes = await this.client.get(`${this.source.apiUrl}/projects/${slug}/chapters`, this.headers);
        const chapters = [];
        if (chRes.statusCode === 200) {
            const j = JSON.parse(chRes.body);
            const arr = j.items || j.result || [];
            for (const c of arr) {
                chapters.push({
                    name: `Том ${c.volume || "-"} · Глава ${c.number || c.num || "?"}` + (c.title ? ": " + c.title : ""),
                    url: `${this.source.apiUrl}/projects/${slug}/chapters/${c.id || c.slug}`,
                    dateUpload: c.created_at ? new Date(c.created_at).valueOf().toString() : Date.now().toString(),
                    scanlator: null
                });
            }
        }

        return {
            name: info.title || (info.names && (info.names.rus || info.names.main)) || slug,
            imageUrl: (info.image && (info.image.large || info.image.medium)) || info.cover || "",
            description: info.description || info.summary || "",
            author: (info.authors || []).map(a => a.name || a).join(", "),
            genre: (info.genres || []).map(g => g.title || g.name || g),
            status: 5,
            chapters: chapters.reverse()
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return [];
        const data = JSON.parse(res.body);
        const pages = data.pages || data.images || data.items || [];
        return pages.map(p => ({
            url: typeof p === "string" ? p : (p.url || p.image || p.src || ""),
            headers: this.headers
        })).filter(x => x.url);
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
