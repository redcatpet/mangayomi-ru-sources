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
    "version": "0.3.1",
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

    isSystemHref(href) {
        return /\/(moi-zakladki|platnye-uslugi|podderzhka|skachivanie-glav|zakazat-knigu|login-jx|register|wp-content|wp-includes|category|tag|page|feed|comments|author|search|projects|genre|genres|reviews|rules|about|contact|sitemap)\b/i.test(href)
            || /^https?:\/\/(?!(?:[\w-]+\.)?jaomix\.ru)/.test(href)
            || /\/feed\/|\.xml|\.rss|\.json/i.test(href);
    }

    pushCard(list, seen, href, name, imageUrl) {
        if (!href || seen[href]) return;
        if (this.isSystemHref(href)) return;
        if (!name) return;
        seen[href] = true;
        list.push({ name, imageUrl, link: href });
    }

    parseCatalog(htmlBody) {
        const doc = new Document(htmlBody);
        const list = [];
        const seen = {};

        // Tier 1 — original layout: div.one with header-home/img-home.
        const cards = doc.select("div.one");
        for (const card of cards) {
            const header = card.selectFirst("div.header-home");
            const linkEl = (header && header.selectFirst("div.img-home a")) || card.selectFirst("a[href*='jaomix.ru/']");
            if (!linkEl) continue;
            const href = linkEl.attr("href") || "";
            const img = linkEl.selectFirst("img") || card.selectFirst("img");
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
                imageUrl = this.absUrl(imageUrl);
            }
            const titleEl = card.selectFirst("h3 a, h2 a") || linkEl;
            const name = (titleEl.attr("title") || titleEl.text || "").trim();
            this.pushCard(list, seen, href, name, imageUrl);
        }

        // Tier 2 — common WordPress card layouts (post listings, themed cards).
        if (list.length === 0) {
            const altCards = doc.select("article.post, article, div.post-item, div.book-item, div.col-md-3, div.col-sm-4, div.col-xs-6");
            for (const card of altCards) {
                const linkEl = card.selectFirst("a[href*='jaomix.ru/']") || card.selectFirst("h3 a, h2 a, a");
                if (!linkEl) continue;
                const href = linkEl.attr("href") || "";
                const img = card.selectFirst("img");
                let imageUrl = "";
                if (img) {
                    imageUrl = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
                    imageUrl = this.absUrl(imageUrl);
                }
                const titleEl = card.selectFirst("h3 a, h2 a, .entry-title a") || linkEl;
                const name = (titleEl.attr("title") || titleEl.text || "").trim();
                this.pushCard(list, seen, href, name, imageUrl);
            }
        }

        // Tier 3 — fallback: every anchor with a non-empty title pointing to a non-system jaomix page.
        if (list.length === 0) {
            const anchors = doc.select("a[href*='jaomix.ru/']");
            for (const a of anchors) {
                const href = a.attr("href") || "";
                const name = (a.attr("title") || a.text || "").trim();
                if (!name || name.length < 3) continue;
                // Try to find image in surrounding markup
                let imageUrl = "";
                const aImg = a.selectFirst("img");
                if (aImg) imageUrl = this.absUrl(aImg.attr("data-src") || aImg.attr("src") || "");
                this.pushCard(list, seen, href, name, imageUrl);
            }
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
