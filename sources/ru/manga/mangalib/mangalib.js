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
    "version": "0.4.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/mangalib.js",
    "notes": "mangalib.org (актуальный домен; .me ещё работает). API api.cdnlibs.org site_id=1. Для 18+/Pro-глав нужен Bearer token: DevTools на mangalib.org → Network → любой XHR к api.cdnlibs.org → Authorization → копируй всё после Bearer → вставь в Settings."
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
