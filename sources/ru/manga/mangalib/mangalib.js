// @include: lib_family_base

const mangayomiSources = [{
    "name": "MangaLib",
    "lang": "ru",
    "baseUrl": "https://mangalib.me",
    "apiUrl": "https://api.cdnlibs.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/mangalib.js",
    "notes": "API на cdnlibs.org. Для 18+ контента и Pro-глав нужен Bearer token (настройки источника)."
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
