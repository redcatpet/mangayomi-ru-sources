// @include: kodik_extractor

const mangayomiSources = [{
    "name": "AnimeGO",
    "lang": "ru",
    "baseUrl": "https://animego.me",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.5.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animego.js",
    "notes": "Эпизоды через AJAX /player/{id}. Многодабные озвучки: Kodik-extractor → HLS, Sibnet/VK/Aniboom — iframe."
}];

const AG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AG_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
    }

    get ajaxHeaders() {
        return {
            "User-Agent": AG_UA,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "Referer": this.source.baseUrl + "/",
            "X-Requested-With": "XMLHttpRequest"
        };
    }

    absUrl(u) {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        return this.source.baseUrl + (u.startsWith("/") ? u : "/" + u);
    }

    parseCatalog(htmlBody) {
        const doc = new Document(htmlBody);
        const list = [];
        const seen = {};
        // Anime cards — animego uses both ani-list__item + generic /anime/{slug}-{id} anchors
        let items = doc.select("div.ani-list__item");
        for (const card of items) {
            const titleA = card.selectFirst(".ani-list__item-title a") || card.selectFirst("a.ani-list__item-picture");
            if (!titleA) continue;
            const href = titleA.attr("href");
            if (!href || seen[href]) continue;
            seen[href] = true;
            const name = (titleA.text || titleA.attr("title") || "").trim();
            if (!name) continue;
            const img = card.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            list.push({ name, imageUrl, link: href });
        }
        if (list.length === 0) {
            const anchors = doc.select("a[href*='/anime/']");
            for (const a of anchors) {
                const h = a.attr("href") || "";
                if (!/^\/anime\/[^/]+-\d+\/?$/.test(h)) continue;
                if (seen[h]) continue;
                seen[h] = true;
                const name = (a.attr("title") || a.text || "").trim();
                if (!name || name.length < 2) continue;
                const img = a.selectFirst("img");
                const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
                list.push({ name, imageUrl, link: h });
            }
        }
        return { list, hasNextPage: list.length >= 20 };
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.source.baseUrl}/anime?sort=rating&direction=desc&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/anime?sort=startDate&direction=desc&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        if (query) {
            const res = await this.client.get(`${this.source.baseUrl}/search/anime?q=${encodeURIComponent(query)}&page=${page}`, this.headers);
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };
            return this.parseCatalog(res.body);
        }
        // Path-based filters: /anime/genre/{slug} or /anime/status/{slug} or /anime/type/{slug}
        let base = `${this.source.baseUrl}/anime`;
        if (filters && filters.length) {
            const f0 = filters[0]; // Genre single-select
            if (f0 && f0.values) {
                const idx = f0.state || 0;
                const slug = f0.values[idx].value;
                if (slug) base = `${this.source.baseUrl}/anime/genre/${slug}`;
            }
            const f1 = filters[1]; // Status
            if (f1 && f1.values) {
                const idx = f1.state || 0;
                const slug = f1.values[idx].value;
                if (slug && base === `${this.source.baseUrl}/anime`) base = `${this.source.baseUrl}/anime/status/${slug}`;
            }
            const f2 = filters[2]; // Type
            if (f2 && f2.values) {
                const idx = f2.state || 0;
                const slug = f2.values[idx].value;
                if (slug && base === `${this.source.baseUrl}/anime`) base = `${this.source.baseUrl}/anime/type/${slug}`;
            }
        }
        // Sort
        let sort = "rating", dir = "desc";
        if (filters && filters[3] && filters[3].values) {
            const idx = (filters[3].state && filters[3].state.index) || 0;
            sort = filters[3].values[idx].value || "rating";
            dir = filters[3].state && filters[3].state.ascending ? "asc" : "desc";
        }
        const res = await this.client.get(`${base}?sort=${sort}&direction=${dir}&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    animeIdFromUrl(url) {
        const m = (url || "").match(/\/anime\/[^/]*-(\d+)\/?/);
        return m ? m[1] : "";
    }

    async getDetail(url) {
        // Skip the detail HTML page entirely — Mangayomi already has name+image from
        // catalog. Only fetch /player/{id} AJAX (~90 KB) to enumerate episodes.
        // Saves one full HTML round-trip (~120 KB) → fits inside the JS isolate
        // response timeout for users behind DDoS-Guard latency.
        const animeId = this.animeIdFromUrl(url);
        if (!animeId) {
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, episodes: [] };
        }

        const playerRes = await this.client.get(`${this.source.baseUrl}/player/${animeId}`, this.ajaxHeaders);
        const episodes = [];
        if (playerRes && playerRes.statusCode === 200) {
            try {
                const content = (JSON.parse(playerRes.body).data || {}).content || "";
                const optRe = /<option\s+value="(\d+)"[^>]*>([^<]+)</g;
                let m;
                while ((m = optRe.exec(content)) !== null) {
                    const epId = m[1];
                    const label = m[2].trim();
                    episodes.push({
                        name: label,
                        url: `${this.source.baseUrl}/player/${animeId}?episode=${epId}`,
                        dateUpload: Date.now().toString(),
                        scanlator: null
                    });
                }
            } catch (e) { /* ignore */ }
        }

        // Mangayomi merges these fields with what was already shown in the catalog,
        // so empty name/imageUrl are fine — they keep the catalog values.
        return { name: "", imageUrl: "", description: "", genre: [], status: 5, episodes: episodes.reverse() };
    }

    async getVideoList(url) {
        const res = await this.client.get(this.absUrl(url), this.ajaxHeaders);
        if (res.statusCode !== 200) return [];
        let content = "";
        try { content = (JSON.parse(res.body).data || {}).content || ""; } catch (e) { return []; }
        // Decode &amp; in data-player URLs
        content = content.replace(/&amp;/g, "&");

        // Each player entry: data-player="..." data-provider-title="..." data-translation-title="..."
        const re = /data-player="([^"]+)"[^>]*data-provider-title="([^"]*)"[^>]*data-translation-title="([^"]*)"/g;
        const videos = [];
        let m;
        while ((m = re.exec(content)) !== null) {
            const playerUrl = m[1];
            const provider = m[2];
            const translation = m[3];

            if (provider.toLowerCase() === "kodik" || playerUrl.indexOf("kodikplayer") >= 0) {
                // kodikExtract returns HLS streams + iframe fallback at the end (v0.8.1+).
                const kodikVids = await kodikExtract(this.client, playerUrl, this.source.baseUrl, `AnimeGO · ${translation || "Kodik"}`);
                for (const v of kodikVids) videos.push(v);
                continue;
            }
            // Non-Kodik providers — keep iframe URL (Mangayomi may or may not play it)
            let src = playerUrl;
            if (src.startsWith("//")) src = "https:" + src;
            videos.push({
                url: src,
                originalUrl: src,
                quality: `AnimeGO · ${translation || provider} (${provider} iframe)`,
                headers: { "User-Agent": AG_UA, "Referer": this.source.baseUrl + "/" }
            });
        }
        return videos;
    }

    getFilterList() {
        const genres = [
            ["— Любой —", ""], ["Боевик", "action"], ["Приключения", "adventure"],
            ["Комедия", "comedy"], ["Драма", "drama"], ["Фэнтези", "fantasy"],
            ["Ужасы", "horror"], ["Мистика", "mystery"], ["Мифология", "mythology"],
            ["Романтика", "romance"], ["Научная фантастика", "sci-fi"], ["Сэйнэн", "seinen"],
            ["Сёнен", "shounen"], ["Сёдзё", "shoujo"], ["Сверхъестественное", "supernatural"],
            ["Повседневность", "slice-of-life"], ["Гурман", "gourmet"],
            ["Меха", "mecha"], ["Музыка", "music"], ["Спорт", "sports"],
            ["Этти", "ecchi"], ["Гарем", "harem"], ["Школа", "school"],
            ["Исторический", "historical"], ["Психологическое", "psychological"],
            ["Триллер", "thriller"], ["Исекай", "isekai"],
            ["Боевые искусства", "martial-arts"], ["Магия", "magic"],
            ["Демоны", "demons"], ["Вампиры", "vampires"]
        ];
        const statuses = [
            ["— Любой —", ""], ["Онгоинг", "ongoing"], ["Вышло", "released"], ["Анонс", "anons"]
        ];
        const types = [
            ["— Любой —", ""], ["TV Сериал", "tv"], ["Фильм", "movie"],
            ["ONA", "ona"], ["OVA", "ova"], ["Спешл", "special"]
        ];
        return [
            {
                type_name: "SelectFilter", type: "genre", name: "Жанр", state: 0,
                values: genres.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter", type: "status", name: "Статус", state: 0,
                values: statuses.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter", type: "type", name: "Тип", state: 0,
                values: types.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SortFilter", type: "sort", name: "Сортировка",
                state: { type_name: "SortState", index: 0, ascending: false },
                values: [
                    ["Рейтинг", "rating"], ["Дата начала", "startDate"], ["Название", "name"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            }
        ];
    }
    getSourcePreferences() { return []; }
}
