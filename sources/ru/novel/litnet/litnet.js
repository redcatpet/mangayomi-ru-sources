const mangayomiSources = [{
    "name": "Litnet",
    "lang": "ru",
    "baseUrl": "https://litnet.com",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.3.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/litnet.js",
    "notes": "Коммерческая платформа. Каталог — div.row.book-item; детальная страница и список глав требуют JS (Angular). Для чтения купленных книг вставьте session cookie в настройках."
}];

const LN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        const h = {
            "User-Agent": LN_UA,
            "Accept-Language": "ru-RU,ru;q=0.9",
            "Referer": this.source.baseUrl + "/"
        };
        const cookie = (new SharedPreferences()).get("session_cookie");
        if (cookie) h["Cookie"] = cookie;
        return h;
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

        // Modern Litnet (2026) is Angular-rendered with `.book-card` containers.
        // Title is in `.book-card__title` (not the cover anchor — that one contains
        // just the age-rating badge "18+"/"16+"). Cover img is inside `.book-card__cover`.
        const cards = doc.select(".book-card");
        for (const card of cards) {
            const titleEl = card.selectFirst(".book-card__title")
                         || card.selectFirst("h4 a")
                         || card.selectFirst("h4")
                         || card.selectFirst("h3 a");
            const linkEl = card.selectFirst("a.book-card__cover")
                        || card.selectFirst("a[itemprop=url]")
                        || card.selectFirst("a[href*='/ru/book/']");
            if (!titleEl || !linkEl) continue;
            const href = linkEl.attr("href") || "";
            if (!href || seen[href]) continue;
            if (!/\/(?:ru\/)?book\/[^/?]+/.test(href)) continue;
            const name = (titleEl.text || titleEl.attr("title") || "").trim();
            if (!name || /^\d+\+$/.test(name)) continue; // skip age-rating-only "18+"
            let imageUrl = "";
            const img = card.selectFirst("img[itemprop=image]")
                     || card.selectFirst(".book-card__cover img")
                     || card.selectFirst("img");
            if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
            seen[href] = true;
            list.push({ name, imageUrl, link: href });
        }

        // Legacy layout fallback (Yii pre-Angular).
        if (list.length === 0) {
            const items = doc.select("div.row.book-item, div.book-item, div.book-search-item, article.book-item");
            for (const it of items) {
                const titleA = it.selectFirst("h4.book-title a")
                            || it.selectFirst(".book-title a")
                            || it.selectFirst("a[itemprop=url]")
                            || it.selectFirst("a[href*='/ru/book/']");
                if (!titleA) continue;
                const href = titleA.attr("href") || "";
                if (!href || seen[href]) continue;
                if (!/\/(?:ru\/)?book\/[^/?]+/.test(href)) continue;
                const nameEl = titleA.selectFirst("span[itemprop=name]") || titleA;
                const name = (nameEl.text || titleA.attr("title") || "").trim();
                if (!name || /^\d+\+$/.test(name)) continue;
                let imageUrl = "";
                const img = it.selectFirst("img[itemprop=image]")
                         || it.selectFirst(".book-img img")
                         || it.selectFirst("img");
                if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
                seen[href] = true;
                list.push({ name, imageUrl, link: href });
            }
        }

        return { list, hasNextPage: list.length >= 10 };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/ru/top/all?page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/ru/top/all?sort=updated&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/ru/search?q=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        // Detail page is Angular-rendered; only og:* meta survives SSR.
        const ogTitle = doc.selectFirst("meta[property=og:title]");
        const ogImage = doc.selectFirst("meta[property=og:image]");
        const ogDesc = doc.selectFirst("meta[property=og:description]");
        const name = ogTitle ? (ogTitle.attr("content") || "") : ((doc.selectFirst("h1") || { text: "" }).text.trim() || url);
        const imageUrl = ogImage ? (ogImage.attr("content") || "") : "";
        const description = ogDesc ? (ogDesc.attr("content") || "") : "";

        // Single-entry "reader" chapter that opens /ru/reader/{slug} (site's own web reader)
        const slugMatch = url.match(/\/ru\/book\/([^/?]+)/);
        const slug = slugMatch ? slugMatch[1] : "";
        const chapters = slug ? [{
            name: "Читать в Webview",
            url: `${this.source.baseUrl}/ru/reader/${slug}`,
            dateUpload: Date.now().toString(),
            scanlator: null
        }] : [];

        return { name, imageUrl, description, author: "", genre: [], status: 5, chapters };
    }

    async getHtmlContent(name, url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode} — возможно, нужен session cookie в настройках.</p>`;
        const doc = new Document(res.body);
        const content = doc.selectFirst("div.reader__body, div.chapter-content, article.reader");
        const html = content ? content.innerHtml : "<p>(Глава платная или требуется логин. Вставьте session cookie в настройках.)</p>";
        return `<h2>${name || ""}</h2><hr><br>${html}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    getFilterList() { return []; }
    getSourcePreferences() {
        return [{
            key: "session_cookie",
            editTextPreference: {
                title: "Session cookie",
                summary: "Полная строка Cookie для доступа к купленным книгам.",
                value: "",
                dialogTitle: "Cookie",
                dialogMessage: ""
            }
        }];
    }
}
