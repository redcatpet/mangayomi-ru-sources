// @include: kodik_extractor

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
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animejoy.js",
    "notes": "DLE-движок. Плейлист через /engine/ajax/playlists.php?news_id=X&xfield=playlist. Своя CDN выдаёт прямые mp4 (1080/720/360); доп. опции — Kodik serial iframe."
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
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9",
            "Referer": this.source.baseUrl + "/"
        };
    }

    get ajaxHeaders() {
        return {
            "User-Agent": AJ_UA,
            "Accept": "application/json, text/javascript, */*; q=0.01",
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
        // Real catalog cards: <article class="block story shortstory">.
        // div.story_line is the homepage carousel only (≤6 items + Telegram bot tile).
        let items = doc.select("article.block.story");
        if (items.length === 0) items = doc.select("article.shortstory");
        if (items.length === 0) items = doc.select("article.story");
        if (items.length === 0) items = doc.select("div.story_line"); // legacy fallback
        for (const it of items) {
            const titleA = it.selectFirst("h2.ntitle a") || it.selectFirst("h3.ntitle a") || it.selectFirst("a");
            if (!titleA) continue;
            const href = titleA.attr("href");
            if (!href || seen[href]) continue;
            // Skip Telegram-bot tile / external URLs
            if (href.indexOf("animejoy.ru") < 0 || href.indexOf("/t.me/") >= 0 || href.indexOf("telegram") >= 0) continue;
            seen[href] = true;
            const rawName = (titleA.text || titleA.attr("title") || "").trim();
            // Trim "[03 из 12]" episode-count suffix
            const name = rawName.replace(/\s*\[[^\]]+\]\s*$/g, "").trim();
            if (!name) continue;
            let imageUrl = "";
            const imgTag = it.selectFirst("picture img") || it.selectFirst("img");
            if (imgTag) {
                imageUrl = imgTag.attr("src") || imgTag.attr("data-src") || "";
                imageUrl = this.absUrl(imageUrl);
            }
            if (!imageUrl) {
                const i = it.selectFirst("i.image.cover, i.image, i.cover");
                if (i) {
                    const style = i.attr("style") || "";
                    const m = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
                    if (m) imageUrl = this.absUrl(m[1]);
                }
            }
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 10 };
    }

    async getPopular(page) {
        const path = page === 1 ? "/" : `/page/${page}/`;
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) { return await this.getPopular(page); }

    async search(query, page, filters) {
        const body = `do=search&subaction=search&story=${encodeURIComponent(query || "")}&search_start=${page}`;
        const h = { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" };
        const res = await this.client.post(`${this.source.baseUrl}/index.php?do=search`, h, body);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    newsIdFromPage(doc, body) {
        const el = doc.selectFirst(".playlists-ajax[data-news_id]");
        if (el) return el.attr("data-news_id");
        const m = (body || "").match(/data-news_id="(\d+)"/);
        return m ? m[1] : "";
    }

    // Parse the playlists.php JSON.response HTML into provider index -> [{episode, url}...]
    parsePlaylists(responseHtml) {
        // Providers (0_0, 0_1, 0_2...) with name
        const providers = {};
        const provRe = /<li[^>]*data-id="(\d+)_(\d+)"[^>]*>([^<]+)<\/li>/g;
        const videoRe = /<li[^>]*data-file="([^"]+)"[^>]*data-id="(\d+)_(\d+)"[^>]*>([^<]*)<\/li>/g;

        // First pass: providers list
        // The HTML has two sections — we can distinguish by whether the <li> has data-file.
        let m;
        const plain = responseHtml.replace(/&amp;/g, "&");
        // Extract provider labels from playlists-items that DON'T have data-file
        // Our regex provRe matches any li with data-id but excluding data-file could be tricky —
        // instead, the first 10-20 <li data-id="0_N"> with no data-file are providers.
        const liRe = /<li\b([^>]*)>([^<]*)<\/li>/g;
        let li;
        while ((li = liRe.exec(plain)) !== null) {
            const attrs = li[1];
            const text = li[2];
            const idMatch = attrs.match(/data-id="(\d+)_(\d+)"/);
            if (!idMatch) continue;
            const fileMatch = attrs.match(/data-file="([^"]+)"/);
            if (fileMatch) continue; // episode, skip in this pass
            providers[`${idMatch[1]}_${idMatch[2]}`] = text.trim();
        }

        // Second pass: collect episodes
        const episodes = {}; // episodeNumber -> [ { provider, url, title } ]
        liRe.lastIndex = 0;
        while ((li = liRe.exec(plain)) !== null) {
            const attrs = li[1];
            const text = li[2];
            const idMatch = attrs.match(/data-id="(\d+)_(\d+)"/);
            const fileMatch = attrs.match(/data-file="([^"]+)"/);
            if (!idMatch || !fileMatch) continue;
            const providerKey = `${idMatch[1]}_${idMatch[2]}`;
            const providerName = providers[providerKey];
            // Skip the provider-level row (0_N with ~ text or empty)
            // — but we just want episodes. In animejoy's structure, "0_0" provider
            // row contains a SINGLE <li data-file="kodik serial URL">~</li> that represents
            // the whole season. For Kodik we expose it as a virtual "All episodes via Kodik" entry.
            // For "0_1" (naш плеер) each li is a real episode.
            const epLabel = text.trim() || `Серия ${idMatch[2]}`;
            const key = epLabel;
            if (!episodes[key]) episodes[key] = [];
            episodes[key].push({
                providerName: providerName || "?",
                url: fileMatch[1],
                epLabel
            });
        }
        return { providers, episodes };
    }

    async getDetail(url) {
        const detailUrl = this.absUrl(url);
        const res = await this.client.get(detailUrl, this.headers);
        const doc = new Document(res.body);
        const name = ((doc.selectFirst("h1.ntitle") || doc.selectFirst("article h1") || doc.selectFirst("h1") || { text: "" }).text || "").trim();
        let imageUrl = "";
        const img = doc.selectFirst(".poster img, .fposter img, article img");
        if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
        if (!imageUrl) {
            const og = doc.selectFirst("meta[property=og:image]");
            if (og) imageUrl = og.attr("content") || "";
        }
        const descEl = doc.selectFirst("div.pdesc, .storyitem");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[href*='/anime/genre/'], a[href*='/janr/']").map(e => e.text.trim()).filter(x => x);

        const newsId = this.newsIdFromPage(doc, res.body);
        const episodes = [];
        if (newsId) {
            const ajRes = await this.client.get(
                `${this.source.baseUrl}/engine/ajax/playlists.php?news_id=${newsId}&xfield=playlist`,
                this.ajaxHeaders
            );
            if (ajRes.statusCode === 200 && ajRes.body) {
                try {
                    const parsed = JSON.parse(ajRes.body);
                    const html = parsed.response || "";
                    const pl = this.parsePlaylists(html);

                    // Build episodes — one per unique epLabel, packing ALL provider URLs
                    for (const label of Object.keys(pl.episodes)) {
                        const providers = pl.episodes[label];
                        // Skip "~" placeholders (Kodik provider)
                        const hasRealEpisode = providers.some(p => label !== "~");
                        if (!hasRealEpisode) continue;
                        const packed = providers.map(p => `${p.providerName}||${p.url}`).join("\n");
                        episodes.push({
                            name: label,
                            url: packed,
                            dateUpload: Date.now().toString(),
                            scanlator: null
                        });
                    }
                    episodes.reverse();
                } catch (e) { /* ignore */ }
            }
        }

        if (!episodes.length) {
            episodes.push({
                name: "Все эпизоды",
                url: detailUrl,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description, genre, status: 5, episodes };
    }

    async getVideoList(url) {
        const lines = String(url || "").split("\n").filter(x => x.trim());
        const videos = [];
        for (const line of lines) {
            const idx = line.indexOf("||");
            if (idx < 0) continue;
            const providerName = line.substring(0, idx);
            const fileUrl = line.substring(idx + 2);
            if (!fileUrl) continue;

            // Kodik iframe
            if (fileUrl.indexOf("kodikplayer") >= 0) {
                const kv = await kodikExtract(this.client, fileUrl, this.source.baseUrl, `AnimeJoy · ${providerName}`);
                for (const v of kv) videos.push(v);
                continue;
            }

            // playerjs format: //animejoya.ru/player/playerjs.html?skip=...&file=[1080p]url,[720p]url,[360p]url
            if (fileUrl.indexOf("playerjs") >= 0 || fileUrl.indexOf("file=[") >= 0) {
                const fileMatch = fileUrl.match(/file=([^&]+)/);
                const raw = fileMatch ? decodeURIComponent(fileMatch[1]) : "";
                const qRe = /\[(\d+p)\]([^,]+)/g;
                let mq;
                while ((mq = qRe.exec(raw)) !== null) {
                    const q = mq[1], u = mq[2].trim();
                    if (!u) continue;
                    videos.push({
                        url: u, originalUrl: u,
                        quality: `AnimeJoy · ${providerName} ${q}`,
                        headers: { "User-Agent": AJ_UA, "Referer": this.source.baseUrl + "/" }
                    });
                }
                continue;
            }

            // Sibnet/VK/Dzen/OK/Mail — plain iframes
            let src = fileUrl;
            if (src.startsWith("//")) src = "https:" + src;
            videos.push({
                url: src, originalUrl: src,
                quality: `AnimeJoy · ${providerName}`,
                headers: { "User-Agent": AJ_UA, "Referer": this.source.baseUrl + "/" }
            });
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
