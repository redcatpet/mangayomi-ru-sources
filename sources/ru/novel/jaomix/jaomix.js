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
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/jaomix.js",
    "notes": "Каталог — главная страница + /page/N/. Контейнер div.one. Поиск по сайту не фильтрует — возвращается каталог."
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
        const cards = doc.select("div.one");
        for (const card of cards) {
            const header = card.selectFirst("div.header-home");
            const linkEl = (header && header.selectFirst("div.img-home a")) || card.selectFirst("a[href*='jaomix.ru/']");
            if (!linkEl) continue;
            const href = linkEl.attr("href");
            if (!href) continue;
            // Filter out system pages
            if (/\/(moi-zakladki|platnye-uslugi|podderzhka|skachivanie-glav|zakazat-knigu|login-jx|register)\//.test(href)) continue;
            const img = linkEl.selectFirst("img") || card.selectFirst("img");
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
                imageUrl = this.absUrl(imageUrl);
            }
            const titleEl = card.selectFirst("h3 a, h2 a") || linkEl;
            const name = (titleEl.attr("title") || titleEl.text || "").trim();
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= 15 };
    }

    async getPopular(page) {
        const url = page === 1 ? `${this.source.baseUrl}/` : `${this.source.baseUrl}/page/${page}/`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        // Site has no real search filter — fall back to catalog, then filter client-side
        const catalog = await this.getPopular(page);
        if (!query) return catalog;
        const q = query.toLowerCase();
        return {
            list: catalog.list.filter(m => m.name.toLowerCase().indexOf(q) >= 0),
            hasNextPage: catalog.hasNextPage
        };
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const nameEl = doc.selectFirst("h1") || doc.selectFirst("h1.entry-title");
        const name = nameEl ? nameEl.text.trim() : url;
        const imgEl = doc.selectFirst("div.img-book img")
                   || doc.selectFirst("div.thumb-book img")
                   || doc.selectFirst("article img")
                   || doc.selectFirst("meta[property=og:image]");
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("data-src") || imgEl.attr("src") || imgEl.attr("content") || "";
            imageUrl = this.absUrl(imageUrl);
        }
        const descEl = doc.selectFirst("div.book-desc")
                    || doc.selectFirst("section.description")
                    || doc.selectFirst("div.description")
                    || doc.selectFirst("meta[name=description]");
        const description = descEl ? (descEl.text || descEl.attr("content") || "").trim() : "";
        const genre = doc.select("a[rel=tag], a[href*='/genre/'], .tags-block a").map(e => e.text.trim()).filter(x => x);

        // Chapters: visible `div.columns-toc > div.flex-dow-txt > div.title > a`
        const chapters = [];
        const seen = {};
        const rows = doc.select("div.columns-toc div.flex-dow-txt a[href], div.flex-dow-txt a[href]");
        for (const a of rows) {
            const href = a.attr("href");
            if (!href || href.indexOf("jaomix.ru/") < 0) continue;
            if (seen[href]) continue;
            seen[href] = true;
            const h2 = a.selectFirst("h2");
            const chName = ((h2 ? h2.text : a.text) || a.attr("title") || "").trim();
            if (!chName) continue;
            const timeEl = a.selectFirst("time") || a.parent && a.parent.selectFirst && a.parent.selectFirst("time");
            chapters.push({
                name: chName,
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description, genre, status: 5, chapters: chapters };
    }

    async getHtmlContent(name, url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}</p>`;
        const doc = new Document(res.body);
        const content = doc.selectFirst("div.entry-content")
                     || doc.selectFirst("div.content.chapter")
                     || doc.selectFirst("article .post-content")
                     || doc.selectFirst("div.text-chapter");
        let html = content ? content.innerHtml : "";
        if (!html) return `<h2>${name || ""}</h2><p>(Не удалось извлечь текст. Возможно требуется вход.)</p>`;
        // Strip inline scripts/ads
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<ins[\s\S]*?<\/ins>/gi, "");
        return `<h2>${name || ""}</h2><hr><br>${html}`;
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
