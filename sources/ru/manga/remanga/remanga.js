const mangayomiSources = [{
    "name": "Remanga",
    "lang": "ru",
    "baseUrl": "https://remanga.org",
    "apiUrl": "https://api.remanga.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/remanga.js",
    "notes": "JSON API на api.remanga.org. 18+ требует токена (настройка authToken). Cloudflare на фронте, API обычно чист."
}];

const RM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const RM_IMG_BASE = "https://remanga.org";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        const h = {
            "User-Agent": RM_UA,
            "Accept": "application/json",
            "Accept-Language": "ru,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
        const token = (new SharedPreferences()).get("authToken");
        if (token) h["Authorization"] = "Bearer " + token;
        return h;
    }

    absImg(u) {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        return RM_IMG_BASE + (u.startsWith("/") ? u : "/" + u);
    }

    parseList(body) {
        const j = JSON.parse(body);
        const list = (j.content || j.results || []).map(t => ({
            name: t.rus_name || t.en_name || t.main_name || "",
            imageUrl: this.absImg((t.cover && (t.cover.mid || t.cover.low || t.cover.high)) || ""),
            link: t.dir || t.slug || String(t.id)
        }));
        const page = j.page || (j.props && j.props.current_page) || 1;
        const totalPages = (j.props && j.props.total_pages) || 0;
        const hasNextPage = totalPages ? page < totalPages : list.length >= 20;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search/catalog/?ordering=-rating&count=30&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search/catalog/?ordering=-chapter_date&count=30&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search/?query=${encodeURIComponent(query || "")}&count=30&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getDetail(dir) {
        const infoRes = await this.client.get(`${this.source.apiUrl}/titles/${dir}/`, this.headers);
        if (infoRes.statusCode !== 200) {
            return { name: dir, imageUrl: "", description: "(Ошибка — возможно, нужен Bearer token)", status: 5, genre: [], chapters: [] };
        }
        const t = (JSON.parse(infoRes.body).content) || {};
        const titleId = t.id;

        // Chapters paginated — grab all pages until empty
        const chapters = [];
        let page = 1;
        while (page < 20) {
            const cres = await this.client.get(
                `${this.source.apiUrl}/titles/chapters/?branch_id=${(t.branches && t.branches[0] && t.branches[0].id) || ""}&page=${page}&count=40&ordering=index`,
                this.headers
            );
            if (cres.statusCode !== 200) break;
            const arr = (JSON.parse(cres.body).content) || [];
            if (arr.length === 0) break;
            for (const c of arr) {
                // Skip paid chapters if user has no token
                chapters.push({
                    name: `Том ${c.tome} · Глава ${c.chapter}` + (c.name ? ": " + c.name : "") + (c.is_paid ? " (платно)" : ""),
                    url: `${this.source.apiUrl}/titles/chapters/${c.id}/`,
                    dateUpload: c.upload_date ? new Date(c.upload_date).valueOf().toString() : Date.now().toString(),
                    scanlator: c.publishers ? c.publishers.map(p => p.name).join(", ") : null
                });
            }
            page += 1;
        }

        const statusMap = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5};
        return {
            name: t.rus_name || t.en_name || dir,
            imageUrl: this.absImg((t.img && (t.img.mid || t.img.high)) || ""),
            description: t.description || "",
            author: (t.publishers || []).map(p => p.name).join(", "),
            genre: (t.genres || []).map(g => g.name),
            status: statusMap[(t.status && t.status.id) || 5] ?? 5,
            chapters: chapters.reverse()
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) {
            return [{ url: "", headers: this.headers }];
        }
        const data = (JSON.parse(res.body).content) || {};
        // pages is a 2D array — single-page chapters have [[{...}, {...}]]
        const flat = [];
        const pages = data.pages || [];
        for (const p of pages) {
            if (Array.isArray(p)) {
                for (const pp of p) {
                    if (pp && pp.link) flat.push(pp);
                }
            } else if (p && p.link) {
                flat.push(p);
            }
        }
        return flat.map(p => ({ url: p.link, headers: this.headers }));
    }

    getFilterList() { return []; }
    getSourcePreferences() {
        return [{
            key: "authToken",
            editTextPreference: {
                title: "Bearer token",
                summary: "Опционально. Из DevTools → Network после логина (Authorization: Bearer ...). Нужно для 18+ и платных глав.",
                value: "",
                dialogTitle: "Token",
                dialogMessage: "Без слова Bearer"
            }
        }];
    }
}
