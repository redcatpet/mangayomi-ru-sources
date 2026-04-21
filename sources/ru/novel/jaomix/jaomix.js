const mangayomiSources = [{
    "name": "Jaomix",
    "lang": "ru",
    "baseUrl": "https://jaomix.ru",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/jaomix.js",
    "notes": "WordPress-based новеллы. Главы через POST к admin-ajax."
}];

const JX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": JX_UA,
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

    parseCatalog(htmlBody) {
        const doc = new Document(htmlBody);
        const list = [];
        const items = doc.select("article.post-item, div.post-item, .posts-list article");
        for (const it of items) {
            const a = it.selectFirst("h2.post-title a, h3 a, .entry-title a, a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href) continue;
            const name = a.text.trim() || a.attr("title") || "";
            if (!name) continue;
            const img = it.selectFirst("img");
            const imageUrl = img ? this.absUrl(img.attr("data-src") || img.attr("src") || "") : "";
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a.next.page-numbers, li.next a");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const url = page === 1
            ? `${this.source.baseUrl}/projects/`
            : `${this.source.baseUrl}/projects/page/${page}/`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/?s=${encodeURIComponent(query || "")}&paged=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const name = (doc.selectFirst("h1.entry-title, h1.post-title, h1")).text.trim();
        const imgEl = doc.selectFirst(".post-thumbnail img, .post-image img, article img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
        const descEl = doc.selectFirst("div.post-description, div.entry-content > p, article .description");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a[rel=tag]").map(e => e.text.trim());

        // Jaomix lists chapters via AJAX — try a simple static parse first
        const chapters = [];
        let rows = doc.select("ul.list-chap li a, .chapter-list li a, table.chapters-table a");
        for (const r of rows) {
            const href = r.attr("href");
            if (!href) continue;
            chapters.push({
                name: r.text.trim(),
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description, genre, status: 5, chapters: chapters.reverse() };
    }

    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const content = doc.selectFirst("div.entry-content, article .post-content, div.text-chapter");
        return [content ? content.innerHtml : "(Не удалось извлечь текст)"];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
