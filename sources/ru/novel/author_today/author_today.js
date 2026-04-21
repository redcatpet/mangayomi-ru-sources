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
    "version": "0.2.0",
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
        let cards = doc.select("div.book-row");
        if (cards.length === 0) cards = doc.select("div.book-item");
        if (cards.length === 0) cards = doc.select("article.book");
        const list = [];
        for (const c of cards) {
            const a = c.selectFirst("a.book-title-link, a.book-title, h4 a, a[href^='/work/']");
            if (!a) continue;
            const link = a.attr("href");
            if (!link) continue;
            const name = a.text.trim() || (a.attr("title") || "").trim();
            if (!name) continue;
            const img = c.selectFirst(".book-cover img, img");
            let imageUrl = "";
            if (img) {
                imageUrl = img.attr("data-src") || img.attr("src") || "";
                imageUrl = this.absUrl(imageUrl);
            }
            list.push({ name: name, imageUrl: imageUrl, link: link });
        }
        const hasNextPage = !!doc.selectFirst("a[rel=next], li.next a, a.page-link[aria-label*='следу']");
        return { list: list, hasNextPage: hasNextPage };
    }

    async getPopular(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/catalog/all/popular?page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(
            `${this.source.baseUrl}/catalog/all/fresh?page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async search(query, page, filters) {
        const res = await this.client.get(
            `${this.source.baseUrl}/search?category=works&q=${encodeURIComponent(query || "")}&page=${page}`,
            this.headers
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseCatalog(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(this.absUrl(url), this.headers);
        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1.book-title") || doc.selectFirst("h1")).text.trim();
        let imageUrl = "";
        const coverEl = doc.selectFirst("div.book-cover-content img, .book-cover img");
        if (coverEl) imageUrl = this.absUrl(coverEl.attr("src") || coverEl.attr("data-src") || "");

        const description = (doc.selectFirst("div.rich-content, div.annotation") || doc.selectFirst("div[itemprop=description]"));
        const descriptionText = description ? description.text.trim() : "";

        const author = doc.select("div.book-authors a, span.book-author a").map(e => e.text.trim()).filter(x => x).join(", ");
        const genre = doc.select("div.book-genres a, .book-tags a").map(e => e.text.trim()).filter(x => x);

        const statusText = (doc.selectFirst("div.book-status, span.book-status") || doc.selectFirst("div.book-meta")).text.trim();
        let status = 5;
        if (statusText.includes("полностью") || statusText.includes("Завершено") || statusText.includes("Закончен")) status = 1;
        else if (statusText.includes("процесс") || statusText.includes("Пишется")) status = 0;
        else if (statusText.includes("заморож")) status = 2;

        // Chapters live under a.work-cover-content + ul.table-of-content li a
        const chapters = [];
        const chLinks = doc.select("ul.table-of-content li a, .book-toc a, .chapters-list a");
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

        return {
            name: name,
            imageUrl: imageUrl,
            description: descriptionText,
            author: author,
            genre: genre,
            status: status,
            chapters: chapters
        };
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
