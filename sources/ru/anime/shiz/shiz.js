const mangayomiSources = [{
    "name": "Shiz.cc",
    "lang": "ru",
    "baseUrl": "https://shiz.cc",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/shiz.js",
    "notes": "⚠ Источник WIP. Домен shiz.cc часто DNS-fail — замените baseUrl в настройках на рабочее зеркало (shikimori-связанные: shikki.me и т.п.)."
}];

const SH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": SH_UA,
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
        const items = doc.select("article.anime-card, div.card, div.post-item, .anime-list-item");
        for (const it of items) {
            const a = it.selectFirst("a[href*='/anime/'], h2 a, h3 a, a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href) continue;
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const nameEl = it.selectFirst(".card-title, h2, h3, .title") || a;
            const name = nameEl.text.trim() || a.attr("title") || "";
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a.next-page, a[rel=next]");
        return { list, hasNextPage: hasNextPage || list.length >= 15 };
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.source.baseUrl}/anime?sort=rating&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/anime?sort=new&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/search?q=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const name = (doc.selectFirst("h1")).text.trim();
        const imgEl = doc.selectFirst(".anime-poster img, .poster img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || "") : "";
        const descEl = doc.selectFirst(".description, .anime-description");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/genre/']").map(e => e.text.trim());

        const episodes = [];
        const epEls = doc.select("a[href*='/episode/'], .episodes-list a, ul.eps li a");
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
        if (episodes.length === 0) {
            // Single-page player
            episodes.push({
                name: "Плеер",
                url: this.absUrl(url),
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
            let provider = "iframe";
            if (src.includes("kodik")) provider = "Kodik";
            else if (src.includes("aniboom")) provider = "Aniboom";
            else if (src.includes("sibnet")) provider = "Sibnet";
            videos.push({ url: src, originalUrl: src, quality: provider, headers: this.headers });
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
