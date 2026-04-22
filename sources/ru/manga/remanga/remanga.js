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
    "version": "0.3.0",
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
        // If query is provided use the search endpoint; otherwise use the catalog endpoint with filter params.
        if (query) {
            const res = await this.client.get(
                `${this.source.apiUrl}/search/?query=${encodeURIComponent(query)}&count=30&field=titles&page=${page}`,
                this.headers
            );
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };
            return this.parseList(res.body);
        }

        let url = `${this.source.apiUrl}/search/catalog/?count=30&page=${page}`;
        if (filters && filters.length) {
            // [0] SortFilter → ordering
            const f0 = filters[0];
            if (f0 && f0.values) {
                const idx = (f0.state && f0.state.index != null) ? f0.state.index : 0;
                const asc = !!(f0.state && f0.state.ascending);
                const val = f0.values[idx].value;
                if (val === "random") url += `&ordering=random`;
                else url += `&ordering=${asc ? "" : "-"}${val}`;
            }
            // [1] Types
            const f1 = filters[1];
            if (f1 && f1.state) for (const x of f1.state) if (x.state) url += `&types=${x.value}`;
            // [2] Age limit
            const f2 = filters[2];
            if (f2 && f2.state) for (const x of f2.state) if (x.state) url += `&age_limit=${x.value}`;
            // [3] Status
            const f3 = filters[3];
            if (f3 && f3.state) for (const x of f3.state) if (x.state) url += `&status=${x.value}`;
            // [4] Genres (multi-select)
            const f4 = filters[4];
            if (f4 && f4.state) for (const x of f4.state) if (x.state) url += `&genres=${x.value}`;
        } else {
            url += "&ordering=-rating";
        }
        const res = await this.client.get(url, this.headers);
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

    getFilterList() {
        return [
            {
                type_name: "SortFilter",
                type: "ordering",
                name: "Сортировка",
                state: { type_name: "SortState", index: 0, ascending: false },
                values: [
                    ["По рейтингу", "rating"],
                    ["По просмотрам", "views"],
                    ["По обновлению", "chapter_date"],
                    ["По ID (новое)", "id"],
                    ["Случайно", "random"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "types",
                name: "Тип",
                state: [
                    ["Манга", 1], ["Манхва", 2], ["Маньхуа", 3], ["Западный комикс", 4],
                    ["Русскомикс", 5], ["Индонезийский", 6], ["Новелла", 7]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: String(x[1]) }))
            },
            {
                type_name: "GroupFilter",
                type: "age_limit",
                name: "Возраст",
                state: [
                    ["Нет", 0], ["16+", 1], ["18+", 2]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: String(x[1]) }))
            },
            {
                type_name: "GroupFilter",
                type: "status",
                name: "Статус",
                state: [
                    ["Продолжается", 2], ["Закончен", 1], ["Заморожен", 3], ["Нет переводчика", 4], ["Анонс", 5]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: String(x[1]) }))
            },
            {
                type_name: "GroupFilter",
                type: "genres",
                name: "Жанры",
                state: [
                    ["Экшен", 2], ["Боевые искусства", 3], ["Гарем", 5], ["Героическое фэнтези", 7],
                    ["Детектив", 8], ["Дзёсэй", 9], ["Додзинси", 10], ["Драма", 11], ["История", 13],
                    ["Киберпанк", 14], ["Кодомо", 15], ["Комедия", 50], ["Махо-сёдзё", 17], ["Меха", 18],
                    ["Повседневность", 21], ["Приключения", 23], ["Романтика", 25],
                    ["Сверхъестественное", 27], ["Сёдзё", 28], ["Сёнэн", 30], ["Спорт", 31],
                    ["Сэйнэн", 32], ["Трагедия", 34], ["Триллер", 35], ["Ужасы", 36], ["Фэнтези", 38],
                    ["Школьники", 39], ["Этти", 40], ["Юри", 41], ["Яой", 42],
                    ["Боевик", 59], ["Историческая проза", 61], ["Война", 66], ["Гурман", 239]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: String(x[1]) }))
            }
        ];
    }

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
