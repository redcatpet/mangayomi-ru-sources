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
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/litnet.js",
    "notes": "Коммерческая платформа. Без платной подписки читаются только бесплатные книги — MVP отображает всё, но при открытии платной главы вы увидите превью."
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
        const items = doc.select("div.book-item, article.book, .books-grid .book");
        for (const it of items) {
            const a = it.selectFirst("a.book-title, a.title, h3 a, h4 a, a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href) continue;
            const name = a.text.trim() || (it.selectFirst(".title") ? it.selectFirst(".title").text.trim() : "");
            if (!name) continue;
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("src") || img.attr("data-src") || "") : "";
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a[rel=next], .pagination__next a");
        return { list, hasNextPage: hasNextPage || list.length >= 20 };
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
        const name = (doc.selectFirst("h1.book-heading, h1.book-title, h1")).text.trim();
        const imgEl = doc.selectFirst(".book-cover img, .cover img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || "") : "";
        const descEl = doc.selectFirst("div.annotation, .book-annotation");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select(".book-genres a, .genre-tag").map(e => e.text.trim()).filter(x => x);
        const author = (doc.selectFirst("a.author, .book-authors a") || { text: "" }).text.trim();

        const chapters = [];
        const chEls = doc.select("ul.contents-list li a, .book-toc a, .chapters-list a");
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

        return { name, imageUrl, description, author, genre, status: 5, chapters: chapters.reverse() };
    }

    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const content = doc.selectFirst("div.reader__body, div.chapter-content, article.reader");
        return [content ? content.innerHtml : "(Возможно, глава платная или требуется логин. Вставьте session cookie в настройках.)"];
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
