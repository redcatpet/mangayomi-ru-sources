const mangayomiSources = [{
    "name": "RanobeHub",
    "lang": "ru",
    "baseUrl": "https://ranobehub.org",
    "apiUrl": "https://ranobehub.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.5.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranobehub.js",
    "notes": "Публичный JSON API для каталога + HTML-страница главы (div[data-container]). Главы не через API — REST-эндпойнт /chapters/{id} возвращает 404."
}];

const RH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": RH_UA,
            "Accept": "application/json, text/html,*/*",
            "Referer": this.source.baseUrl + "/"
        };
    }

    extractSlug(item) {
        if (item.url) {
            const m = item.url.match(/\/ranobe\/([\w\-]+)/);
            if (m) return m[1];
        }
        return String(item.id);
    }

    parseList(body) {
        const j = JSON.parse(body);
        const list = (j.resource || j.data || []).map(r => ({
            name: (r.names && (r.names.rus || r.names.eng)) || r.name || "",
            imageUrl: (r.poster && (r.poster.medium || r.poster.small)) || "",
            link: this.extractSlug(r)
        }));
        const pag = j.meta && j.meta.pagination;
        const hasNextPage = pag ? pag.current_page < pag.total_pages : list.length >= 20;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search?page=${page}&sort=computed_rating&order=desc`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.apiUrl}/search?page=${page}&sort=last_chapter_at&order=desc`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }
    async search(query, page, filters) {
        const q = (query || "").trim();
        if (!q) {
            // Empty query — fall back to popular catalog (covers Mangayomi's
            // "Recommendations" feature when called with empty query).
            return await this.getPopular(page);
        }
        // /api/search?query=... is a paginated catalog that ignores the query.
        // Real fulltext search is /api/fulltext/global?query=...&take=N — used by the
        // website's search box (route name "api.fulltext.search" in build.js).
        // Response is `[{meta: {key, title}, data: [...]}]` — pull the "ranobe" group.
        const url = `${this.source.baseUrl}/api/fulltext/global?query=${encodeURIComponent(q)}&take=30`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        let groups;
        try { groups = JSON.parse(res.body); } catch (e) { return { list: [], hasNextPage: false }; }
        const ranobeGroup = (Array.isArray(groups) ? groups : []).find(g => g && g.meta && g.meta.key === "ranobe");
        const items = (ranobeGroup && ranobeGroup.data) || [];
        const list = items.map(r => ({
            name: (r.names && (r.names.rus || r.names.eng || r.names.original)) || r.name || "",
            // Detail-page covers come from /api/ranobe/{id} — list items don't carry posters.
            imageUrl: (r.poster && (r.poster.medium || r.poster.small)) || (r.posters && (r.posters.medium || r.posters.small)) || "",
            link: this.extractSlug(r)
        })).filter(x => x.name && x.link);
        return { list, hasNextPage: false };
    }

    async getDetail(slug) {
        const idMatch = String(slug).match(/^(\d+)/);
        const ranobeId = idMatch ? idMatch[1] : slug;

        const infoRes = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}`, this.headers);
        const chRes = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}/contents`, this.headers);

        if (infoRes.statusCode !== 200) {
            return { name: String(slug), imageUrl: "", description: "(Ошибка)", status: 5, genre: [], chapters: [] };
        }
        const info = (JSON.parse(infoRes.body).data) || {};
        const contents = chRes.statusCode === 200 ? (JSON.parse(chRes.body).volumes || []) : [];

        const statusMap = { "В процессе": 0, "Завершено": 1, "Заморожен": 2, "Заброшен": 3 };
        const statusKey = (info.status && info.status.title) || "";
        const mapped = statusMap[statusKey];
        const status = mapped == null ? 5 : mapped;

        // Authors carry name_rus/name_eng; translators carry name. Combine both as "Author / tr. Translator".
        // Computed before the chapter loop so the first translator can be used as scanlator.
        const authorList = (info.authors || []).map(a => a.name_rus || a.name_eng || a.name).filter(x => x);
        const translatorList = (info.translators || []).map(t => t.name_rus || t.name_eng || t.name).filter(x => x);
        const authorStr = authorList.join(", ") + (translatorList.length ? ` (пер. ${translatorList.join(", ")})` : "");
        const chScanlator = translatorList[0] || "RanobeHub";

        // Build chapters. Mangayomi's chapter-recognition regex (lib/utils/chapter_recognition.dart)
        // is ASCII-only — for Cyrillic-only names it extracts the FIRST integer in the string.
        // Pre-v0.5.0 names started with "Том {volNum}" so vol 1's 12 chapters all parsed as "1",
        // vol 2's 28 chapters all parsed as "2", etc., colliding 20 ways for Solo Leveling.
        // Solution: prefix every name with a globally-unique integer "Гл. {N}." before "Том X".
        // dateUpload is forced to integer-millis (defends against int.parse crash in sortChapter==2).
        // scanlator is set to a non-null string (defends against filter chain edge cases).
        const chapters = [];
        for (const vol of contents) {
            const vNum = vol.num != null ? vol.num : 1;
            const volChapters = vol.chapters || [];
            for (let i = 0; i < volChapters.length; i++) {
                const ch = volChapters[i];
                const cNumApi = ch.num != null ? ch.num : "?";
                const seqInVol = i + 1;
                // Synthetic clean URL — every URL ends with chapter id (always integer).
                // Rationale: pre-v0.5.1 we used the canonical `/ranobe/{id}/{vol}/{num}` URL,
                // but for Solo Leveling that gave 398/457 paths ending in floats like
                // `/6/1.01`. Some HTTP/URI parsing layers in the iOS Mangayomi runtime
                // treat the dot+digits as a file extension and reject the URL. With the
                // synthetic `/_ch/{id}` form, every URL is a clean integer suffix, and
                // resolveStaleChapterUrl maps it to the real URL via the contents API
                // before fetching.
                // Synthetic URL `/_ch/{ranobeId}/{chapterId}` — both integers, no floats,
                // self-contained for the rescue.
                const chUrl = ch.id
                    ? `${this.source.baseUrl}/_ch/${ranobeId}/${ch.id}`
                    : (ch.url || `${this.source.baseUrl}/ranobe/${ranobeId}/${vNum}/${cNumApi}`);
                const tsRaw = ch.changed_at;
                let tsMs;
                if (tsRaw) {
                    const n = +tsRaw;
                    tsMs = isNaN(n) ? new Date(tsRaw).valueOf() : Math.floor(n) * 1000;
                }
                const dateUpload = (Number.isFinite(tsMs) ? tsMs : Date.now()).toString();
                const rawName = (ch.name || "").trim();
                const globalSeq = chapters.length + 1;
                // Latin "Ch." prefix first: Mangayomi's chapter-recognition regex
                // (lib/utils/chapter_recognition.dart) is `[0-9]+(\.[0-9]+)?(\.?[a-z]+)?`
                // on lowercased input. ASCII letters give the parser a clean first match
                // before the Cyrillic suffix.
                let chName = "Ch. " + globalSeq;
                if (vol.num) chName += " · Том " + vNum;
                chName += " · Глава " + seqInVol;
                if (rawName) chName += ": " + rawName;
                chapters.push({
                    name: chName,
                    url: String(chUrl),
                    dateUpload: dateUpload,
                    scanlator: chScanlator
                });
            }
        }

        // Tags are { events, genres } where each item has { title, names: { rus, eng } }.
        const tagItems = [].concat((info.tags && info.tags.genres) || [], (info.tags && info.tags.events) || []);
        const genre = tagItems.map(t => t.title || (t.names && (t.names.rus || t.names.eng)) || "").filter(x => x);

        // info.description is HTML markup (`<p>…</p><p>…</p>`); strip tags to plain text
        // and fall back to synopsis (already plain but truncated with "…").
        const descRaw = info.description || info.synopsis || "";
        const description = descRaw
            .replace(/<\/p>\s*<p>/gi, "\n\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();

        return {
            name: (info.names && (info.names.rus || info.names.eng)) || info.name || String(slug),
            imageUrl: (info.posters && (info.posters.medium || info.posters.big || info.posters.small)) || "",
            description: description,
            author: authorStr,
            genre: genre,
            status: status,
            // Insertion order = oldest first (vol 1 ch 1 → vol 20 ch N).
            // Mangayomi's _filterAndSortChapter handles its own reverse via sortChapter==1,
            // so we should NOT pre-reverse — doubling up confuses the global "Гл. N" sequence.
            chapters: chapters
        };
    }

    async resolveChapterIdToUrl(chapterId) {
        // Walk every ranobe's contents until we find the chapter — only used as a last
        // resort when the synthetic `_ch/{id}` URL doesn't carry the parent ranobeId.
        // In practice the synthetic URL always knows ranobeId (we route through the
        // narrower lookup below). This generic walk would be expensive; we skip it.
        return null;
    }

    async resolveChapterViaContents(ranobeId, chapterId) {
        try {
            const res = await this.client.get(`${this.source.apiUrl}/ranobe/${ranobeId}/contents`, this.headers);
            if (res.statusCode !== 200) return null;
            const data = JSON.parse(res.body);
            for (const vol of (data.volumes || [])) {
                for (const ch of (vol.chapters || [])) {
                    if (String(ch.id) === String(chapterId) && ch.url) return ch.url;
                }
            }
        } catch (e) {}
        return null;
    }

    async resolveStaleChapterUrl(url) {
        if (!url || !url.match) return url;

        // v0.5.1+ synthetic clean URLs: `${baseUrl}/_ch/{chapterId}`. Look up the real
        // URL via any title's contents — but to avoid scanning every ranobe we also
        // need the parent ranobeId. The synthetic URL alone has only the chapterId,
        // so we widen the format to `/_ch/{ranobeId}/{chapterId}` if both are known
        // (set in getDetail when ch.id is present). Fallback: pass through.
        const synth = url.match(/\/_ch\/(\d+)\/(\d+)$/) || url.match(/\/_ch\/(\d+)$/);
        if (synth && synth.length === 3) {
            const resolved = await this.resolveChapterViaContents(synth[1], synth[2]);
            if (resolved) return resolved;
        }

        // Pre-v0.3 layout: `${apiUrl}/ranobe/{ranobeId}/chapters/{chapterId}` (now 404).
        const legacy = url.match(/\/api\/ranobe\/(\d+)\/chapters\/(\d+)/);
        if (legacy) {
            const resolved = await this.resolveChapterViaContents(legacy[1], legacy[2]);
            if (resolved) return resolved;
            return url;
        }

        // Strip historical `?cid=` query (v0.3.8 / v0.4.0 disambiguator).
        return url.replace(/[?&]cid=\d+/, "");
    }

    async getHtmlContent(name, url) {
        url = await this.resolveStaleChapterUrl(url);
        // Object.assign instead of spread — flutter_qjs supports both, but spread on
        // a getter property has burned us before, and explicit copy is unambiguous.
        const headers = Object.assign({}, this.headers, {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        });
        const res = await this.client.get(url, headers);
        if (res.statusCode !== 200) {
            return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}. URL: ${url}</p>`;
        }
        const body = res.body || "";

        // Chapter body lives inside `<div class="ui text container" data-container="{chapterId}">`
        const startRe = /<div[^>]+class="ui text container[^"]*"[^>]+data-container="[^"]+"[^>]*>/;
        const m = body.match(startRe);
        let html = "";
        if (m) {
            const from = m.index + m[0].length;
            // Greedy-enough end: find next chapter-footer or chapter-comments
            const rest = body.substring(from);
            const endMarkers = ["chapter-footer", "chapter-comments", "<footer", "app-clap-button"];
            let end = rest.length;
            for (const e of endMarkers) {
                const i = rest.indexOf(e);
                if (i >= 0 && i < end) end = i;
            }
            // Back up to closest preceding </div>
            const chunk = rest.substring(0, end);
            const lastDivClose = chunk.lastIndexOf("</div>");
            html = lastDivClose > 0 ? chunk.substring(0, lastDivClose) : chunk;
        }
        // Fallback: concat all <p>...</p> blocks
        if (!html) {
            const paras = body.match(/<p>[\s\S]*?<\/p>/g) || [];
            html = paras.join("\n");
        }
        // Strip header widgets (book thumbnail/title/divider, rating/comment hoticons,
        // chapter title-wrapper) and ads/scripts so only the prologue text remains.
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                   .replace(/<ins[\s\S]*?<\/ins>/gi, "")
                   .replace(/<div[^>]*class="[^"]*tablet or lower hidden[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "")
                   .replace(/<div[^>]*class="[^"]*chapter-hoticons[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "")
                   .replace(/<div[^>]*class="[^"]*title-wrapper[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                   .replace(/<div[^>]*class="[^"]*ads[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                   .replace(/<div[^>]*id="[^"]*y251595[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
        if (!html.trim()) return `<h2>${name || ""}</h2><p>(Не удалось извлечь текст главы)</p>`;
        return `<h2>${name || ""}</h2><hr>${html}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    async cleanHtmlContent(html) {
        return (html || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
