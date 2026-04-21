// @include: lib_family_base

const mangayomiSources = [{
    "name": "HentaiLib",
    "lang": "ru",
    "baseUrl": "https://hentailib.me",
    "apiUrl": "https://api.cdnlibs.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "hasCloudflare": true,
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/hentailib.js",
    "notes": "18+, семейство Lib. Почти весь контент требует Bearer token — вставить в настройках."
}];

class DefaultExtension extends LibFamilyBase {
    get siteId() { return 3; }
    get itemType() { return 0; }
}
