// @include: lib_family_base

const mangayomiSources = [{
    "name": "RanobeLib",
    "lang": "ru",
    "baseUrl": "https://ranobelib.me",
    "apiUrl": "https://api.cdnlibs.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 2,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.1.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranobelib.js",
    "notes": "Новеллы семейства Lib. Глава возвращается как HTML-контент. Для некоторых переводов может требоваться Bearer token."
}];

class DefaultExtension extends LibFamilyBase {
    get siteId() { return 6; }
    get itemType() { return 2; }

    // Chapters use `/manga/{slug}/chapter?number=X&volume=Y` and the response
    // contains `content` (HTML) instead of `pages`. We return it as single page.
    async getPageList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        if (res.statusCode !== 200) {
            return ["(Ошибка загрузки главы — возможно требуется Bearer token в настройках)"];
        }
        const data = JSON.parse(res.body).data || {};
        const raw = data.content || data.text || "";
        // raw may be string OR ProseMirror doc — convert both to HTML
        let html;
        if (typeof raw === "string") {
            html = raw;
        } else {
            html = libProseMirrorToHtml(raw);
        }
        if (!html) return ["(Глава пустая)"];
        return [html];
    }
}
