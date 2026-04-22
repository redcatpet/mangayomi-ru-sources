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
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animeshka.js",
    "notes": "Своя CDN: прямые mp4 через Playerjs (player = new Playerjs({file:[{title, file:'[qp]URL'}]}))."
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
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        const cards = doc.select("div.thumb-col");
        for (const c of cards) {
            const a = c.selectFirst("a[href*='/anime/']") || c.selectFirst("a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href || seen[href]) continue;
            seen[href] = true;
            const img = c.selectFirst("img");
            let imageUrl = "";
            if (img) imageUrl = this.absUrl(img.attr("data-original") || img.attr("data-src") || img.attr("src") || "");
            // Skip loading.svg placeholder
            if (imageUrl.indexOf("loading.svg") >= 0) {
                const alt = img ? (img.attr("alt") || "") : "";
                if (!alt && !img.attr("data-original")) imageUrl = "";
            }
            const nameEl = c.selectFirst("p") || a;
            const name = (nameEl.text || a.attr("title") || "").trim();
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 20 };
    }

    async getPopular(page) {
        const url = page === 1 ? `${this.source.baseUrl}/popular/` : `${this.source.baseUrl}/popular/?page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const url = page === 1 ? this.source.baseUrl + "/" : `${this.source.baseUrl}/?page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        if (!query) return await this.getPopular(page);
        // Site's search form action: /search/{query-with-+-instead-of-space}/
        const slug = encodeURIComponent(String(query).split(" ").join("+"));
        const url = `${this.source.baseUrl}/search/${slug}/`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    parsePlayerEpisodes(body) {
        // `var player = new Playerjs({id:"player", file:[{title:..,file:"[qp]URL,[qp]URL",poster:...},...]})`
        const re = /\{\s*title\s*:\s*"([^"]+)"\s*,\s*file\s*:\s*"([^"]+)"/g;
        const episodes = [];
        let m;
        while ((m = re.exec(body)) !== null) {
            episodes.push({ title: m[1], file: m[2] });
        }
        return episodes;
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const body = res.body || "";

        // Title — H1 may include "[1-24] (2019)" — strip
        let name = ((doc.selectFirst("h1") || { text: "" }).text || "").trim();
        name = name.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();

        let imageUrl = "";
        const img = doc.selectFirst("img.poster, div.thumb img, div.b-poster img");
        if (img) imageUrl = this.absUrl(img.attr("data-original") || img.attr("src") || "");
        if (!imageUrl) {
            // Try poster from player config
            const pm = body.match(/poster\s*:\s*"([^"]+)"/);
            if (pm) imageUrl = this.absUrl(pm[1]);
        }

        // Description — b-description, or span.val after title "Описание"
        let description = "";
        const descEl = doc.selectFirst("div.description, div.anime-description, div.b-anime-description");
        if (descEl) description = descEl.text.trim();
        if (!description) {
            const meta = doc.selectFirst("meta[name=description]");
            if (meta) description = (meta.attr("content") || "").trim();
        }

        // Genres via <a href="/genre/..."> on this page structure — otherwise from span.val under "Жанр:" label
        const genre = [];
        const genreLinks = doc.select("a[href*='/genre/']");
        for (const g of genreLinks) {
            const t = g.text.trim();
            if (t) genre.push(t);
        }

        // Episodes from Playerjs config
        const eps = this.parsePlayerEpisodes(body);
        const episodes = eps.map((ep, i) => ({
            name: ep.title || `Серия ${i + 1}`,
            url: ep.file,
            dateUpload: Date.now().toString(),
            scanlator: null
        })).reverse();

        return { name, imageUrl, description, genre, status: 5, episodes };
    }

    async getVideoList(url) {
        // url = "[qp]URL,[qp]URL,..." — parse into per-quality entries
        const videos = [];
        const qRe = /\[(\d+p)\]([^,]+?)(?=,\[|$)/g;
        let m;
        while ((m = qRe.exec(url)) !== null) {
            const q = m[1], u = m[2].trim();
            if (!u) continue;
            videos.push({
                url: u,
                originalUrl: u,
                quality: `Animeshka ${q}`,
                headers: { "User-Agent": AS_UA, "Referer": this.source.baseUrl + "/" }
            });
        }
        if (videos.length === 0 && url) {
            // fallback — url itself is a direct URL
            videos.push({ url, originalUrl: url, quality: "Animeshka", headers: { "User-Agent": AS_UA, "Referer": this.source.baseUrl + "/" } });
        }
        videos.sort((a, b) => {
            const qa = parseInt((a.quality.match(/(\d+)p/) || [0, 0])[1]);
            const qb = parseInt((b.quality.match(/(\d+)p/) || [0, 0])[1]);
            return qb - qa;
        });
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
