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
    "version": "0.3.0",
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
        let url = `${this.getApiUrl()}/?limit=20&page=${page}`;
        if (query) url += `&search=${encodeURIComponent(query)}`;

        if (filters && filters.length) {
            // Filter [0] — order
            const f0 = filters[0];
            if (f0 && f0.values) {
                const idx = (f0.state && f0.state.index != null) ? f0.state.index : 0;
                const ordVal = f0.values[idx].value;
                if (ordVal) url += `&order=${ordVal}`;
            }
            // Filter [1] — kind (manga/manhwa/manhua/одно-или-многостраничная)
            const f1 = filters[1];
            if (f1 && f1.state) {
                const on = f1.state.filter(x => x.state === true).map(x => x.value);
                if (on.length) url += `&kinds=${on.join(",")}`;
            }
            // Filter [2] — age rating
            const f2 = filters[2];
            if (f2 && f2.values) {
                const idx = (f2.state && f2.state.index != null) ? f2.state.index : 0;
                const v = f2.values[idx].value;
                if (v) url += `&age=${v}`;
            }
            // Filter [3] — publication status
            const f3 = filters[3];
            if (f3 && f3.values) {
                const idx = (f3.state && f3.state.index != null) ? f3.state.index : 0;
                const v = f3.values[idx].value;
                if (v) url += `&status=${v}`;
            }
            // Filter [4] — translation status
            const f4 = filters[4];
            if (f4 && f4.values) {
                const idx = (f4.state && f4.state.index != null) ? f4.state.index : 0;
                const v = f4.values[idx].value;
                if (v) url += `&trans=${v}`;
            }
            // Filter [5] — genres (include)
            const f5 = filters[5];
            if (f5 && f5.state) {
                const on = f5.state.filter(x => x.state === 1 || x.state === true).map(x => x.value);
                if (on.length) url += `&genres=${on.join(",")}`;
            }
        }

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

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                type: "order",
                name: "Сортировка",
                state: 0,
                values: [
                    ["По популярности", "popular"],
                    ["По обновлению", "updated"],
                    ["По имени", "name"],
                    ["По дате добавления", "id"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "kinds",
                name: "Тип",
                state: [
                    ["Манга", "manga"],
                    ["Манхва", "manhwa"],
                    ["Маньхуа", "manhua"],
                    ["One-Shot", "one_shot"],
                    ["Додзинси", "doujin"]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "age",
                name: "Возрастной рейтинг",
                state: 0,
                values: [
                    ["Любой", ""],
                    ["Без ограничений", "no"],
                    ["13+", "nr13"],
                    ["16+", "nr16"],
                    ["18+ (яой/хентай)", "nr18"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "status",
                name: "Статус выпуска",
                state: 0,
                values: [
                    ["Любой", ""],
                    ["Онгоинг", "ongoing"],
                    ["Завершён", "released"],
                    ["Анонс", "anons"],
                    ["Заморожен", "copyrighted"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "trans",
                name: "Статус перевода",
                state: 0,
                values: [
                    ["Любой", ""],
                    ["Продолжается", "continue"],
                    ["Завершён", "finished"],
                    ["Заморожен", "frozen"],
                    ["Заброшен", "drop"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "genres",
                name: "Жанры",
                state: [
                    ["Сёнен", "shounen"], ["Сёдзё", "shoujo"], ["Сэйнэн", "seinen"], ["Дзёсэй", "josei"],
                    ["Романтика", "romance"], ["Комедия", "comedy"], ["Драма", "drama"],
                    ["Фэнтези", "fantasy"], ["Приключения", "adventure"], ["Боевик", "action"],
                    ["Триллер", "thriller"], ["Ужасы", "horror"], ["Мистика", "mystery"],
                    ["Школа", "school"], ["Повседневность", "slice of life"], ["Магия", "magic"],
                    ["Исэкай", "isekai"], ["Гарем", "harem"], ["Экшн", "action"],
                    ["Психология", "psychological"], ["Научная фантастика", "sci-fi"],
                    ["Сверхъестественное", "supernatural"], ["Эротика", "ecchi"], ["Яой", "yaoi"], ["Юри", "yuri"]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: x[1] }))
            }
        ];
    }

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
