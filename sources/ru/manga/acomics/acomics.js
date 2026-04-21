const mangayomiSources = [{
    "name": "Acomics",
    "lang": "ru",
    "baseUrl": "https://acomics.ru",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/acomics.js",
    "notes": "Русские веб-комиксы. Каталог /list, отдельный комикс /~{slug}, страница /~{slug}/{num}"
}];

const AC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AC_UA,
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
        const items = doc.select("table.catalog-elem-small, table.catalog-elem, div.list-content div.serial");
        for (const it of items) {
            const a = it.selectFirst("a[href*='/~']");
            if (!a) continue;
            const href = a.attr("href");
            const img = it.selectFirst("img");
            let imageUrl = img ? this.absUrl(img.attr("src") || "") : "";
            const titleEl = it.selectFirst("strong, .serial-title, h2 a") || a;
            const name = titleEl.text.trim() || a.attr("title") || "";
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        const hasNextPage = !!doc.selectFirst("a.next, .pagination .next");
        return { list, hasNextPage: hasNextPage || list.length >= 10 };
    }

    async getPopular(page) {
        const skip = (page - 1) * 10;
        const res = await this.client.get(`${this.source.baseUrl}/list/subscr/${skip}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async getLatestUpdates(page) {
        const skip = (page - 1) * 10;
        const res = await this.client.get(`${this.source.baseUrl}/list/last_update/${skip}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }
    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/search?keyword=${encodeURIComponent(query || "")}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1") || doc.selectFirst(".about-header h2")).text.trim();
        const imgEl = doc.selectFirst("img.serial-thumb, img.avatar-serial, .about-header img");
        const imageUrl = imgEl ? this.absUrl(imgEl.attr("src") || "") : "";
        const descEl = doc.selectFirst("section.serial-description, div.about-text");
        const description = descEl ? descEl.text.trim() : "";
        const author = (doc.selectFirst("a.serial-author, td:contains(Автор) + td") || { text: "" }).text.trim();
        const genre = doc.select("a.button.tag, .serial-info a[href*='/genres/']").map(e => e.text.trim()).filter(x => x);

        // Chapters — on acomics each "page" is a chapter, so read the issues list /~slug/list
        let slug = url;
        const slugMatch = url.match(/~([^/?]+)/);
        if (slugMatch) slug = slugMatch[1];

        const listRes = await this.client.get(`${this.source.baseUrl}/~${slug}/list`, this.headers);
        const chapters = [];
        if (listRes.statusCode === 200) {
            const listDoc = new Document(listRes.body);
            const rows = listDoc.select("td.list-title a, .list-column a");
            for (const r of rows) {
                const href = r.attr("href");
                if (!href || href.indexOf(`/~${slug}/`) < 0) continue;
                const chName = r.text.trim();
                chapters.push({ name: chName, url: href, dateUpload: Date.now().toString(), scanlator: null });
            }
        }

        return { name, imageUrl, description, author, genre, status: 5, chapters: chapters.reverse() };
    }

    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        const img = doc.selectFirst("img#mainImage, img.issue-image, div.issue img");
        if (!img) return [];
        return [{ url: this.absUrl(img.attr("src") || ""), headers: this.headers }];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
