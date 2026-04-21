const mangayomiSources = [{
    "name": "Sovetromantica",
    "lang": "ru",
    "baseUrl": "https://sovetromantica.com",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/sovetromantica.js",
    "notes": "Аниме с переводами команды Sovetromantica. HLS прямо на странице эпизода."
}];

const SR_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": SR_UA,
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
        const items = doc.select(".block--shadow a, .anime-card, article.anime");
        for (const it of items) {
            const a = it.tag === "a" ? it : it.selectFirst("a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href || href.indexOf("/anime/") < 0) continue;
            const img = (a.selectFirst("img") || it.selectFirst("img"));
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const nameEl = it.selectFirst(".card-title, .anime-card__title, h3") || a;
            const name = nameEl.text.trim();
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a.pagination__next, .page-link[rel=next]");
        return { list, hasNextPage: hasNextPage || list.length >= 20 };
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
            `${this.source.baseUrl}/anime?search=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1")).text.trim();
        const imgEl = doc.selectFirst(".anime-poster img, img.poster");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || "") : "";
        const descEl = doc.selectFirst(".description, div.anime-description");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/genre/']").map(e => e.text.trim());

        const episodes = [];
        const epEls = doc.select("a.anime-link[href*='/anime/'][href*='/episode/'], a[href*='/episode']");
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
        // Sovetromantica embeds HLS in inline JS: player.init({file:".m3u8"}) or similar.
        const hlsRe = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
        const seen = {};
        let m;
        while ((m = hlsRe.exec(body)) !== null) {
            const url = m[1];
            if (seen[url]) continue;
            seen[url] = true;
            videos.push({
                url: url,
                originalUrl: url,
                quality: "Sovetromantica HLS",
                headers: this.headers
            });
        }
        // Fallback: any iframe (kodik/etc.)
        if (videos.length === 0) {
            const ifRe = /<iframe[^>]+src=["']([^"']+)["']/g;
            while ((m = ifRe.exec(body)) !== null) {
                let src = m[1];
                if (src.startsWith("//")) src = "https:" + src;
                videos.push({
                    url: src,
                    originalUrl: src,
                    quality: "Sovetromantica (iframe)",
                    headers: this.headers
                });
            }
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
