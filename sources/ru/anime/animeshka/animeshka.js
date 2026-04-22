const mangayomiSources = [{
    "name": "Animeshka",
    "lang": "ru",
    "baseUrl": "https://animeshka.net",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animeshka.js",
    "notes": "Актуальное зеркало: animeshka.net (старый animeshka.com умер). При блокировке замените baseUrl в настройках."
}];

const AS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AS_UA,
            "Accept-Language": "ru-RU,ru;q=0.9",
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
        const items = doc.select("article, .short, .card, .post-item");
        for (const it of items) {
            const a = it.selectFirst("a.short-title, h2 a, h3 a, a[href*='/anime/']");
            if (!a) continue;
            const href = a.attr("href");
            if (!href) continue;
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const name = a.text.trim() || a.attr("title") || "";
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a[rel=next], .pnext a");
        return { list, hasNextPage: hasNextPage || list.length >= 15 };
    }

    async getPopular(page) {
        const path = page === 1 ? "/" : `/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) { return await this.getPopular(page); }
    async search(query, page, filters) {
        const res = await this.client.post(
            `${this.source.baseUrl}/index.php?do=search`,
            { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
            { "do": "search", "subaction": "search", "story": query }
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const name = (doc.selectFirst("h1")).text.trim();
        const imgEl = doc.selectFirst(".poster img, .short-i-cover img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || "") : "";
        const descEl = doc.selectFirst(".desc, .full-text, div[itemprop=description]");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/janr/'], a[href*='/anime/genre/']").map(e => e.text.trim());

        // Animeshka typically has the player on the main page
        const episodes = [{
            name: "Плеер",
            url: this.absUrl(url),
            dateUpload: Date.now().toString(),
            scanlator: null
        }];
        return { name, imageUrl, description, genre, status: 5, episodes };
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
            let provider = "iframe";
            if (src.includes("kodik")) provider = "Kodik";
            else if (src.includes("aniboom")) provider = "Aniboom";
            videos.push({ url: src, originalUrl: src, quality: provider, headers: this.headers });
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
