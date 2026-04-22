// @include: lib_family_base

const mangayomiSources = [{
    "name": "YaoiLib",
    "lang": "ru",
    "baseUrl": "https://yaoilib.me",
    "apiUrl": "https://api.cdnlibs.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "hasCloudflare": true,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/yaoilib.js",
    "notes": "BL/яой, семейство Lib. Для авторизованного контента — Bearer token в настройках."
}];

const YAOILIB_SITE_ID = 6;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    async getPopular(page) { return await libGetPopular(this.client, this.source, YAOILIB_SITE_ID, "manga", page); }
    async getLatestUpdates(page) { return await libGetLatest(this.client, this.source, YAOILIB_SITE_ID, "manga", page); }
    async search(query, page, filters) { return await libSearch(this.client, this.source, YAOILIB_SITE_ID, "manga", query, page); }
    async getDetail(slug) { return await libMangaDetail(this.client, this.source, YAOILIB_SITE_ID, slug); }
    async getPageList(url) { return await libMangaPageList(this.client, this.source, YAOILIB_SITE_ID, url); }
    getFilterList() { return []; }
    getSourcePreferences() { return libSourcePreferences(); }
}
