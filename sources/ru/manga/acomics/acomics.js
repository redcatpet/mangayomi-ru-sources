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
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/acomics.js",
    "notes": "Русские веб-комиксы. Каталог /comics?skip=N, детали /~slug, выпуск /~slug/N."
}];

const AC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const AC_PAGE_SIZE = 10;

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
        const cards = doc.select("section.serial-card");
        for (const card of cards) {
            const a = card.selectFirst("a.cover") || card.selectFirst("h2.title a");
            if (!a) continue;
            const href = a.attr("href");
            if (!href || href.indexOf("/~") < 0) continue;
            // Skip external-redirect cards
            if (href.startsWith("http") && href.indexOf("acomics.ru") < 0) continue;
            const img = card.selectFirst("img");
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("data-real-src") || img.attr("src") || "";
                if (imageUrl && imageUrl.indexOf("catalog-stub") >= 0) imageUrl = "";
                imageUrl = this.absUrl(imageUrl);
            }
            const titleEl = card.selectFirst("h2.title a");
            const name = titleEl ? titleEl.text.trim() : (a.attr("title") || "").trim();
            if (!name) continue;
            list.push({ name, imageUrl, link: href });
        }
        return { list, hasNextPage: list.length >= AC_PAGE_SIZE };
    }

    async getPopular(page) {
        const skip = (page - 1) * AC_PAGE_SIZE;
        const res = await this.client.get(`${this.source.baseUrl}/comics?skip=${skip}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const skip = (page - 1) * AC_PAGE_SIZE;
        const res = await this.client.get(`${this.source.baseUrl}/comics?categories=&ratings[]=1&ratings[]=2&ratings[]=3&ratings[]=4&ratings[]=5&ratings[]=6&type=0&updatable=0&subscribe=0&issue_count=2&sort=last_update&skip=${skip}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        const q = encodeURIComponent(query || "");
        const res = await this.client.get(`${this.source.baseUrl}/search?keyword=${q}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const path = url.startsWith("http") ? url.replace(this.source.baseUrl, "") : url;
        const slugMatch = path.match(/~([^/?]+)/);
        const slug = slugMatch ? slugMatch[1] : path.replace(/^\/+/, "").replace(/^~/, "");
        const res = await this.client.get(`${this.source.baseUrl}/~${slug}`, this.headers);
        const doc = new Document(res.body);

        const nameEl = doc.selectFirst("h1.serial-header-title") || doc.selectFirst("h1") || doc.selectFirst(".about-header h2");
        const name = nameEl ? nameEl.text.trim() : slug;
        const imgEl = doc.selectFirst("img.serial-cover") || doc.selectFirst(".about-header img") || doc.selectFirst("div.serial-header img");
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("data-real-src") || imgEl.attr("src") || "";
            imageUrl = this.absUrl(imageUrl);
        }
        const descEl = doc.selectFirst("section.serial-description") || doc.selectFirst("div.about-text") || doc.selectFirst("p.serial-about");
        const description = descEl ? descEl.text.trim() : "";
        const genre = doc.select("a.tag, a[href*='/serial-category/']").map(e => e.text.trim()).filter(x => x);

        // Chapters — use sequential issue URLs from /~slug/list
        const chapters = [];
        const listRes = await this.client.get(`${this.source.baseUrl}/~${slug}/list`, this.headers);
        if (listRes.statusCode === 200) {
            const listDoc = new Document(listRes.body);
            const rows = listDoc.select(`a[href^='/~${slug}/']`);
            const seen = {};
            for (const a of rows) {
                const href = a.attr("href") || "";
                const num = href.replace(`/~${slug}/`, "").split(/[?#/]/)[0];
                if (!/^\d+$/.test(num)) continue;
                if (seen[num]) continue;
                seen[num] = true;
                const txt = (a.text || "").trim() || `Выпуск ${num}`;
                chapters.push({
                    name: txt,
                    url: `/~${slug}/${num}`,
                    dateUpload: Date.now().toString(),
                    scanlator: null
                });
            }
            chapters.sort((a, b) => {
                const an = parseInt(a.url.split("/").pop()) || 0;
                const bn = parseInt(b.url.split("/").pop()) || 0;
                return bn - an;
            });
        }

        return { name, imageUrl, description, genre, status: 5, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);
        // Current markup: <img class="issue" src="/upload/!c/..."> with alt like "Выпуск 1"
        const img = doc.selectFirst("img.issue")
                 || doc.selectFirst("img#mainImage")
                 || doc.selectFirst("img.issue-image")
                 || doc.selectFirst("div.issue img")
                 || doc.selectFirst("section.issue img");
        if (!img) return [];
        const src = img.attr("src") || img.attr("data-real-src") || "";
        if (!src) return [];
        return [{ url: this.absUrl(src), headers: this.headers }];
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
