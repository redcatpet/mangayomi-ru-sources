// @include: kodik_extractor

const mangayomiSources = [{
    "name": "YummyAnime",
    "lang": "ru",
    "baseUrl": "https://yummyanime.tv",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/yummyanime.js",
    "notes": "DLE-движок. Плеер берётся через /engine/ajax/controller.php?mod=kodik-player&id={news_id} (Kodik) или mod=alloha-player. Multi-dub раскрывается внутри Kodik iframe."
}];

const YUM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": YUM_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9",
            "Referer": this.source.baseUrl + "/"
        };
    }

    get ajaxHeaders() {
        return {
            "User-Agent": YUM_UA,
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": this.source.baseUrl + "/"
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
        // Card structure: <div class="movie-item"><div class="movie-item__inner ..."><a class="movie-item__link" href="...">...</a></div></div>
        const cards = doc.select("a.movie-item__link");
        for (const a of cards) {
            const href = a.attr("href");
            if (!href || seen[href]) continue;
            seen[href] = true;
            const titleEl = a.selectFirst("div.movie-item__title");
            const name = (titleEl ? titleEl.text : a.attr("title") || "").trim();
            if (!name) continue;
            const img = a.selectFirst("img");
            let imageUrl = "";
            if (img) imageUrl = this.absUrl(img.attr("data-src") || img.attr("src") || "");
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 20 };
    }

    async getPopular(page) {
        // Top-100 is a curated rating list; falls back to /ongoing/ on later pages
        const url = page === 1 ? `${this.source.baseUrl}/top-100/` : `${this.source.baseUrl}/ongoing/page/${page}/`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const url = page === 1 ? this.source.baseUrl + "/" : `${this.source.baseUrl}/page/${page}/`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        const slug = encodeURIComponent(String(query || "").split(" ").join("+"));
        const url = page === 1
            ? `${this.source.baseUrl}/index.php?do=search&subaction=search&story=${slug}`
            : `${this.source.baseUrl}/index.php?do=search&subaction=search&story=${slug}&search_start=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    newsIdFromUrl(url) {
        const m = String(url || "").match(/\/(\d+)-/);
        return m ? m[1] : "";
    }

    async getDetail(url) {
        const detailUrl = this.absUrl(url);
        const res = await this.client.get(detailUrl, this.headers);
        const doc = new Document(res.body);

        const name = ((doc.selectFirst("h1") || { text: "" }).text || "").trim();
        let imageUrl = "";
        const img = doc.selectFirst("img.poster, .inner-page__img img, .movie-thumb img");
        if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
        if (!imageUrl) {
            const og = doc.selectFirst("meta[property=og:image]");
            if (og) imageUrl = og.attr("content") || "";
        }
        const descEl = doc.selectFirst("div.inner-page__text") || doc.selectFirst("meta[name=description]");
        const description = descEl ? (descEl.text || descEl.attr("content") || "").trim() : "";
        const genre = doc.select("a[href*='/series/']:not([href*='/page/']), a[href*='/genre/']").map(e => e.text.trim()).filter(x => x && x.length < 30);

        const newsId = this.newsIdFromUrl(detailUrl);
        if (!newsId) return { name, imageUrl, description, genre, status: 5, episodes: [] };

        // Try Kodik first; Alloha as a fallback dub
        const kodikRes = await this.client.get(
            `${this.source.baseUrl}/engine/ajax/controller.php?mod=kodik-player&url=1&action=iframe&id=${newsId}`,
            { ...this.ajaxHeaders, "Referer": detailUrl }
        );
        let kodikUrl = "";
        try {
            const j = JSON.parse(kodikRes.body);
            if (j && j.success && j.data) kodikUrl = String(j.data).replace(/&amp;/g, "&");
        } catch (e) {}

        const allohaRes = await this.client.get(
            `${this.source.baseUrl}/engine/ajax/controller.php?mod=alloha-player&url=1&action=iframe&id=${newsId}`,
            { ...this.ajaxHeaders, "Referer": detailUrl }
        );
        let allohaUrl = "";
        try {
            const j = JSON.parse(allohaRes.body);
            if (j && j.success && j.data) allohaUrl = String(j.data).replace(/&amp;/g, "&");
        } catch (e) {}

        const episodes = [];
        if (kodikUrl) {
            const parsed = kodikParseUrl(kodikUrl);
            if (parsed) {
                if (parsed.type === "serial") {
                    // Multi-episode series — enumerate via Kodik serial iframe
                    const eps = await kodikFetchSerialEpisodes(this.client, kodikUrl, this.source.baseUrl);
                    for (const ep of eps) {
                        // Pack: id|hash|provider (Kodik) — alloha as separate fallback below
                        episodes.push({
                            name: ep.title || `Серия ${ep.episode}`,
                            url: `${ep.id}|${ep.hash}|kodik|YummyAnime`,
                            dateUpload: Date.now().toString(),
                            scanlator: "Kodik"
                        });
                    }
                    episodes.reverse();
                } else {
                    // /video/ → single film
                    episodes.push({
                        name: "Фильм",
                        url: `${parsed.id}|${parsed.hash}|kodik|YummyAnime`,
                        dateUpload: Date.now().toString(),
                        scanlator: "Kodik"
                    });
                }
            }
        }
        // If Kodik gave nothing but Alloha did, fallback as single iframe
        if (episodes.length === 0 && allohaUrl) {
            episodes.push({
                name: "Плеер (Alloha)",
                url: `iframe|${allohaUrl}|alloha|YummyAnime`,
                dateUpload: Date.now().toString(),
                scanlator: "Alloha"
            });
        }
        // Always offer Alloha as an extra "track" (if both exist)
        if (allohaUrl && episodes.length > 0 && episodes[0].url.indexOf("|alloha|") < 0) {
            episodes.unshift({
                name: "▶ Все серии (Alloha · авто-балансер)",
                url: `iframe|${allohaUrl}|alloha|YummyAnime`,
                dateUpload: Date.now().toString(),
                scanlator: "Alloha"
            });
        }

        return { name, imageUrl, description, genre, status: 5, episodes };
    }

    async getVideoList(url) {
        const parts = String(url || "").split("|");
        if (parts.length < 3) return [];

        const provider = parts[2];
        if (provider === "kodik") {
            // Build seria URL and run Kodik extractor
            const seriaUrl = `https://kodikplayer.com/seria/${parts[0]}/${parts[1]}/720p`;
            return await kodikExtract(this.client, seriaUrl, this.source.baseUrl, "YummyAnime · Kodik");
        }
        if (provider === "alloha") {
            // Alloha is an iframe-only balancer; no in-JS extraction. Pass through.
            const src = parts[1];
            return [{
                url: src,
                originalUrl: src,
                quality: "YummyAnime · Alloha (iframe)",
                headers: { "User-Agent": YUM_UA, "Referer": this.source.baseUrl + "/" }
            }];
        }
        return [];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
