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
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/mangabuff.js",
    "notes": "Страницы главы получаются инлайном из <script> — используется regex-парсинг."
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
        const cards = doc.select("div.cards__item");
        const list = [];
        for (const c of cards) {
            const a = c.selectFirst("a.cards__name, a.cards__title, h3 a");
            const imgA = c.selectFirst("a.cards__img");
            if (!a) continue;
            const link = a.attr("href");
            const name = a.text.trim();
            let imageUrl = "";
            const img = c.selectFirst("img");
            if (img) imageUrl = this.absUrl(img.attr("data-src") || img.attr("src") || "");
            list.push({ name, imageUrl, link });
        }
        const hasNextPage = !!doc.selectFirst("a.pagination__next, li.page-item:not(.disabled) a[aria-label*=Next]");
        return { list, hasNextPage: hasNextPage || list.length >= 24 };
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.source.baseUrl}/manga?sort=rating&page=${page}`, this.headers);
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

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1.manga__name") || doc.selectFirst("h1")).text.trim();
        const coverEl = doc.selectFirst("div.manga__img img, .manga-card__cover img");
        const imageUrl = coverEl ? this.absUrl(coverEl.attr("src") || coverEl.attr("data-src") || "") : "";
        const descEl = doc.selectFirst("div.manga__description, div.manga-info__description");
        const description = descEl ? descEl.text.trim() : "";

        const genre = doc.select("a.manga__genre, a.tags__item").map(e => e.text.trim());
        const author = doc.select("a[href*='/author/'], .manga__author a").map(e => e.text.trim()).join(", ");

        const chapters = [];
        const rows = doc.select("a.chapters__item, li.chapters__item a, .chapter-list a");
        for (const r of rows) {
            const href = r.attr("href");
            if (!href) continue;
            const chName = (r.selectFirst(".chapters__name, .chapter__name") || r).text.trim();
            chapters.push({
                name: chName,
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description, author, genre, status: 5, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const body = res.body;
        // Pages live inside an inline <script> — look for `pages = [ ... ]` or `window.__pages = ...`
        const patterns = [
            /pages\s*=\s*(\[[\s\S]*?\])/,
            /"pages"\s*:\s*(\[[\s\S]*?\])/,
            /chapter\.pages\s*=\s*(\[[\s\S]*?\])/
        ];
        for (const re of patterns) {
            const m = body.match(re);
            if (!m) continue;
            try {
                const arr = JSON.parse(m[1]);
                // Entries can be strings or objects {url, image, p}
                return arr.map(x => ({
                    url: typeof x === "string" ? x : (x.url || x.image || x.src || x.p || ""),
                    headers: this.headers
                })).filter(p => p.url);
            } catch (e) { /* next pattern */ }
        }
        // Fallback: search for direct <img data-src="..."> inside reader
        const doc = new Document(body);
        const imgs = doc.select("div.reader__item img, img.reader-image, img[data-src*='manga']");
        return imgs.map(i => ({
            url: this.absUrl(i.attr("data-src") || i.attr("src") || ""),
            headers: this.headers
        })).filter(p => p.url);
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
