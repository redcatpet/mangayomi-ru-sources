// @include: kodik_extractor

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
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animedia.js",
    "notes": "animedia.tv/.my умерли — актуальный домен amd.online. Плеер — Kodik iframe (серийный); Kodik-extractor достаёт прямой HLS."
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
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        const cards = doc.select("div.animefilm, a.poster__link, div.poster");
        for (const card of cards) {
            const a = card.tagName === "a" ? card : (card.selectFirst("a.poster__link") || card.selectFirst("a[href*='.html']"));
            if (!a) continue;
            const href = a.attr("href");
            if (!href || !href.endsWith(".html")) continue;
            if (seen[href]) continue;
            seen[href] = true;
            const img = card.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            const nameEl = card.selectFirst(".poster__title") || card.selectFirst("h3") || card.selectFirst("h2") || a;
            const name = (nameEl.text || a.attr("title") || "").trim();
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 10 };
    }

    async getPopular(page) {
        const path = page === 1 ? "/ongoingi/" : `/ongoingi/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) { return await this.getPopular(page); }

    async search(query, page, filters) {
        // DLE search — POST index.php?do=search
        const body = `do=search&subaction=search&story=${encodeURIComponent(query || "")}`;
        const h = { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" };
        const res = await this.client.post(`${this.source.baseUrl}/index.php?do=search`, h, body);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const full = this.absUrl(url);
        const res = await this.client.get(full, this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1") || { text: "" }).text.trim();
        let imageUrl = "";
        const img = doc.selectFirst("img.poster__img, .poster img, div.hero img");
        if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
        if (!imageUrl) {
            const og = doc.selectFirst("meta[property=og:image]");
            if (og) imageUrl = og.attr("content") || "";
        }
        const descEl = doc.selectFirst("div.description, div.ws-description");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/catalog/genre/'], a[href*='/ghanr/']").map(e => e.text.trim()).filter(x => x);

        // Animedia embeds a Kodik serial iframe that plays all episodes internally.
        // Expose the page as ONE "episode" — Kodik handles the sub-navigation.
        const episodes = [{
            name: "Плеер (все серии)",
            url: full,
            dateUpload: Date.now().toString(),
            scanlator: null
        }];

        return { name, imageUrl, description, genre, status: 5, episodes };
    }

    async getVideoList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return [];
        const body = res.body || "";
        const videos = [];

        // 1. Kodik iframes → extract HLS
        const kodikRe = /["'](\/\/kodikplayer\.com\/[^"']+)["']/g;
        const seenKodik = {};
        let m;
        while ((m = kodikRe.exec(body)) !== null) {
            const url = m[1];
            if (seenKodik[url]) continue;
            seenKodik[url] = true;
            const kodikVids = await kodikExtract(this.client, url, this.source.baseUrl, "Animedia · Kodik");
            for (const v of kodikVids) videos.push(v);
        }

        // 2. Other iframes (aser.pro, etc.) as fallback — keep as-is for Mangayomi's iframe handler
        const otherIframeRe = /<iframe[^>]+(?:data-src|src)="([^"]+)"/g;
        const seen = {};
        while ((m = otherIframeRe.exec(body)) !== null) {
            let src = m[1];
            if (src.indexOf("kodikplayer") >= 0) continue; // already handled
            if (src.startsWith("//")) src = "https:" + src;
            if (!src.startsWith("http")) continue;
            if (seen[src]) continue;
            seen[src] = true;
            let label = "iframe";
            if (src.indexOf("aser.pro") >= 0) label = "Aser";
            else if (src.indexOf("sibnet") >= 0) label = "Sibnet";
            else if (src.indexOf("aniboom") >= 0) label = "Aniboom";
            videos.push({
                url: src,
                originalUrl: src,
                quality: `Animedia · ${label}`,
                headers: { "User-Agent": AD_UA, "Referer": this.source.baseUrl + "/" }
            });
        }

        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
