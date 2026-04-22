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
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/allhentai.js",
    "notes": "18+. allhentai.ru редиректится на allhen.online — номер перед доменом (20.) регулярно меняется. При 'Failed host lookup' зайдите на https://allhentai.ru/ в браузере, посмотрите на какой mirror перебрасывает, и впишите его в настройках источника."
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

    async getDetail(url) { return await groupleGetDetail(this.client, this.getBaseUrl(), url); }
    async getPageList(url) { return await groupleGetPageList(this.client, this.getBaseUrl(), url); }
    getFilterList() { return groupleFilterList(); }
    getSourcePreferences() { return groupleSourcePreferences(); }
}
