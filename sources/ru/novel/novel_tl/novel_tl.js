const mangayomiSources = [{
    "name": "Novel-Tl",
    "lang": "ru",
    "baseUrl": "https://novel-tl.com",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/novel_tl.js",
    "notes": "Переводы новелл. Если домен заблокирован, поменяйте в настройках."
}];

const NT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": NT_UA,
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
        const items = doc.select(".catalog-item, article.novel, .books-list .book, div.book-card");
        for (const it of items) {
            const a = it.selectFirst("a.novel-title, a.book-title, h3 a, h4 a, a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href) continue;
            const name = (it.selectFirst(".title, h3, h4") || a).text.trim() || a.attr("title") || "";
            if (!name) continue;
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a.next, .pagination .next, a[rel=next]");
        return { list, hasNextPage: hasNextPage || list.length >= 15 };
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.source.baseUrl}/catalog?sort=popular&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/catalog?sort=updated&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/search?q=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const name = (doc.selectFirst("h1.novel-title, h1.book-title, h1")).text.trim();
        const imgEl = doc.selectFirst(".book-cover img, .novel-cover img, .cover img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
        const descEl = doc.selectFirst(".description, .novel-description, div[itemprop=description]");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[rel=tag], a[href*='/genre/']").map(e => e.text.trim());

        const chapters = [];
        const chEls = doc.select("ul.chapters-list li a, table.chapters a, .toc a");
        for (const a of chEls) {
            const href = a.attr("href");
            if (!href) continue;
            chapters.push({
                name: a.text.trim(),
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description, genre, status: 5, chapters: chapters.reverse() };
    }

    async getHtmlContent(name, url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}</p>`;
        const doc = new Document(res.body);
        const content = doc.selectFirst(".chapter-content, .text-chapter, article.chapter, div#reader-content");
        const html = content ? content.innerHtml : "<p>(Не удалось извлечь текст)</p>";
        return `<h2>${name || ""}</h2><hr><br>${html}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
