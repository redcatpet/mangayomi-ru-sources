const mangayomiSources = [{
    "name": "MangaBuff",
    "lang": "ru",
    "baseUrl": "https://mangabuff.ru",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.2.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/mangabuff.js",
    "notes": "Верифицировано через Aidoku extension (Skittyblock/aidoku-community-sources)."
}];

const MB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": MB_UA,
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

    extractStyleBg(style) {
        if (!style) return "";
        const m = style.match(/background-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/);
        return m ? m[1] : "";
    }

    parseCatalog(htmlBody) {
        const doc = new Document(htmlBody);
        const list = [];
        const seen = {};
        // Grids use div.cards containing a.cards__item; skip "cloned" duplicates
        const cards = doc.select("div.cards a.cards__item");
        for (const card of cards) {
            const cls = card.attr("class") || "";
            if (cls.indexOf("cloned") >= 0) continue;
            const href = card.attr("href");
            if (!href || seen[href]) continue;
            seen[href] = true;
            const imgDiv = card.selectFirst("div.cards__img");
            let imageUrl = "";
            if (imgDiv) {
                imageUrl = this.absUrl(this.extractStyleBg(imgDiv.attr("style") || ""));
            }
            if (!imageUrl) {
                const img = card.selectFirst("img");
                if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
            }
            const nameEl = card.selectFirst("div.cards__name");
            const name = nameEl ? nameEl.text.trim() : (card.attr("title") || "").trim();
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = list.length >= 10;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        // Homepage covers most popular when no filter
        const url = page === 1
            ? this.source.baseUrl + "/"
            : `${this.source.baseUrl}/manga?sort=rating&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/manga?sort=last_updated&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/search?query=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    statusFromText(text) {
        if (!text) return 5;
        const t = text.trim();
        if (t === "Онгоинг") return 0;
        if (t === "Завершен" || t === "Завершён") return 1;
        if (t === "Заморожен" || t === "Приостановлен") return 2;
        if (t === "Брошено") return 3;
        return 5;
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        // Title + cover from og:* meta tags (reliable fallback)
        const ogImg = doc.selectFirst("meta[property=og:image]");
        const cover = ogImg ? this.absUrl(ogImg.attr("content") || "") : "";
        const ogTitle = doc.selectFirst("meta[property=og:title]");

        const nameEl = doc.selectFirst("h1.manga__name");
        const name = (nameEl ? nameEl.text : (ogTitle ? ogTitle.attr("content") : "") || "").trim();

        const descEl = doc.selectFirst("div.tabs__content div.tabs__page[data-page=info] div.manga__description")
                    || doc.selectFirst("div.manga__description");
        const description = descEl ? descEl.text.trim() : "";

        const tagsEl = doc.selectFirst("div.tags");
        const genre = tagsEl
            ? tagsEl.select("a").map(e => e.text.trim()).filter(x => x)
            : doc.select("a.tags__item").map(e => e.text.trim());

        // Status from info row — try several locations.
        // Dart's html package implements CSS3 selectors and does not support :contains(),
        // so we iterate rows and match by label text.
        let statusText = "";
        const rows = doc.select("div.info-list__row");
        for (const row of rows) {
            const labelEl = row.selectFirst(".info-list__label, dt");
            const label = labelEl ? labelEl.text : row.text;
            if (label && label.indexOf("Статус") >= 0) {
                const valEl = row.selectFirst("div.info-list__value, dd");
                if (valEl) statusText = valEl.text.trim();
                break;
            }
        }
        if (!statusText) {
            const fallback = doc.selectFirst("span.manga__status");
            if (fallback) statusText = fallback.text.trim();
        }
        const status = this.statusFromText(statusText);

        const chapters = [];
        const chapterEls = doc.select(
            "div.tabs__content div.tabs__page[data-page=chapters] div.chapters div.chapters__list a.chapters__item"
        );
        let fallback = [];
        if (chapterEls.length === 0) {
            fallback = doc.select("a.chapters__item, div.chapters a[href*='/manga/']");
        }
        const chapEls = chapterEls.length ? chapterEls : fallback;
        for (let i = 0; i < chapEls.length; i++) {
            const ch = chapEls[i];
            const href = ch.attr("href");
            if (!href) continue;
            const nameText = (ch.selectFirst("div.chapters__name") || { text: "" }).text.trim()
                          || (ch.selectFirst("div.chapters__value span") || { text: "" }).text.trim()
                          || `Глава ${i + 1}`;
            const dateRaw = ch.attr("data-chapter-date") || "";
            let dateMs = Date.now();
            const dm = dateRaw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
            if (dm) {
                let y = parseInt(dm[3]);
                if (y < 100) y += 2000;
                dateMs = new Date(y, parseInt(dm[2]) - 1, parseInt(dm[1])).getTime();
            }
            chapters.push({
                name: nameText,
                // ?style=list preloads all images for the reader
                url: href + (href.indexOf("?") >= 0 ? "&" : "?") + "style=list",
                dateUpload: String(dateMs),
                scanlator: null
            });
        }

        return { name, imageUrl: cover, description, genre, status, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const pagesMap = {};
        const items = doc.select("div.reader__pages div.reader__item, div.reader__item");
        for (const item of items) {
            const pageNum = parseInt(item.attr("data-page") || "0");
            const img = item.selectFirst("img");
            if (!img) continue;
            const src = (img.attr("src") || img.attr("data-src") || "").trim();
            if (!src) continue;
            pagesMap[pageNum] = this.absUrl(src);
        }
        const keys = Object.keys(pagesMap).map(n => parseInt(n)).sort((a, b) => a - b);
        return keys.map(k => ({ url: pagesMap[k], headers: this.headers }));
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
