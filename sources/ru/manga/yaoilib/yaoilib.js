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
    "version": "0.1.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/yaoilib.js",
    "notes": "BL/яой, семейство Lib. Для авторизованного контента — Bearer token в настройках."
}];

class DefaultExtension extends LibFamilyBase {
    get siteId() { return 4; }
    get itemType() { return 0; }
}
