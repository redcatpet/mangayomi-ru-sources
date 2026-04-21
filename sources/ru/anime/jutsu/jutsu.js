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
    "version": "0.1.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/jutsu.js",
    "notes": "Плеер встроен напрямую в HTML — отдаёт mp4 разных качеств без внешних extractor'ов."
}];

const JUTSU_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// jut.su serves `charset=windows-1251`. The Dart http client in Mangayomi
// does not decode cp1251 reliably — high bytes come through as latin-1
// codepoints (0x80-0xFF). We reverse the mapping here: each char with
// code >= 0x80 is treated as a single cp1251 byte and remapped to the
// correct Unicode codepoint.
const JUTSU_CP1251_HIGH = [
    0x0402,0x0403,0x201A,0x0453,0x201E,0x2026,0x2020,0x2021,0x20AC,0x2030,0x0409,0x2039,0x040A,0x040C,0x040B,0x040F,
    0x0452,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x0000,0x2122,0x0459,0x203A,0x045A,0x045C,0x045B,0x045F,
    0x00A0,0x040E,0x045E,0x0408,0x00A4,0x0490,0x00A6,0x00A7,0x0401,0x00A9,0x0404,0x00AB,0x00AC,0x00AD,0x00AE,0x0407,
    0x00B0,0x00B1,0x0406,0x0456,0x0491,0x00B5,0x00B6,0x00B7,0x0451,0x2116,0x0454,0x00BB,0x0458,0x0405,0x0455,0x0457
];

function jutsuDecodeCp1251(s) {
    if (!s) return s;
    // Quick test: any char in the [0x80..0xFF] latin-1 range?
    let needsFix = false;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0x80 && c <= 0xFF) { needsFix = true; break; }
    }
    if (!needsFix) return s;

    let out = "";
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code < 0x80) {
            out += s[i];
        } else if (code <= 0xBF) {
            const cp = JUTSU_CP1251_HIGH[code - 0x80];
            out += cp ? String.fromCharCode(cp) : s[i];
        } else if (code <= 0xFF) {
            // C0..FF -> 0x0410..0x044F (А..я)
            out += String.fromCharCode(0x0410 + (code - 0xC0));
        } else {
            out += s[i];
        }
    }
    return out;
}

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
        return this.parseCatalog(jutsuDecodeCp1251(res.body));
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/anime/page-${page}/`,
            this.defaultHeaders()
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(jutsuDecodeCp1251(res.body));
    }

    async search(query, page, filters) {
        if (!query) return await this.getPopular(page);
        const res = await this.client.post(
            `${this.source.baseUrl}/anime/`,
            this.defaultHeaders(),
            { "ajax_load": "yes", "start_from_page": String(page), "show_search": query, "anime_of_user": "" }
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(jutsuDecodeCp1251(res.body));
    }

    // ---- Detail ----
    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.defaultHeaders());
        const body = jutsuDecodeCp1251(res.body);
        const doc = new Document(body);

        const nameEl = doc.selectFirst("h1.header_video") || doc.selectFirst("h1");
        const name = nameEl ? nameEl.text.trim() : "";
        let imageUrl = "";
        const poster = doc.selectFirst("span.sp_video_poster img, .poster_super img, .the_anime__image img, .the_anime img");
        if (poster) imageUrl = this.absUrl(poster.attr("src") || poster.attr("data-src") || "");

        const descEl = doc.selectFirst("div.under_video span[itemprop=description]") || doc.selectFirst("p.under_video");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/anime/genre/']").map(e => e.text.trim()).filter(x => x);

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
            episodes.push({
                name: epName,
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
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
        const body = jutsuDecodeCp1251(res.body) || "";
        const videos = [];
        // jut.su player: multiple <source src="..." label="720" res="720"> tags.
        // Attributes can appear in any order, so do two broader regex passes.
        const mp4UrlRe = /src=["']([^"']+\.mp4[^"']*)["']/gi;
        const labelLookup = (substr) => {
            const m = substr.match(/(?:label|res)=["']?(\d+)["']?/i);
            return m ? m[1] + "p" : "unknown";
        };
        // Find each <source ...> tag and extract src + label
        const tagRe = /<source\s+[^>]*?>/gi;
        const seen = {};
        let t;
        while ((t = tagRe.exec(body)) !== null) {
            const tag = t[0];
            const srcMatch = tag.match(/src=["']([^"']+)["']/i);
            if (!srcMatch) continue;
            const src = srcMatch[1];
            if (seen[src]) continue;
            seen[src] = true;
            const quality = labelLookup(tag);
            videos.push({
                url: src,
                originalUrl: src,
                quality: "Jut.su " + quality,
                headers: this.defaultHeaders()
            });
        }
        // Fallback: raw .mp4 URLs in JS
        if (videos.length === 0) {
            let m;
            while ((m = mp4UrlRe.exec(body)) !== null) {
                const src = m[1];
                if (seen[src]) continue;
                seen[src] = true;
                videos.push({
                    url: src,
                    originalUrl: src,
                    quality: "Jut.su mp4",
                    headers: this.defaultHeaders()
                });
            }
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
