const mangayomiSources = [{
    "name": "Remanga",
    "lang": "ru",
    "baseUrl": "https://remanga.org",
    "apiUrl": "https://api.remanga.org/api/v2",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/remanga.js",
    "notes": "Использует API v2 (api.remanga.org/api/v2). 18+ и платные главы требуют Bearer token — вставьте в настройках."
}];

const RM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

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
        return this.source.baseUrl + (u.startsWith("/") ? u : "/" + u);
    }

    parseList(body) {
        const j = JSON.parse(body);
        // v2 wraps results under {results: [...], count, next, previous}
        const results = j.results || j.content || [];
        const list = (Array.isArray(results) ? results : []).map(t => ({
            name: t.main_name || t.secondary_name || t.rus_name || t.en_name || "",
            imageUrl: this.absImg((t.cover && (t.cover.mid || t.cover.low || t.cover.high)) || ""),
            link: t.dir || t.slug || String(t.id)
        }));
        return { list, hasNextPage: !!j.next || list.length >= 30 };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search/catalog/?count=30&page=${page}&ordering=-rating`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search/catalog/?count=30&page=${page}&ordering=-chapter_date`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search/?query=${encodeURIComponent(query || "")}&count=30&field=titles&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    statusFromId(id) {
        // Remanga status mapping (empirical): 0=Продолжается, 1=Завершён, 2=Заморожен, 3=Выпуск прекращён
        return { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }[id] ?? 5;
    }

    async getDetail(dir) {
        const infoRes = await this.client.get(`${this.source.apiUrl}/titles/${dir}/`, this.headers);
        if (infoRes.statusCode !== 200) {
            return { name: dir, imageUrl: "", description: "(Ошибка — возможно нужен Bearer token в настройках)", status: 5, genre: [], chapters: [] };
        }
        const body = JSON.parse(infoRes.body);
        const t = body.content || body.results || body;
        const branchId = (t.branches && t.branches[0] && t.branches[0].id) || "";

        // Chapters — paginate through /titles/chapters/?branch_id=X&page=N
        const chapters = [];
        let page = 1;
        while (page <= 10 && branchId) {
            const cres = await this.client.get(
                `${this.source.apiUrl}/titles/chapters/?branch_id=${branchId}&page=${page}&count=500&ordering=-index&user_data=1`,
                this.headers
            );
            if (cres.statusCode !== 200) break;
            const cj = JSON.parse(cres.body);
            const arr = cj.content || cj.results || [];
            if (!Array.isArray(arr) || arr.length === 0) break;
            for (const c of arr) {
                if (c.is_published === false) continue;
                if (c.is_paid && !c.is_bought && !c.is_free_today) continue;
                chapters.push({
                    name: `Том ${c.tome} · Глава ${c.chapter}` + (c.name ? `: ${c.name}` : ""),
                    url: `${this.source.apiUrl}/titles/chapters/${c.id}/`,
                    dateUpload: c.upload_date ? new Date(c.upload_date).valueOf().toString() : Date.now().toString(),
                    scanlator: (c.publishers || []).map(p => p.name).join(", ") || null
                });
            }
            if (!cj.next) break;
            page += 1;
        }

        let genre = [];
        if (Array.isArray(t.genres)) genre = t.genres.map(g => g.name || "").filter(x => x);

        return {
            name: t.main_name || t.rus_name || t.secondary_name || dir,
            imageUrl: this.absImg((t.img && (t.img.mid || t.img.high)) || (t.cover && (t.cover.mid || t.cover.high)) || ""),
            description: (t.description || "").replace(/<[^>]+>/g, ""),
            author: (t.publishers || []).map(p => p.name || "").filter(x => x).join(", "),
            genre: genre,
            status: this.statusFromId(t.status && t.status.id),
            chapters: chapters
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return [];
        const j = JSON.parse(res.body);
        const data = j.content || j.results || j;
        // pages is a 2D array — flatten
        const flat = [];
        const pages = data.pages || [];
        for (const p of pages) {
            if (Array.isArray(p)) {
                for (const pp of p) if (pp && pp.link) flat.push(pp);
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
                summary: "Из DevTools → Network после логина. Нужен для 18+ и платных глав.",
                value: "",
                dialogTitle: "Token",
                dialogMessage: "Без слова Bearer"
            }
        }];
    }
}
