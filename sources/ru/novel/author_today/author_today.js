const mangayomiSources = [{
    "name": "Author.Today",
    "lang": "ru",
    "baseUrl": "https://author.today",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/author_today.js",
    "notes": "MVP. Отдаёт каталог, метаданные и список глав. Текст бесплатных глав грузится частично — на author.today контент AES-зашифрован, для декодирования нужна авторская сессия (поле cookieSession в настройках). Без неё чтение работать не будет, только навигация."
}];

const AT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        const h = {
            "User-Agent": AT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
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
        if (u.startsWith("/")) return this.source.baseUrl + u;
        return this.source.baseUrl + "/" + u;
    }

    parseCatalog(htmlBody) {
        const doc = new Document(htmlBody);
        const cards = doc.select("div.book-row");
        const list = [];
        const seen = {};
        for (const c of cards) {
            // Only rows with book-row-content are real books — generic div.book-row also wraps nav/genre strips.
            if (!c.selectFirst("div.book-row-content")) continue;
            const titleLink = c.selectFirst("div.book-title a") || c.selectFirst("a.book-cover-content");
            if (!titleLink) continue;
            let link = titleLink.attr("href") || "";
            // Strip trailing fragments/suffixes
            link = link.split("#")[0].replace(/\/(reviews|comments)\/?$/, "");
            // Require /work/{numeric_id} format
            if (!/^\/work\/\d+/.test(link)) continue;
            if (seen[link]) continue;
            seen[link] = true;
            const name = (titleLink.text || titleLink.attr("title") || "").trim();
            if (!name) continue;
            const img = c.selectFirst("div.cover-image img") || c.selectFirst("img");
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("src") || img.attr("data-src") || "";
                imageUrl = this.absUrl(imageUrl);
            }
            list.push({ name, imageUrl, link });
        }
        const hasNextPage = list.length >= 10 || !!doc.selectFirst("a[rel=next], li.next a, a.page-link[aria-label*='следу']");
        return { list, hasNextPage };
    }

    async fetchCatalog(page, extraParams) {
        const url = `${this.source.baseUrl}/search?category=works&page=${page}${extraParams || ""}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getPopular(page) { return await this.fetchCatalog(page, "&filter=top"); }
    async getLatestUpdates(page) { return await this.fetchCatalog(page, "&sort=recent"); }

    async search(query, page, filters) {
        return await this.fetchCatalog(page, `&q=${encodeURIComponent(query || "")}`);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const nameEl = doc.selectFirst("h1.book-title") || doc.selectFirst("h1");
        const name = nameEl ? nameEl.text.trim() : url;
        let imageUrl = "";
        const coverEl = doc.selectFirst("div.book-cover-content img") || doc.selectFirst("div.book-cover img");
        if (coverEl) imageUrl = this.absUrl(coverEl.attr("src") || coverEl.attr("data-src") || "");

        const descEl = doc.selectFirst("div.rich-content")
                    || doc.selectFirst("div.annotation")
                    || doc.selectFirst("div[itemprop=description]");
        const descriptionText = descEl ? descEl.text.trim() : "";

        const author = doc.select("div.book-authors a, span.book-author a").map(e => e.text.trim()).filter(x => x).join(", ");
        const genre = doc.select("div.book-genres a, .book-tags a, a[href*='/work/genre/']").map(e => e.text.trim()).filter(x => x);

        const statusEl = doc.selectFirst("div.book-status") || doc.selectFirst("span.book-status");
        const statusText = statusEl ? statusEl.text : "";
        let status = 5;
        if (statusText.indexOf("полностью") >= 0 || statusText.indexOf("Завершено") >= 0 || statusText.indexOf("Закончен") >= 0) status = 1;
        else if (statusText.indexOf("процесс") >= 0 || statusText.indexOf("Пишется") >= 0) status = 0;
        else if (statusText.indexOf("заморож") >= 0) status = 2;

        const chapters = [];
        const chLinks = doc.select("ul.table-of-content li a, .book-toc a");
        for (const a of chLinks) {
            const href = a.attr("href");
            if (!href || href.indexOf("/reader/") < 0) continue;
            const chName = a.text.trim();
            if (!chName) continue;
            chapters.push({
                name: chName,
                url: href,
                dateUpload: Date.now().toString(),
                scanlator: null
            });
        }

        return { name, imageUrl, description: descriptionText, author, genre, status, chapters };
    }

    async getHtmlContent(name, url) {
        const sessionSet = !!(new SharedPreferences()).get("session_cookie");
        if (!sessionSet) {
            return `<h2>${name || ""}</h2><hr><p>⚠ Текст глав author.today зашифрован клиентским JS.</p>
                <p>Вставьте значение Cookie <code>laravel_session</code> в настройках источника (поле <b>Session cookie</b>).</p>
                <p>Получить: зайдите на <a href="https://author.today">author.today</a>, логиньтесь, откройте DevTools → Application → Cookies → скопируйте значение laravel_session.</p>
                <p>Без этого можно читать только бесплатные книги в браузере через Webview.</p>`;
        }
        const res = await this.client.get(this.absUrl(url), this.headers);
        if (res.statusCode !== 200) return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}</p>`;
        const doc = new Document(res.body);
        const content = doc.selectFirst("#text-container, div.reader-text, div.text-container");
        const html = content ? content.innerHtml : "<p>(Не удалось извлечь текст. Если это платная глава — нужна покупка на сайте.)</p>";
        return `<h2>${name || ""}</h2><hr><br>${html}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }

    getFilterList() { return []; }

    getSourcePreferences() {
        return [{
            key: "session_cookie",
            editTextPreference: {
                title: "Session cookie",
                summary: "Полная строка Cookie из DevTools после входа на author.today. Нужна для загрузки текста глав (опционально).",
                value: "",
                dialogTitle: "Session cookie",
                dialogMessage: "Например: laravel_session=eyJ...;  XSRF-TOKEN=..."
            }
        }];
    }
}
