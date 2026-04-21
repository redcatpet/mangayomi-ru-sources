const mangayomiSources = [{
    "name": "Desu.Me",
    "lang": "ru",
    "baseUrl": "https://desu.me",
    "apiUrl": "https://desu.me/manga/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/desu.js",
    "notes": "Использует публичный /manga/api. Возможна проверка Cloudflare — может потребоваться периодически проходить её через браузер."
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
            "Accept-Language": "ru,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
    }

    parseList(body) {
        const j = JSON.parse(body);
        const list = (j.response || []).map(m => ({
            name: m.russian || m.name || "",
            imageUrl: (m.image && (m.image.preview || m.image.original)) || "",
            link: String(m.id)
        }));
        const page = (j.pageNavParams && j.pageNavParams.page) || 1;
        const limit = (j.pageNavParams && j.pageNavParams.limit) || 30;
        const count = (j.pageNavParams && j.pageNavParams.count) || 0;
        const hasNextPage = page * limit < count;
        return { list: list, hasNextPage: hasNextPage };
    }

    async fetchList(order, page) {
        const url = `${this.source.apiUrl}/?limit=30&order=${order}&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getPopular(page) { return await this.fetchList("popular", page); }
    async getLatestUpdates(page) { return await this.fetchList("updated", page); }
    async search(query, page, filters) {
        const url = `${this.source.apiUrl}/?limit=30&search=${encodeURIComponent(query || "")}&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getDetail(id) {
        const res = await this.client.get(`${this.source.apiUrl}/${id}`, this.headers);
        if (res.statusCode !== 200) {
            return { name: id, imageUrl: "", description: "(Ошибка)", status: 5, genre: [], chapters: [] };
        }
        const m = JSON.parse(res.body).response || {};
        const chapters = ((m.chapters && m.chapters.list) || []).map(c => ({
            name: `Том ${c.vol} Глава ${c.ch}` + (c.title ? `: ${c.title}` : ""),
            url: `${this.source.apiUrl}/${id}/chapter/${c.id}`,
            dateUpload: c.date ? String(c.date * 1000) : Date.now().toString(),
            scanlator: null
        }));

        const statusMap = { "ongoing": 0, "released": 1, "copyrighted": 3, "anons": 4 };
        return {
            name: m.russian || m.name || id,
            imageUrl: (m.image && (m.image.original || m.image.preview)) || "",
            description: m.description || "",
            author: (m.authors || []).map(a => a.name).join(", "),
            genre: (m.genres || []).map(g => g.russian || g.name),
            status: statusMap[m.status] ?? 5,
            chapters: chapters
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return [];
        const data = JSON.parse(res.body).response || {};
        const pages = (data.pages && data.pages.list) || [];
        return pages.map(p => ({ url: p.img, headers: this.headers }));
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
