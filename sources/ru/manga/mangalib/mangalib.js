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
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/mangalib.js",
    "notes": "API на cdnlibs.org. Для 18+ контента и Pro-глав нужен Bearer token (настройки источника)."
}];

class DefaultExtension extends LibFamilyBase {
    get siteId() { return 1; }
    get itemType() { return 0; }
}
