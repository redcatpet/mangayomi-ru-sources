// @include: grouple_base

const mangayomiSources = [{
    "name": "AllHentai",
    "lang": "ru",
    "baseUrl": "https://20.allhen.online",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "hasCloudflare": false,
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/allhentai.js",
    "notes": "18+. allhentai.ru редиректится на allhen.online — номер перед доменом (20.) регулярно меняется. При 'Failed host lookup' зайдите на https://allhentai.ru/ в браузере, посмотрите на какой mirror перебрасывает, и впишите его в настройках источника."
}];

class DefaultExtension extends GroupleBase {}
