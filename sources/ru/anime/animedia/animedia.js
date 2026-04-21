const mangayomiSources = [{
    "name": "Animedia",
    "lang": "ru",
    "baseUrl": "https://animedia.my",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animedia.js",
    "notes": "Ранее .tv — проверь актуальность домена. Видео через встроенный iframe плеер."
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
        const items = doc.select(".ws-list .ws-tile, .catalog-item, div.card");
        for (const it of items) {
            const a = it.selectFirst("a[href*='/anime/'], a[href*='/serial/']") || it.selectFirst("a");
            if (!a) continue;
            const href = a.attr("href");
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const name = (it.selectFirst(".ws-title, .card-title, .name, h3") || a).text.trim();
            if (!href || !name) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a.next, .page-link[rel=next]");
        return { list, hasNextPage: hasNextPage || list.length >= 20 };
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.source.baseUrl}/catalog/all?page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/catalog/all?sort=new&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/ajax/search?keyword=${encodeURIComponent(query || "")}`,
            this.headers
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
