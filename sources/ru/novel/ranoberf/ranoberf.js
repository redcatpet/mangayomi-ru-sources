const mangayomiSources = [{
    "name": "Ранобэ.рф",
    "lang": "ru",
    "baseUrl": "https://xn--80ac9aeh6f.xn--p1ai",
    "apiUrl": "https://xn--80ac9aeh6f.xn--p1ai/api/v2",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranoberf.js",
    "notes": "Ранобэ.рф — публичный API v2. Punycode domain. Главы отдаются как HTML-контент."
}];

const RF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": RF_UA,
            "Accept": "application/json",
            "Referer": this.source.baseUrl + "/"
        };
    }

    parseList(body) {
        const j = JSON.parse(body);
        const items = (j.items || j.data || j.books || []);
        const list = items.map(b => ({
            name: b.title || b.name || "",
            imageUrl: (b.image && (b.image.url || b.image)) || b.cover || "",
            link: b.url || b.slug || String(b.id)
        }));
        const hasNextPage = (j.total || 0) > (j.currentPage || 1) * (j.perPage || 20) || list.length >= 20;
        return { list: list, hasNextPage: hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/books?page=${page}&sort=popular`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/books?page=${page}&sort=newChapters`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.apiUrl}/books?page=${page}&query=${encodeURIComponent(query || "")}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getDetail(slug) {
        const bookRes = await this.client.get(`${this.source.apiUrl}/books/${slug}`, this.headers);
        if (bookRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка)", status: 5, genre: [], chapters: [] };
        }
        const b = JSON.parse(bookRes.body).book || JSON.parse(bookRes.body);

        const chRes = await this.client.get(`${this.source.apiUrl}/books/${slug}/chapters`, this.headers);
        const chapters = [];
        if (chRes.statusCode === 200) {
            const j = JSON.parse(chRes.body);
            const items = j.items || j.chapters || j;
            for (const c of (items || [])) {
                chapters.push({
                    name: c.title || c.name || ("Глава " + (c.number || "?")),
                    url: `${this.source.apiUrl}/books/${slug}/chapters/${c.url || c.slug || c.id}`,
                    dateUpload: c.publishDate ? new Date(c.publishDate).valueOf().toString() : Date.now().toString(),
                    scanlator: null
                });
            }
        }

        return {
            name: b.title || slug,
            imageUrl: (b.image && (b.image.url || b.image)) || b.cover || "",
            description: b.description || b.annotation || "",
            author: b.author ? (typeof b.author === "string" ? b.author : b.author.name) : "",
            genre: (b.genres || []).map(g => g.title || g.name || g),
            status: b.status === "complete" ? 1 : 0,
            chapters: chapters.reverse()
        };
    }

    async getHtmlContent(name, url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}</p>`;
        const data = JSON.parse(res.body);
        const chapter = data.chapter || data;
        const content = chapter.content || chapter.text || "";
        if (!content) return `<h2>${name || ""}</h2><p>(Глава пустая)</p>`;
        return `<h2>${name || ""}</h2><hr><br>${content}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
