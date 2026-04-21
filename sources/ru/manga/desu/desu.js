const mangayomiSources = [{
    "name": "Desu.Me",
    "lang": "ru",
    "baseUrl": "https://desu.uno",
    "apiUrl": "https://desu.uno/manga/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/desu.js",
    "notes": "Desu.me → desu.city → desu.uno (рабочий). Публичный /manga/api, отдаёт JSON в обёртке {response: ...}."
}];

const DESU_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": DESU_UA,
            "Accept": "application/json",
            "Referer": this.source.baseUrl + "/"
        };
    }

    getApiUrl() {
        const override = (new SharedPreferences()).get("override_base_url");
        if (override && override.trim()) {
            return override.trim().replace(/\/$/, "") + "/manga/api";
        }
        return this.source.apiUrl;
    }

    // Desu API wraps all responses in {response: ...}
    parseList(body) {
        const json = JSON.parse(body);
        const items = json.response || [];
        const list = (Array.isArray(items) ? items : []).map(m => ({
            name: m.russian || m.name || "",
            imageUrl: (m.image && (m.image.preview || m.image.original)) || "",
            link: String(m.id)
        }));
        const nav = json.pageNavParams || {};
        const page = nav.page || 1;
        const limit = nav.limit || 20;
        const count = nav.count || 0;
        return { list: list, hasNextPage: page * limit < count };
    }

    async fetchList(order, page) {
        const url = `${this.getApiUrl()}/?limit=20&order=${order}&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getPopular(page) { return await this.fetchList("popular", page); }
    async getLatestUpdates(page) { return await this.fetchList("updated", page); }

    async search(query, page, filters) {
        const url = `${this.getApiUrl()}/?limit=20&search=${encodeURIComponent(query || "")}&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getDetail(id) {
        const res = await this.client.get(`${this.getApiUrl()}/${id}`, this.headers);
        if (res.statusCode !== 200) {
            return { name: id, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], chapters: [] };
        }
        const m = (JSON.parse(res.body).response) || {};
        const chapters = ((m.chapters && m.chapters.list) || []).map(c => ({
            name: `Том ${c.vol} Глава ${c.ch}` + (c.title ? `: ${c.title}` : ""),
            url: `${this.getApiUrl()}/${id}/chapter/${c.id}`,
            dateUpload: c.date ? String(c.date * 1000) : Date.now().toString(),
            scanlator: null
        }));

        const statusMap = { "ongoing": 0, "released": 1, "copyrighted": 3, "anons": 4 };
        let genre = [];
        if (Array.isArray(m.genres)) {
            genre = m.genres.map(g => (g && (g.russian || g.name || g.text)) || "").filter(x => x);
        } else if (typeof m.genres === "string") {
            genre = m.genres.split(",").map(x => x.trim()).filter(x => x);
        }

        let author = "";
        if (Array.isArray(m.authors)) {
            author = m.authors.map(a => (a && (a.people_name || a.name)) || "").filter(x => x).join(", ");
        }

        return {
            name: m.russian || m.name || id,
            imageUrl: (m.image && (m.image.original || m.image.preview)) || "",
            description: m.description || "",
            author: author,
            genre: genre,
            status: statusMap[m.status] ?? 5,
            chapters: chapters
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return [];
        const data = (JSON.parse(res.body).response) || {};
        const pages = (data.pages && data.pages.list) || [];
        return pages.map(p => ({ url: p.img, headers: this.headers }));
    }

    getFilterList() { return []; }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Переопределить baseUrl",
                summary: "Альтернативный mirror при блокировке desu.uno (desu.city/desu.me редиректят сюда).",
                value: "",
                dialogTitle: "Base URL",
                dialogMessage: "Без /manga/api в конце"
            }
        }];
    }
}
