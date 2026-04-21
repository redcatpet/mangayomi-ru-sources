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
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranobehub.js",
    "notes": "Публичный JSON API. Id + slug в URL вида /ranobe/393-solo-leveling"
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
            "Accept": "application/json",
            "Referer": this.source.baseUrl + "/"
        };
    }

    extractSlug(item) {
        // url like https://ranobehub.org/ranobe/393-solo-leveling
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
        let hasNextPage = false;
        if (pag) hasNextPage = pag.current_page < pag.total_pages;
        else hasNextPage = list.length >= 20;
        return { list: list, hasNextPage: hasNextPage };
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
        // id is prefix of slug
        const idMatch = slug.match(/^(\d+)/);
        const ranobeId = idMatch ? idMatch[1] : slug;

        const infoRes = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}`, this.headers);
        const chRes = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}/contents`, this.headers);

        if (infoRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка)", status: 5, genre: [], chapters: [] };
        }
        const info = (JSON.parse(infoRes.body).data) || {};
        const contents = chRes.statusCode === 200 ? (JSON.parse(chRes.body).volumes || []) : [];

        const statusMap = {"В процессе": 0, "Завершено": 1, "Заморожен": 2, "Заброшен": 3};
        const status = statusMap[info.status && info.status.title] ?? 5;

        const chapters = [];
        for (const vol of contents) {
            for (const ch of (vol.chapters || [])) {
                chapters.push({
                    name: `${vol.num ? "Том " + vol.num + " · " : ""}Глава ${ch.num || "?"}` + (ch.name ? `: ${ch.name}` : ""),
                    url: `${this.source.apiUrl}/ranobe/${ranobeId}/chapters/${ch.id}`,
                    dateUpload: ch.changed_at ? new Date(ch.changed_at).valueOf().toString() : Date.now().toString(),
                    scanlator: null
                });
            }
        }

        return {
            name: (info.names && (info.names.rus || info.names.eng)) || info.name || slug,
            imageUrl: (info.posters && (info.posters.medium || info.posters.small)) || "",
            description: info.description || (info.synopsis || ""),
            author: ((info.authors || []).map(a => a.name || a) || []).join(", "),
            genre: (info.tags && (info.tags.events || []).concat(info.tags.genres || []) || []).map(t => t.name || t),
            status: status,
            chapters: chapters.reverse()
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return ["(Ошибка загрузки главы)"];
        const data = JSON.parse(res.body).data || {};
        const html = data.content || data.text || "";
        return [html || "(Глава пустая)"];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
