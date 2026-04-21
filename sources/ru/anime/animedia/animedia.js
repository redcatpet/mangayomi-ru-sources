const mangayomiSources = [{
    "name": "Animedia",
    "lang": "ru",
    "baseUrl": "https://amd.online",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animedia.js",
    "notes": "animedia.tv/.my умерли, проект переехал на amd.online. Можно сменить baseUrl в настройках при блокировке."
}];

const AD_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AD_UA,
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
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
        // amd.online uses DLE template — cards are <div class="animefilm"> or <div class="grid-item">
        // with inner anchor to /some-slug-123.html
        const cards = doc.select("div.animefilm, div.grid-item, article, div.short");
        for (const it of cards) {
            const a = it.selectFirst("a[href]");
            if (!a) continue;
            const href = a.attr("href") || "";
            // skip nav/filter links
            if (!href || /\/(ongoingi|top|filter|ghanr|god|tip|page|forum|pm)/.test(href)) continue;
            if (seen[href]) continue;
            seen[href] = true;
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const nameEl = it.selectFirst(".grid-item__title, .animefilm__title, h2, h3") || a;
            const name = (nameEl.text || a.attr("title") || "").trim();
            if (!name || name.length < 2) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = list.length >= 10;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const path = page === 1 ? "/ongoingi/" : `/ongoingi/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }
    async search(query, page, filters) {
        const res = await this.client.post(
            `${this.source.baseUrl}/index.php?do=search`,
            { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
            { "do": "search", "subaction": "search", "story": query || "" }
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1")).text.trim();
        const imgEl = doc.selectFirst(".ws-cover img, .poster img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
        const descEl = doc.selectFirst(".description, .ws-description");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/catalog/genre/']").map(e => e.text.trim());

        const episodes = [];
        const epEls = doc.select(".ws-tabs-list a, ul.episodes-list a, a[href*='/episode']");
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

        return { name, imageUrl, description, genre, status: 5, episodes: episodes.reverse() };
    }

    async getVideoList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const body = res.body;
        const videos = [];
        const re = /<iframe[^>]+src=["']([^"']+)["']/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            let src = m[1];
            if (src.startsWith("//")) src = "https:" + src;
            if (!src.includes("http")) continue;
            videos.push({
                url: src,
                originalUrl: src,
                quality: "Animedia (iframe)",
                headers: this.headers
            });
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
