const mangayomiSources = [{
    "name": "Jut.su",
    "lang": "ru",
    "baseUrl": "https://jut.su",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/jutsu.js",
    "notes": "Плеер встроен напрямую в HTML — отдаёт mp4 разных качеств без внешних extractor'ов."
}];

const JUTSU_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    defaultHeaders() {
        return {
            "User-Agent": JUTSU_UA,
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
    }

    absUrl(u) {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("/")) return this.source.baseUrl + u;
        return this.source.baseUrl + "/" + u;
    }

    // ---- Listing ----
    // Each card is `div.all_anime_global` containing a single <a href="/slug/">
    // with <div class="all_anime_image" style="background:url(https://...)">
    // and <div class="aaname">Title</div>.
    parseCatalog(htmlBody) {
        const doc = new Document(htmlBody);
        const cards = doc.select("div.all_anime_global");
        const list = [];
        const seen = {};
        for (const card of cards) {
            const a = card.selectFirst("a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href || href.length < 2) continue;
            // Exclude non-anime links (should not happen inside all_anime_global, but just in case)
            if (href === "/" || href === "/anime/" || href.indexOf("/anime/page-") === 0) continue;
            if (seen[href]) continue;
            seen[href] = true;

            const nameEl = card.selectFirst(".aaname");
            const name = (nameEl ? nameEl.text : (a.attr("title") || "")).trim();
            if (!name) continue;

            let imageUrl = "";
            const imgDiv = card.selectFirst(".all_anime_image");
            if (imgDiv) {
                const style = imgDiv.attr("style") || "";
                const m = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
                if (m) imageUrl = m[1];
            }

            list.push({ name: name, imageUrl: imageUrl, link: href });
        }
        const pagNext = doc.selectFirst("a.page_switch_next");
        const hasNextPage = pagNext !== null || list.length >= 20;
        return { list: list, hasNextPage: hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/anime/sort/rate/page-${page}/`,
            this.defaultHeaders()
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/anime/page-${page}/`,
            this.defaultHeaders()
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        // Site search is POST-only through its form. Simplest reliable fallback:
        // pull the full catalog page and filter client-side by substring.
        if (!query) return await this.getPopular(page);
        const res = await this.client.post(
            `${this.source.baseUrl}/anime/`,
            this.defaultHeaders(),
            { "ajax_load": "yes", "start_from_page": String(page), "show_search": query, "anime_of_user": "" }
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    // ---- Detail ----
    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.defaultHeaders());
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1.header_video") || doc.selectFirst("h1")).text.trim();
        let imageUrl = "";
        const poster = doc.selectFirst("span.sp_video_poster img, .poster_super img, .the_anime__image img");
        if (poster) imageUrl = this.absUrl(poster.attr("src") || poster.attr("data-src") || "");

        const description = (doc.selectFirst("div.under_video span[itemprop=description]") || doc.selectFirst("p.under_video")).text.trim();
        const genre = doc.select("a[href*='/anime/genre/']").map(e => e.text.trim());

        // Episodes — links to /anime/slug/season-X/episode-Y.html or /film-Y.html
        const episodes = [];
        const epEls = doc.select("a.short-btn.video.the-anime-season, a.short-btn.video");
        for (const e of epEls) {
            const href = e.attr("href");
            if (!href) continue;
            if (href.indexOf("/episode") < 0 && href.indexOf("/film") < 0) continue;
            let epName = e.text.trim();
            if (!epName) {
                const m = href.match(/episode-(\d+)/);
                if (m) epName = "Серия " + m[1];
            }
            episodes.push({ name: epName, url: href });
        }
        episodes.reverse();

        return {
            name: name,
            imageUrl: imageUrl,
            description: description,
            genre: genre,
            status: 5,
            episodes: episodes
        };
    }

    // ---- Video list ----
    async getVideoList(url) {
        const res = await this.client.get(this.absUrl(url), this.defaultHeaders());
        const body = res.body;
        // Sources are rendered inside <video ...><source src="..." label="720" res="720" ...>
        // Multiple qualities, absolute URLs under vdn.jut.su or cdn.jut.su.
        const videos = [];
        const sourceRe = /<source\s+[^>]*?src=["']([^"']+\.mp4[^"']*)["'][^>]*?(?:label|res)=["'](\d+)["'][^>]*?>/gi;
        let m;
        while ((m = sourceRe.exec(body)) !== null) {
            const videoUrl = m[1];
            const quality = m[2] + "p";
            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: "Jut.su " + quality,
                headers: this.defaultHeaders()
            });
        }
        // Sort by quality desc
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
