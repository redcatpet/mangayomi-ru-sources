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
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animego.js",
    "notes": "Плеер — iframe Kodik/Sibnet/Alloha. MVP возвращает прямой iframe URL, полноценная HLS-экстракция — TODO."
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
        // Cards: .animes-grid-item or .media-item with inner <a href="/anime/slug">
        let items = doc.select(".animes-grid-item, .media-item, .card-grid-item");
        if (items.length === 0) {
            // Fallback: any anchor directly to /anime/slug — skip genre/type/status links
            const anchors = doc.select("a[href*='/anime/']").filter(a => {
                const h = a.attr("href") || "";
                return !/\/(genre|type|status|season|studio)\//.test(h);
            });
            const seen = {};
            for (const a of anchors) {
                const h = a.attr("href");
                if (seen[h]) continue;
                seen[h] = true;
                const img = a.selectFirst("img");
                const imageUrl = img ? (img.attr("src") || img.attr("data-src") || "") : "";
                const name = (a.attr("title") || a.text || "").trim();
                if (name) list.push({ name, imageUrl: this.absUrl(imageUrl), link: h });
            }
            return { list, hasNextPage: list.length >= 20 };
        }
        for (const it of items) {
            const a = it.selectFirst("a[href*='/anime/']");
            if (!a) continue;
            const href = a.attr("href");
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const nameEl = it.selectFirst(".card-title, .h5, .animes-grid-item-body h1, .anime-title");
            const name = (nameEl ? nameEl.text : (a.attr("title") || "")).trim();
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 20 };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/anime?sort=rating&direction=desc&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/anime?sort=startDate&direction=desc&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/search/anime?q=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1.anime-title, h1.ws-title, h1")).text.trim();
        const imgEl = doc.selectFirst(".anime-poster img, .ws-cover img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
        const descEl = doc.selectFirst(".description, .anime-description, div.text-white");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/anime/genre/']").map(e => e.text.trim());

        // Episodes through ajax: /anime/{id}/player?_allow=true&episodeNumber=N
        // The anime page exposes data-id attribute for this
        const mainEl = doc.selectFirst("[data-anime-id], [data-id]");
        const animeId = mainEl ? (mainEl.attr("data-anime-id") || mainEl.attr("data-id")) : "";

        // Try to pull episodes from an inline listing (usually present for short series)
        const epEls = doc.select(".episodes-list a, ul.episodes li a, a[href*='/anime/'][href*='/episodes/']");
        const episodes = [];
        for (const e of epEls) {
            const href = e.attr("href");
            if (!href) continue;
            episodes.push({
                name: e.text.trim() || ("Эпизод " + (episodes.length + 1)),
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }
        // Fallback: build from #eps_count metadata if present
        if (episodes.length === 0 && animeId) {
            const epsCount = parseInt((doc.selectFirst(".media-section:contains(эпизодов)") || { text: "" }).text.match(/(\d+)/) || [0, 1])[1] || 1;
            for (let i = 1; i <= epsCount; i++) {
                episodes.push({
                    name: "Эпизод " + i,
                    url: `${this.source.baseUrl}/anime/${animeId}/player?_allow=true&episodeNumber=${i}`,
                    dateUpload: Date.now().toString(),
                    scanlator: null
                });
            }
        }

        return { name, imageUrl, description, genre, status: 5, episodes: episodes.reverse() };
    }

    async getVideoList(url) {
        // Fetch the episode's player page — it contains Kodik/Sibnet/Alloha iframes
        const res = await this.client.get(this.absUrl(url), this.headers);
        const body = res.body;
        const videos = [];
        // Extract iframes with src containing kodik / sibnet / alloha
        const iframeRe = /<iframe[^>]*\s+src=["']([^"']+)["']/g;
        let m;
        while ((m = iframeRe.exec(body)) !== null) {
            let src = m[1];
            if (src.startsWith("//")) src = "https:" + src;
            let provider = "unknown";
            if (src.includes("kodik")) provider = "Kodik";
            else if (src.includes("sibnet")) provider = "Sibnet";
            else if (src.includes("alloha")) provider = "Alloha";
            else if (src.includes("aniboom")) provider = "Aniboom";
            if (provider === "unknown") continue;
            videos.push({
                url: src,
                originalUrl: src,
                quality: provider + " (iframe)",
                headers: this.headers
            });
        }
        // TODO: full HLS extraction for Kodik/Aniboom — see issues
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
