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
    "version": "0.4.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/tl_rulate.js",
    "notes": "Любительские переводы. Карточки — div.row-book, span.t-title. Бесплатные главы доступны всем; платные — требуют логин на сайте."
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
        const seen = {};
        // Cards use schema.org Book itemscope; legacy layouts use div.row-book or ul.search-results li.
        let cards = doc.select("div.row-book");
        if (cards.length === 0) cards = doc.select("div[itemtype*='Book']");
        if (cards.length === 0) cards = doc.select("ul.search-results li");
        // Fallback: walk every /book/ anchor's parent — rescues unknown layouts.
        if (cards.length === 0) cards = doc.select("a[href^='/book/']");
        for (const c of cards) {
            const a = c.selectFirst("a[href^='/book/']") || c;
            if (!a || !a.attr) continue;
            const link = a.attr("href") || "";
            if (!link || seen[link]) continue;
            if (!/^\/book\/\d+/.test(link)) continue;
            seen[link] = true;
            // Prefer schema.org canonical image (matches the detail page); fall back to
            // visible <img> for legacy layouts. Without this, catalog uses the date-suffixed
            // banner variant (`/i/book/.../X-220220.jpg`) and detail uses the canonical
            // (`/i/book/.../X.jpg`), so the cover flips on tap.
            let imageUrl = "";
            const metaImg = c.selectFirst("meta[itemprop=image]");
            if (metaImg) imageUrl = this.absUrl(metaImg.attr("content") || "");
            if (!imageUrl) {
                const img = c.selectFirst("img[src^='/i/book/']") || c.selectFirst("img");
                if (img) imageUrl = this.absUrl(img.attr("src") || img.attr("data-src") || "");
            }
            // Title — try span/p.t-title, then itemprop=name (h4 in current layout), then any heading.
            const titleEl = c.selectFirst("[itemprop=name]")
                         || c.selectFirst("span.t-title")
                         || c.selectFirst("p.t-title")
                         || c.selectFirst(".book-title, h5, h4, h3")
                         || a;
            let name = (titleEl.text || a.attr("title") || "").trim();
            if (!name) {
                // Last-resort: use image-container title attribute.
                const imgC = c.selectFirst(".image-container");
                if (imgC) name = (imgC.attr("title") || "").trim();
            }
            if (!name) continue;
            list.push({ name, imageUrl, link });
        }
        return { list, hasNextPage: list.length >= 20 };
    }

    async getPopular(page) {
        // Use the byte-exact v0.3.0 URL pattern — verified working.
        // (Server treats `category` as unknown and applies defaults — equivalent to no cat filter.)
        const url = `${this.source.baseUrl}/search?t=&category=0&type=0&sort=0&atmosphere=0&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseBookList(res.body);
    }

    async getLatestUpdates(page) {
        // sort=4 = по дате последней активности
        const url = `${this.source.baseUrl}/search?t=&category=0&type=0&sort=4&atmosphere=0&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseBookList(res.body);
    }

    async search(query, page, filters) {
        // No filters AND no query -> use the same default URL as getPopular for compatibility.
        const filterActive = filters && filters.length && filters.some(f => {
            if (!f || !f.values) return false;
            const idx = f.state || 0;
            const v = f.values[idx] && f.values[idx].value;
            return v != null && String(v) !== "0" && String(v) !== "5"; // 5 is sort default
        });
        if (!query && !filterActive) {
            return this.getPopular(page);
        }
        let cat = "0", type = "0", atm = "0", sort = "5";
        if (filters && filters.length) {
            const fCat = filters[0];
            if (fCat && fCat.values) cat = fCat.values[fCat.state || 0].value;
            const fType = filters[1];
            if (fType && fType.values) type = fType.values[fType.state || 0].value;
            const fAtm = filters[2];
            if (fAtm && fAtm.values) atm = fAtm.values[fAtm.state || 0].value;
            const fSort = filters[3];
            if (fSort && fSort.values) sort = fSort.values[fSort.state || 0].value;
        }
        const url = `${this.source.baseUrl}/search?t=${encodeURIComponent(query || "")}&cat=${cat}&type=${type}&sort=${sort}&atmosphere=${atm}&page=${page}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseBookList(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1[itemprop=name]") || doc.selectFirst("h1")).text.trim();
        let imageUrl = "";
        // Match what parseBookList picks (meta[itemprop=image] canonical) so the cover
        // doesn't flip when the user taps a card.
        const metaImg = doc.selectFirst("meta[itemprop=image]");
        if (metaImg) imageUrl = this.absUrl(metaImg.attr("content") || "");
        if (!imageUrl) {
            const imgEl = doc.selectFirst("div.book img, .main-image img, img[itemprop=image]");
            if (imgEl) imageUrl = this.absUrl(imgEl.attr("src") || imgEl.attr("data-src") || "");
        }

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

    async getHtmlContent(name, url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return `<h3>${name || ""}</h3><p>Ошибка загрузки главы (HTTP ${res.statusCode}). Возможно, глава платная — войдите в аккаунт на tl.rulate.ru в браузере.</p>`;
        const doc = new Document(res.body);
        const body = doc.selectFirst("div.content-text, div.chapter-text, div#chapter-text, article.content, div.reader-container");
        const content = body ? body.innerHtml : "";
        if (!content) return `<h3>${name || ""}</h3><p>(Не удалось извлечь текст — возможно, глава платная)</p>`;
        return `<h2>${name || ""}</h2><hr><br>${content}`;
    }

    async cleanHtmlContent(html) { return html; }

    // Fallback for older Mangayomi builds that still look at getPageList
    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    getFilterList() {
        const categories = [
            ["— Любая —", "0"],
            ["Книги", "2"],
            ["Новеллы и ранобэ", "12"],
            ["Китайские", "5"],
            ["Корейские", "7"],
            ["Японские", "6"],
            ["Английские", "28"],
            ["Авторские", "18"],
            ["Авторские фанфики", "51"],
            ["Переводы фанфиков", "19"],
            ["Все бесплатные книги", "58"],
            ["Манга", "30"],
            ["Манга — для взрослых", "59"],
            ["AI переводы вебновелл", "44"],
            ["Игры", "3"],
            ["Визуальные новеллы", "8"]
        ];
        const types = [
            ["— Любой —", "0"],
            ["Только переводы", "1"],
            ["Только авторские", "2"]
        ];
        const atmospheres = [
            ["— Любая —", "0"],
            ["Позитивная", "1"],
            ["Dark", "2"]
        ];
        const sorts = [
            ["По просмотрам", "5"],
            ["По рейтингу", "6"],
            ["По дате последней активности", "4"],
            ["По дате создания", "3"],
            ["По кол-ву переведённых глав", "7"],
            ["По кол-ву лайков", "8"],
            ["По кол-ву бесплатных глав", "11"],
            ["По степени готовности", "0"],
            ["По релевантности", "-1"],
            ["По названию (оригинал)", "1"],
            ["По названию (перевод)", "2"],
            ["Случайно", "9"]
        ];
        return [
            {
                type_name: "SelectFilter", type: "category", name: "Категория", state: 0,
                values: categories.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter", type: "type", name: "Тип", state: 0,
                values: types.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter", type: "atmosphere", name: "Атмосфера", state: 0,
                values: atmospheres.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter", type: "sort", name: "Сортировка", state: 0,
                values: sorts.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            }
        ];
    }
    getSourcePreferences() { return []; }
}
