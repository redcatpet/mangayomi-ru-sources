const mangayomiSources = [{
    "name": "Tl.Rulate",
    "lang": "ru",
    "baseUrl": "https://tl.rulate.ru",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/tl_rulate.js",
    "notes": "Любительские переводы. Некоторые главы платные и требуют логина — MVP показывает бесплатные."
}];

const RULATE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": RULATE_UA,
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

    parseBookList(htmlBody) {
        const doc = new Document(htmlBody);
        const list = [];
        // Search/catalog results live in div.span2 cards with book link and cover
        let cards = doc.select("div.book");
        if (cards.length === 0) cards = doc.select("ul.search-results li");
        if (cards.length === 0) cards = doc.select("div.bookshelf-item");
        if (cards.length === 0) {
            // Fallback — any anchor that points to /book/{id}
            cards = doc.select("div.span2").filter(e => e.selectFirst("a[href^='/book/']"));
        }
        for (const c of cards) {
            const a = c.selectFirst("a[href^='/book/']");
            if (!a) continue;
            const link = a.attr("href");
            const img = c.selectFirst("img");
            let imageUrl = img ? (img.attr("src") || img.attr("data-src") || "") : "";
            imageUrl = this.absUrl(imageUrl);
            // Title may be inside <p.book-title> or anchor title attr
            const titleEl = c.selectFirst(".book-title, h5, h4, p.t-title") || a;
            const name = (titleEl.text || a.attr("title") || "").trim();
            if (!name) continue;
            list.push({ name: name, imageUrl: imageUrl, link: link });
        }
        // Dedup
        const seen = new Set();
        const dedup = list.filter(x => {
            if (seen.has(x.link)) return false;
            seen.add(x.link);
            return true;
        });
        // Pagination: link rel=next or "»" in .pagination
        const hasNextPage = dedup.length >= 20;
        return { list: dedup, hasNextPage: hasNextPage };
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/search?t=&category=0&type=0&sort=0&atmosphere=0&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseBookList(res.body);
    }

    async getLatestUpdates(page) {
        // Sort=1 is "recently updated" on rulate
        const url = `${this.source.baseUrl}/search?t=&category=0&type=0&sort=1&atmosphere=0&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseBookList(res.body);
    }

    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/search?t=${encodeURIComponent(query || "")}&category=0&type=0&sort=0&atmosphere=0&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseBookList(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1[itemprop=name]") || doc.selectFirst("h1")).text.trim();
        let imageUrl = "";
        const imgEl = doc.selectFirst("div.book img, .main-image img, img[itemprop=image]");
        if (imgEl) imageUrl = this.absUrl(imgEl.attr("src") || imgEl.attr("data-src") || "");

        const description = (
            doc.selectFirst("div[itemprop=description]")
            || doc.selectFirst("div.book-description")
            || doc.selectFirst("div.book-content")
        );
        const descriptionText = description ? description.text.trim() : "";

        const author = doc.select("span[itemprop=author] a, a[href^='/user/']").map(e => e.text.trim()).filter(x => x).join(", ");
        const genre = doc.select("a[href*='/category/'], span[itemprop=genre]").map(e => e.text.trim()).filter(x => x);

        // Chapters — table.chapters or div with chapter links
        const chapters = [];
        const rows = doc.select("table#Chapters tr, div.chapters-new .chapter, table.chapters tr");
        for (const row of rows) {
            const a = row.selectFirst("a[href*='/book/']");
            if (!a) continue;
            const href = a.attr("href");
            // Skip rows that point to the book root
            if (!href || href.match(/\/book\/\d+\/?$/)) continue;
            const chName = a.text.trim();
            if (!chName) continue;
            const dateEl = row.selectFirst("td.date, td:last-child, span.date");
            const dateTxt = dateEl ? dateEl.text.trim() : "";
            chapters.push({
                name: chName,
                url: href,
                dateUpload: this.parseDate(dateTxt).toString(),
                scanlator: null
            });
        }

        return {
            name: name,
            imageUrl: imageUrl,
            description: descriptionText,
            author: author,
            genre: genre,
            status: 5,
            chapters: chapters
        };
    }

    parseDate(text) {
        if (!text) return Date.now();
        const t = text.toLowerCase();
        const m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (m) {
            let y = parseInt(m[3]);
            if (y < 100) y += 2000;
            return new Date(y, parseInt(m[2]) - 1, parseInt(m[1])).getTime();
        }
        return Date.now();
    }

    // Return chapter HTML content as a single-element "page list"
    // Mangayomi uses getPageList for novels too — each entry is a page of text (HTML).
    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const body = doc.selectFirst("div.content-text, div.chapter-text, div#chapter-text, article");
        const html = body ? body.innerHtml : "(Не удалось извлечь текст — возможно, глава платная)";
        return [html];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
