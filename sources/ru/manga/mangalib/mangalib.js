// @include: lib_family_base

const mangayomiSources = [{
    "name": "MangaLib",
    "lang": "ru",
    "baseUrl": "https://mangalib.org",
    "apiUrl": "https://api2.mangalib.me/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.5.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/mangalib.js",
    "notes": "mangalib.org (актуальный домен). API api2.mangalib.me/api site_id=1. Для 18+/Pro-глав нужен Bearer token: DevTools → Network → XHR → Authorization → вставь в Settings. Картинки автоматически переключаются между CDN при 403 (с 2026-04 img2.imglib.info блокируется DDoS-Guard, рабочий — img3.mixlib.me)."
}];

const MANGALIB_SITE_ID = 1;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    async getPopular(page) { return await libGetPopular(this.client, this.source, MANGALIB_SITE_ID, "manga", page); }
    async getLatestUpdates(page) { return await libGetLatest(this.client, this.source, MANGALIB_SITE_ID, "manga", page); }
    async search(query, page, filters) { return await libSearch(this.client, this.source, MANGALIB_SITE_ID, "manga", query, page, filters); }
    async getDetail(slug) { return await libMangaDetail(this.client, this.source, MANGALIB_SITE_ID, slug); }
    async getPageList(url) { return await libMangaPageList(this.client, this.source, MANGALIB_SITE_ID, url); }
    getFilterList() { return libFilterList(); }
    getSourcePreferences() { return libSourcePreferences(); }
}
