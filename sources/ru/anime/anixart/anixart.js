// @include: kodik_extractor

const mangayomiSources = [{
    "name": "Anixart",
    "lang": "ru",
    "baseUrl": "https://anixart.tv",
    "apiUrl": "https://api.anixart.tv",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/anixart.js",
    "notes": "Публичный мобильный API anixart.tv. Богатый выбор озвучек (AniDUB, AniLibria, SHIZA Project и др.). Плееры — Kodik-iframe → HLS через extractor."
}];

const AX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const AX_PAGE_SIZE = 25;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AX_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
    }

    mapList(items) {
        return (items || []).map(r => ({
            name: r.title_ru || r.title_original || r.title_alt || String(r.id),
            imageUrl: r.image || "",
            link: String(r.id)
        }));
    }

    buildFilterBody(sort, filters) {
        // Builds POST body for /filter/{page}. Returns urlencoded string.
        const parts = [`sort=${sort}`];
        if (filters && filters.length) {
            // [1] Genres — TriState. State=1 include (comma join), State=2 exclude via is_genres_excluded_mode.
            const f1 = filters[1];
            const included = [], excluded = [];
            if (f1 && f1.state) {
                for (const g of f1.state) {
                    if (g.state === 1) included.push(g.value);
                    else if (g.state === 2) excluded.push(g.value);
                }
            }
            if (included.length) parts.push(`genres=${encodeURIComponent(included.join(","))}`);
            if (excluded.length) {
                parts.push(`genres=${encodeURIComponent(excluded.join(","))}`);
                parts.push(`is_genres_excluded_mode_enabled=true`);
            }
            // [2] Status
            const f2 = filters[2];
            if (f2 && f2.values) {
                const idx = f2.state || 0;
                const v = f2.values[idx].value;
                if (v) parts.push(`status=${v}`);
            }
            // [3] Category (TV/Movie/OVA/ONA/Special)
            const f3 = filters[3];
            if (f3 && f3.values) {
                const idx = f3.state || 0;
                const v = f3.values[idx].value;
                if (v) parts.push(`category=${v}`);
            }
        }
        return parts.join("&");
    }

    async fetchFilter(sort, page, filters) {
        // POST body with sort + filter fields is more robust than GET query params.
        const body = this.buildFilterBody(sort, filters);
        const url = `${this.source.apiUrl}/filter/${page - 1}`;
        const postHeaders = { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" };
        let res = await this.client.post(url, postHeaders, body);
        // Fallback to GET if POST returns empty (some regions)
        if (!res || res.statusCode !== 200 || !res.body) {
            res = await this.client.get(`${url}?${body}`, this.headers);
        }
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        const json = JSON.parse(res.body);
        const content = json.content || [];
        return { list: this.mapList(content), hasNextPage: content.length >= AX_PAGE_SIZE };
    }

    async getPopular(page) { return await this.fetchFilter(4, page); }
    async getLatestUpdates(page) { return await this.fetchFilter(1, page); }

    async search(query, page, filters) {
        // Sort derived from filter[0] if present, else default to 4 (views).
        let sort = 4;
        if (filters && filters[0] && filters[0].values) {
            const idx = (filters[0].state && filters[0].state.index != null) ? filters[0].state.index : 0;
            const v = parseInt(filters[0].values[idx].value);
            if (!isNaN(v)) sort = v;
        }

        if (query) {
            const res = await this.client.post(
                `${this.source.apiUrl}/search/releases/${page - 1}`,
                { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
                `query=${encodeURIComponent(query)}&searchBy=1`
            );
            if (res.statusCode === 200 && res.body) {
                try {
                    const json = JSON.parse(res.body);
                    const list = this.mapList(json.content || []);
                    if (list.length) return { list, hasNextPage: list.length >= AX_PAGE_SIZE };
                } catch (e) {}
            }
            const pop = await this.getPopular(page);
            const q = query.toLowerCase();
            return {
                list: pop.list.filter(m => m.name.toLowerCase().indexOf(q) >= 0),
                hasNextPage: pop.hasNextPage
            };
        }
        return await this.fetchFilter(sort, page, filters);
    }

    parseStatus(s) {
        if (!s) return 5;
        const name = (s.name || "").toLowerCase();
        if (name.indexOf("онго") >= 0 || name.indexOf("выход") >= 0) return 0;
        if (name.indexOf("законч") >= 0 || name.indexOf("заверш") >= 0 || name.indexOf("выш") >= 0) return 1;
        if (name.indexOf("анонс") >= 0) return 4;
        return 5;
    }

    async getDetail(url) {
        const id = String(url).replace(/\D/g, "");
        const res = await this.client.get(`${this.source.apiUrl}/release/${id}`, this.headers);
        if (res.statusCode !== 200) {
            return { name: id, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], episodes: [] };
        }
        const r = (JSON.parse(res.body).release) || {};

        // Build the episode list by flattening all voice-over types and their sources.
        // For each (releaseId, typeId, sourceId) → fetch episodes. We group by episode.position
        // so each Mangayomi "episode" exposes ALL dubs/providers for that number.
        const typesRes = await this.client.get(`${this.source.apiUrl}/episode/${id}`, this.headers);
        const types = typesRes.statusCode === 200 ? (JSON.parse(typesRes.body).types || []) : [];

        // episode.position → [{ typeName, providerName, playerUrl }, ...]
        const byPos = {};
        for (const t of types) {
            const typeName = t.name || "";
            const sourcesRes = await this.client.get(`${this.source.apiUrl}/episode/${id}/${t.id}`, this.headers);
            if (sourcesRes.statusCode !== 200) continue;
            const sources = (JSON.parse(sourcesRes.body).sources) || [];
            for (const s of sources) {
                const providerName = s.name || "";
                const epsRes = await this.client.get(`${this.source.apiUrl}/episode/${id}/${t.id}/${s.id}`, this.headers);
                if (epsRes.statusCode !== 200) continue;
                const eps = (JSON.parse(epsRes.body).episodes) || [];
                for (const e of eps) {
                    const key = String(e.position || e.name || e["@id"]);
                    if (!byPos[key]) byPos[key] = { position: e.position, name: e.name, dubs: [] };
                    byPos[key].dubs.push({
                        typeName,
                        providerName,
                        url: e.url || e.iframe || ""
                    });
                }
            }
        }

        // Encode all dubs for an episode into the URL (delimited) so getVideoList can decode.
        const episodes = Object.keys(byPos).map(k => byPos[k]).sort((a, b) => (a.position || 0) - (b.position || 0))
            .map(ep => {
                const packed = ep.dubs.map(d => `${d.typeName}|${d.providerName}|${d.url}`).join("\n");
                return {
                    name: ep.name || `Эпизод ${ep.position}`,
                    url: packed,
                    dateUpload: Date.now().toString(),
                    scanlator: null
                };
            }).reverse();

        return {
            name: r.title_ru || r.title_original || id,
            imageUrl: r.image || "",
            description: r.description || "",
            author: r.director || r.author || "",
            genre: r.genres ? String(r.genres).split(",").map(x => x.trim()).filter(Boolean) : [],
            status: this.parseStatus(r.status),
            episodes
        };
    }

    async getVideoList(url) {
        const videos = [];
        const lines = (url || "").split("\n").filter(x => x.trim());
        for (const line of lines) {
            const parts = line.split("|");
            if (parts.length < 3) continue;
            const typeName = parts[0];
            const providerName = parts[1];
            const playerUrl = parts.slice(2).join("|");
            if (!playerUrl) continue;

            const isKodik = providerName.toLowerCase() === "kodik" || playerUrl.indexOf("kodikplayer") >= 0;
            if (isKodik) {
                const v = await kodikExtract(this.client, playerUrl, this.source.baseUrl, `Anixart · ${typeName}`);
                for (const vid of v) videos.push(vid);
                continue;
            }
            let src = playerUrl;
            if (src.startsWith("//")) src = "https:" + src;
            videos.push({
                url: src,
                originalUrl: src,
                quality: `Anixart · ${typeName} (${providerName})`,
                headers: { "User-Agent": AX_UA, "Referer": this.source.baseUrl + "/" }
            });
        }
        return videos;
    }

    getFilterList() {
        return [
            {
                type_name: "SortFilter",
                type: "sort",
                name: "Сортировка",
                state: { type_name: "SortState", index: 0, ascending: false },
                values: [
                    ["По просмотрам", "4"],
                    ["Новые эпизоды", "1"],
                    ["По рейтингу", "2"],
                    ["По кол-ву оценок", "3"],
                    ["По дате добавления", "5"],
                    ["По алфавиту", "6"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "genres",
                name: "Жанры",
                state: [
                    "Экшен", "Приключения", "Комедия", "Драма", "Фэнтези", "Романтика",
                    "Школа", "Сёнэн", "Сёдзё", "Сэйнэн", "Спорт", "Ужасы", "Детектив",
                    "Триллер", "Меха", "Магия", "Исекай", "Повседневность",
                    "Сверхъестественное", "Психологическое", "Пародия", "Фантастика",
                    "Музыка", "Махо-сёдзё", "Вампиры", "Военное", "Игры", "Исторический",
                    "Полиция", "Боевые искусства", "Самураи", "Космос", "Демоны",
                    "Дзёсэй", "Супер сила", "Гарем", "Этти", "Кодомо"
                ].map(x => ({ type_name: "TriState", name: x, value: x }))
            },
            {
                type_name: "SelectFilter",
                type: "status",
                name: "Статус",
                state: 0,
                values: [
                    ["— Любой —", ""], ["Онгоинг", "1"], ["Вышел", "2"], ["Анонс", "3"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "category",
                name: "Категория",
                state: 0,
                values: [
                    ["— Любая —", ""], ["TV Сериал", "1"], ["Фильм", "2"],
                    ["OVA", "3"], ["ONA", "4"], ["Спешл", "5"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            }
        ];
    }
    getSourcePreferences() { return []; }
}
