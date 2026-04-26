// @include: lib_family_base

const mangayomiSources = [{
    "name": "HentaiLib",
    "lang": "ru",
    "baseUrl": "https://hentailib.me",
    "apiUrl": "https://hapi.hentaicdn.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "hasCloudflare": true,
    "version": "0.5.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/hentailib.js",
    "notes": "18+, семейство Lib (site_id=4). Почти весь контент требует Bearer token. Получить: DevTools на hentailib.me → Network → любой XHR к api.cdnlibs.org → Authorization → копируй всё после Bearer → вставь в Settings."
}];

const HENTAILIB_SITE_ID = 4;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    async getPopular(page) { return await libGetPopular(this.client, this.source, HENTAILIB_SITE_ID, "manga", page); }
    async getLatestUpdates(page) { return await libGetLatest(this.client, this.source, HENTAILIB_SITE_ID, "manga", page); }
    async search(query, page, filters) { return await libSearch(this.client, this.source, HENTAILIB_SITE_ID, "manga", query, page, filters); }
    async getDetail(slug) { return await libMangaDetail(this.client, this.source, HENTAILIB_SITE_ID, slug); }
    async getPageList(url) { return await libMangaPageList(this.client, this.source, HENTAILIB_SITE_ID, url); }
    getFilterList() { return libFilterList(); }
    getSourcePreferences() { return libSourcePreferences(); }
}
