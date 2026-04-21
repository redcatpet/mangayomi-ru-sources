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
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranobelib.js",
    "notes": "Новеллы семейства Lib. Глава возвращается как HTML-контент. Для некоторых переводов может требоваться Bearer token."
}];

class DefaultExtension extends LibFamilyBase {
    get siteId() { return 6; }
    get itemType() { return 2; }

    async getHtmlContent(name, url) {
        const res = await this.client.get(url, this.apiHeaders);
        if (res.statusCode !== 200) {
            return `<h2>${name || ""}</h2><p>Ошибка HTTP ${res.statusCode} — возможно требуется Bearer token в настройках.</p>`;
        }
        const data = JSON.parse(res.body).data || {};
        const raw = data.content || data.text || "";
        let html;
        if (typeof raw === "string") html = raw;
        else html = libProseMirrorToHtml(raw);
        if (!html) return `<h2>${name || ""}</h2><p>(Глава пустая)</p>`;
        return `<h2>${name || ""}</h2><hr><br>${html}`;
    }

    async getPageList(url) {
        return [await this.getHtmlContent("", url)];
    }
}
