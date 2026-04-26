// @include: kodik_extractor

const mangayomiSources = [{
    "name": "Animesss",
    "lang": "ru",
    "baseUrl": "https://animesss.com",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animesss.js",
    "notes": "AnimeStars-движок. Все озвучки (AnimeVost, AniLibria, Dream Cast, SHIZA Project, JAM и др.) через AJAX /index.php?controller=ajax&mod=anime_grabber. Видео — Kodik HLS через extractor."
}];

const SSS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": SSS_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9",
            "Referer": this.source.baseUrl + "/"
        };
    }

    get ajaxHeaders() {
        return {
            "User-Agent": SSS_UA,
            "Accept": "text/html, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
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
        // AnimeStars template uses `a.poster.grid-item` cards
        let cards = doc.select("a.poster.grid-item");
        // Home page also has `div.movie-item > div.movie-item__inner > a.movie-item__link` (sidebar)
        if (cards.length === 0) cards = doc.select("a.movie-item__link");
        for (const a of cards) {
            const href = a.attr("href");
            if (!href || seen[href]) continue;
            seen[href] = true;
            const titleEl = a.selectFirst("h3.poster__title")
                         || a.selectFirst("div.movie-item__title")
                         || a.selectFirst(".poster__title");
            const name = (titleEl ? titleEl.text : a.attr("title") || "").trim();
            if (!name) continue;
            const img = a.selectFirst("img");
            let imageUrl = "";
            if (img) imageUrl = this.absUrl(img.attr("data-src") || img.attr("src") || "");
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 12 };
    }

    async getPopular(page) {
        const path = page === 1 ? "/" : `/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const path = page === 1 ? "/aniserials/video/" : `/aniserials/video/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        const body = `do=search&subaction=search&story=${encodeURIComponent(query || "")}&search_start=${page}`;
        const h = { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" };
        const res = await this.client.post(`${this.source.baseUrl}/`, h, body);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const detailUrl = this.absUrl(url);
        const res = await this.client.get(detailUrl, this.headers);
        const doc = new Document(res.body);

        const name = ((doc.selectFirst("h1") || { text: "" }).text || "").trim();
        let imageUrl = "";
        const img = doc.selectFirst("img.pmovie__poster, .pmovie__poster img, div.pmovie__small img, meta[property=og:image]");
        if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || img.attr("content") || "");

        const descEl = doc.selectFirst("div.pmovie__text") || doc.selectFirst("div.full-text") || doc.selectFirst("meta[name=description]");
        const description = descEl ? (descEl.text || descEl.attr("content") || "").trim() : "";
        const genre = doc.select("a[href*='/aniserials/video/'][href$='/']").map(e => e.text.trim()).filter(x => x && x.length < 30);

        // Find news_id for player AJAX
        const newsIdEl = doc.selectFirst("[data-news_id]");
        const newsId = newsIdEl ? newsIdEl.attr("data-news_id") : "";
        if (!newsId) return { name, imageUrl, description, genre, status: 5, episodes: [] };

        // Fetch player playlist HTML
        const plRes = await this.client.get(
            `${this.source.baseUrl}/index.php?controller=ajax&mod=anime_grabber&module=kodik_playlist_ajax&news_id=${newsId}&action=load_player`,
            { ...this.ajaxHeaders, "Referer": detailUrl }
        );
        if (plRes.statusCode !== 200) return { name, imageUrl, description, genre, status: 5, episodes: [] };

        // Extract translator list: <li class="b-translator__item" data-this_link="//kodikplayer.com/serial/{id}/{hash}/720p?...&only_translations={tid}">{TranslatorName}</li>
        const trRe = /<li[^>]+class="b-translator__item[^"]*"[^>]+data-this_link="([^"]+)"[^>]*>([^<]+)</g;
        const translators = [];
        let m;
        while ((m = trRe.exec(plRes.body)) !== null) {
            let link = m[1].replace(/&amp;/g, "&");
            if (link.startsWith("//")) link = "https:" + link;
            translators.push({ url: link, name: m[2].trim() });
        }
        if (!translators.length) return { name, imageUrl, description, genre, status: 5, episodes: [] };

        // Use the first translator as the canonical episode list; pack ALL translators' serial URLs per episode.
        const primary = translators[0];
        const primaryEps = await kodikFetchSerialEpisodes(this.client, primary.url, this.source.baseUrl);

        // Pre-fetch other translators' episode lists in parallel for multi-dub support
        const otherEps = await Promise.all(translators.slice(1).map(t =>
            kodikFetchSerialEpisodes(this.client, t.url, this.source.baseUrl).then(eps => ({ name: t.name, eps }))
        ));

        // Group by episode number
        const episodes = primaryEps.map(ep => {
            const tracks = [{
                translator: primary.name,
                id: ep.id,
                hash: ep.hash
            }];
            for (const other of otherEps) {
                const match = other.eps.find(e => e.episode === ep.episode);
                if (match) tracks.push({ translator: other.name, id: match.id, hash: match.hash });
            }
            const packed = tracks.map(t => `${t.id}|${t.hash}|${t.translator}`).join("\n");
            return {
                name: ep.title || `Серия ${ep.episode}`,
                url: packed,
                dateUpload: Date.now().toString(),
                scanlator: tracks.map(t => t.translator).join(", ")
            };
        }).reverse();

        return { name, imageUrl, description, genre, status: 5, episodes };
    }

    async getVideoList(url) {
        const lines = String(url || "").split("\n").filter(x => x.trim());
        const videos = [];
        for (const line of lines) {
            const parts = line.split("|");
            if (parts.length < 3) continue;
            const seriaUrl = `https://kodikplayer.com/seria/${parts[0]}/${parts[1]}/720p`;
            const labelPrefix = `Animesss · ${parts.slice(2).join("|") || "Kodik"}`;
            const vids = await kodikExtract(this.client, seriaUrl, this.source.baseUrl, labelPrefix);
            for (const v of vids) videos.push(v);
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
