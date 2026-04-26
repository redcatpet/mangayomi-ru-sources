const mangayomiSources = [{
    "name": "Ранобэ.рф",
    "lang": "ru",
    "baseUrl": "https://xn--80ac9aeh6f.xn--p1ai",
    "apiUrl": "https://xn--80ac9aeh6f.xn--p1ai/v3",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranoberf.js",
    "notes": "Ранобэ.рф — публичный v3 API для каталога + Next.js data для детали. Punycode domain. Главы отдаются как HTML-контент."
}];

const RRF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const RRF_PAGE_SIZE = 30;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": RRF_UA,
            "Accept": "application/json, text/html,*/*",
            "Accept-Language": "ru-RU,ru;q=0.9",
            "Referer": this.source.baseUrl + "/"
        };
    }

    imgUrl(img) {
        if (!img || !img.url) return "";
        return this.source.baseUrl + img.url;
    }

    mapItems(items) {
        return (items || []).map(it => ({
            name: it.title || it.titleEn || String(it.id),
            imageUrl: this.imgUrl(it.verticalImage || it.horizontalImage),
            link: it.url || ("/" + (it.slug || ""))
        }));
    }

    async fetchList(order, page) {
        const url = `${this.source.apiUrl}/books?page=${page}&pageSize=${RRF_PAGE_SIZE}&expand=verticalImage,horizontalImage,lastChapter&order=${order}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        const json = JSON.parse(res.body);
        const list = this.mapItems(json.items);
        const pd = json.pagesData || {};
        const hasNext = (pd.currentPage || page) < (pd.pageCount || 0);
        return { list, hasNextPage: hasNext };
    }

    async getPopular(page) { return await this.fetchList("likes", page); }
    async getLatestUpdates(page) { return await this.fetchList("lastPublishedChapter", page); }

    async search(query, page, filters) {
        const q = encodeURIComponent(query || "");
        const res = await this.client.get(`${this.source.baseUrl}/books?q=${q}&page=${page}`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        const data = this.extractNextData(res.body);
        const td = ((data && data.props && data.props.pageProps) || {}).totalData || {};
        const list = this.mapItems(td.items);
        const pd = td.pagesData || {};
        const hasNext = (pd.currentPage || page) < (pd.pageCount || 0);
        return { list, hasNextPage: hasNext };
    }

    extractNextData(html) {
        const marker = '<script id="__NEXT_DATA__" type="application/json">';
        const start = html.indexOf(marker);
        if (start < 0) return null;
        const body = html.substring(start + marker.length);
        const end = body.indexOf("</script>");
        if (end < 0) return null;
        try { return JSON.parse(body.substring(0, end)); } catch (e) { return null; }
    }

    parseStatus(s) {
        if (s === "active" || s === "ongoing") return 0;
        if (s === "completed" || s === "finished") return 1;
        if (s === "freezed" || s === "frozen" || s === "hiatus") return 2;
        return 5;
    }

    async getDetail(url) {
        const path = url.startsWith("/") ? url : ("/" + url);
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        const data = this.extractNextData(res.body || "");
        const pp = (data && data.props && data.props.pageProps) || {};
        const book = pp.book || {};
        const chapters = (book.chapters || []).map(c => ({
            name: (c.numberChapter ? c.numberChapter + ". " : "") + (c.title || ""),
            url: c.url || "",
            dateUpload: c.publishedAt ? new Date(c.publishedAt.replace(" ", "T") + "Z").valueOf().toString() : Date.now().toString(),
            scanlator: null
        }));

        return {
            name: book.title || book.titleEn || path,
            imageUrl: this.imgUrl(book.imageVertical || book.verticalImage || book.imageHorizontal || book.horizontalImage),
            description: (book.description || "").replace(/<[^>]+>/g, "").trim(),
            author: book.author || "",
            genre: (book.genres || []).map(g => g.title || g.name || "").filter(Boolean),
            status: this.parseStatus(book.status),
            chapters
        };
    }

    async getHtmlContent(name, url) {
        const path = url.startsWith("/") ? url : ("/" + url);
        const res = await this.client.get(this.source.baseUrl + path, this.headers);
        if (res.statusCode !== 200) {
            return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode}.</p>`;
        }
        const data = this.extractNextData(res.body || "");
        const pp = (data && data.props && data.props.pageProps) || {};
        const chap = pp.chapter || {};
        const content = chap.content || {};
        let text = content.text || "";
        if (!text && chap.isSubscription) {
            return `<h2>${name || chap.title || ""}</h2><p>(Эта глава только для подписчиков. Пополните баланс на сайте.)</p>`;
        }
        if (!text && (chap.isDonate || (chap.price && chap.price > 0))) {
            return `<h2>${name || chap.title || ""}</h2><p>(Эта глава платная — ${chap.price || "?"} баллов.)</p>`;
        }
        if (!text) {
            return `<h2>${name || chap.title || ""}</h2><p>(Глава пустая.)</p>`;
        }
        return `<h2>${name || chap.title || ""}</h2><hr>${text}`;
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
