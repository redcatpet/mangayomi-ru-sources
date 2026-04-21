const mangayomiSources = [{
    "name": "AnimeJoy",
    "lang": "ru",
    "baseUrl": "https://animejoy.ru",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animejoy.js",
    "notes": "DataLife Engine. Плееры через POST /engine/ajax/controller.php"
}];

const AJ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AJ_UA,
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
        const seen = {};

        // Current AnimeJoy template: div.story_line > a[href title] with <i.image.cover style="background-image:url(...)">
        let items = doc.select("div.story_line");
        for (const it of items) {
            const a = it.selectFirst("a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href || seen[href]) continue;
            seen[href] = true;
            const name = ((a.attr("title") || "").split("[")[0] || a.text || "").trim();
            if (!name) continue;
            // Image url in background-image style of <i class="image cover">
            let imageUrl = "";
            const img = it.selectFirst("i.image, i.cover, .image.cover");
            if (img) {
                const style = img.attr("style") || "";
                const m = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
                if (m) imageUrl = this.absUrl(m[1]);
            }
            if (!imageUrl) {
                const imgTag = it.selectFirst("img");
                if (imgTag) imageUrl = this.absUrl(imgTag.attr("src") || imgTag.attr("data-src") || "");
            }
            list.push({ name, imageUrl, link: href });
        }

        // Fallback for older template
        if (list.length === 0) {
            const oldItems = doc.select("article.block, .sect-items article, div.short");
            for (const it of oldItems) {
                const a = it.selectFirst("h2.ntitle a, h3.short-title a, a.short-poster, a.short-img");
                if (!a) continue;
                const href = a.attr("href");
                if (!href || seen[href]) continue;
                seen[href] = true;
                const img = it.selectFirst("img");
                const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
                const nameEl = it.selectFirst("h2.ntitle, h3.short-title, .short-title") || a;
                const name = nameEl.text.trim();
                if (!name) continue;
                list.push({ name, imageUrl, link: href });
            }
        }

        const hasNextPage = list.length >= 10;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const path = page === 1 ? "/" : `/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }
    async search(query, page, filters) {
        // DLE search: POST to /index.php?do=search with story=...
        const res = await this.client.post(
            `${this.source.baseUrl}/index.php?do=search`,
            { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
            { "do": "search", "subaction": "search", "story": query, "search_start": String(page) }
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const name = (doc.selectFirst("h1.ntitle, article h1")).text.trim();
        const imgEl = doc.selectFirst(".poster img, .fposter img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || "") : "";
        const descEl = doc.selectFirst("div.pdesc, .storyitem");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/anime/genre/'], a[href*='/janr/']").map(e => e.text.trim());

        // news id for episode ajax
        const newsIdEl = doc.selectFirst("[data-news-id], [id^='news-id']");
        const newsId = newsIdEl ? (newsIdEl.attr("data-news-id") || newsIdEl.attr("id").replace(/\D/g, "")) : "";
        // On AnimeJoy each tital IS itself the episode list — the "url" of each ep is same page with ?episode=N
        // For simplicity we expose one episode = full title page
        const episodes = [{
            name: "Все эпизоды",
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
        // Direct HLS
        const hlsRe = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
        const seen = {};
        let m;
        while ((m = hlsRe.exec(body)) !== null) {
            const u = m[1];
            if (seen[u]) continue;
            seen[u] = true;
            videos.push({ url: u, originalUrl: u, quality: "AnimeJoy HLS", headers: this.headers });
        }
        // MP4
        const mp4Re = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/g;
        while ((m = mp4Re.exec(body)) !== null) {
            const u = m[1];
            if (seen[u]) continue;
            seen[u] = true;
            videos.push({ url: u, originalUrl: u, quality: "AnimeJoy MP4", headers: this.headers });
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
