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
    "version": "0.3.0",
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

        const body = res.body || "";
        // Find ALL Kodik serial URLs on the page (each typically = one translation/dub)
        const re = /\/\/kodikplayer\.com\/(serial|seria)\/(\d+)\/([a-f0-9]+)(?:\/\d+p)?/g;
        const serialMatches = [];
        const seen = {};
        let mm;
        while ((mm = re.exec(body)) !== null) {
            const key = `${mm[1]}|${mm[2]}|${mm[3]}`;
            if (seen[key]) continue;
            seen[key] = true;
            serialMatches.push({ type: mm[1], id: mm[2], hash: mm[3] });
        }

        const episodes = [];
        if (serialMatches.length && serialMatches[0].type === "serial") {
            // Enumerate inner episodes of the first serial iframe
            const primary = serialMatches[0];
            const serialUrl = `https://kodikplayer.com/serial/${primary.id}/${primary.hash}/720p`;
            const eps = await kodikFetchSerialEpisodes(this.client, serialUrl, this.source.baseUrl);
            for (const ep of eps) {
                // Pack playable (id|hash|label) per episode
                episodes.push({
                    name: ep.title,
                    url: `${ep.id}|${ep.hash}|Animedia · Kodik`,
                    dateUpload: Date.now().toString(),
                    scanlator: null
                });
            }
            episodes.reverse();
        }
        // Fallback — treat page as single-episode source
        if (!episodes.length) {
            episodes.push({
                name: "Плеер (все серии)",
                url: full,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description, genre, status: 5, episodes };
    }

    async getVideoList(url) {
        // Per-episode packed URL: "id|hash|label"
        const parts = String(url).split("|");
        if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
            const seriaUrl = `https://kodikplayer.com/seria/${parts[0]}/${parts[1]}/720p`;
            return await kodikExtract(this.client, seriaUrl, this.source.baseUrl, parts[2] || "Animedia · Kodik");
        }

        // Fallback: page URL — extract all Kodik iframes + secondary providers
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return [];
        const body = res.body || "";
        const videos = [];

        const kodikRe = /["'](\/\/kodikplayer\.com\/[^"']+)["']/g;
        const seenKodik = {};
        let m;
        while ((m = kodikRe.exec(body)) !== null) {
            const u = m[1];
            if (seenKodik[u]) continue;
            seenKodik[u] = true;
            const vids = await kodikExtract(this.client, u, this.source.baseUrl, "Animedia · Kodik");
            for (const v of vids) videos.push(v);
        }

        const otherIframeRe = /<iframe[^>]+(?:data-src|src)="([^"]+)"/g;
        const seen = {};
        while ((m = otherIframeRe.exec(body)) !== null) {
            let src = m[1];
            if (src.indexOf("kodikplayer") >= 0) continue;
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
