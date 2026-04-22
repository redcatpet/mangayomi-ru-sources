// @include: grouple_base

const mangayomiSources = [{
    "name": "ReadManga",
    "lang": "ru",
    "baseUrl": "https://3.readmanga.ru",
    "apiUrl": "",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/readmanga.js",
    "notes": "Актуальный mirror: 3.readmanga.ru. Другие: web.usagi.one, readmanga.io, readmanga.live (редирект). При блокировке замените в настройках."
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getBaseUrl() { return groupleBaseUrlFrom(this.source); }

    async getPopular(page) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(groupleListUrl(baseUrl, "RATING", page), groupleHeaders(baseUrl));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return groupleParseList(res.body, baseUrl);
    }

    async getLatestUpdates(page) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(groupleListUrl(baseUrl, "UPDATED", page), groupleHeaders(baseUrl));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return groupleParseList(res.body, baseUrl);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        let sort = "RATING";
        if (filters && filters[0] && filters[0].values) {
            const idx = (filters[0].state && filters[0].state.index) || 0;
            sort = filters[0].values[idx].value;
        }
        const offset = (page - 1) * 70;
        const url = `${baseUrl}/search/advancedResults?q=${encodeURIComponent(query || "")}&offset=${offset}&sortType=${sort}`;
        const res = await this.client.get(url, groupleHeaders(baseUrl));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return groupleParseList(res.body, baseUrl);
    }

    async getDetail(url) {
        return await groupleGetDetail(this.client, this.getBaseUrl(), url);
    }

    async getPageList(url) {
        return await groupleGetPageList(this.client, this.getBaseUrl(), url);
    }

    getFilterList() { return groupleFilterList(); }
    getSourcePreferences() { return groupleSourcePreferences(); }
}
