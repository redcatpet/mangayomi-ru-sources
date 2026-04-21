const mangayomiSources = [{
    "name": "AnimeVost",
    "lang": "ru",
    "baseUrl": "https://animevost.org",
    "apiUrl": "https://api.animevost.org/v1",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.1.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animevost.js",
    "notes": "Использует публичный API v1 animevost. Отдаёт прямые mp4-ссылки через POST /playlist."
}];

const AV_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "User-Agent": AV_UA,
            "Accept": "application/json",
            "Accept-Language": "ru,en;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
    }

    parseList(body) {
        const j = JSON.parse(body);
        const list = (j.data || []).map(item => ({
            name: (item.title || "").split("/")[0].trim() || item.title,
            imageUrl: item.urlImagePreview || "",
            link: String(item.id)
        }));
        const state = j.state || {};
        const page = state.page || 1;
        const count = state.count || 0;
        const total = state.total_count || state.total || count;
        return { list: list, hasNextPage: page * count < total || list.length >= (state.count || 20) };
    }

    async getPopular(page) {
        // v1 "last" endpoint doubles as popularity-sorted feed
        const res = await this.client.get(`${this.source.apiUrl}/last?page=${page}&quantity=30`, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        if (!query) return await this.getPopular(page);
        // v1 search endpoint is POST form
        const res = await this.client.post(
            `${this.source.apiUrl}/search`,
            { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
            { "name": query, "page": String(page) }
        );
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseList(res.body);
    }

    async getDetail(id) {
        const res = await this.client.post(
            `${this.source.apiUrl}/info`,
            { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
            { "id": id }
        );
        if (res.statusCode !== 200) {
            return { name: id, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], episodes: [] };
        }
        const info = (JSON.parse(res.body).data || [])[0] || {};
        const title = (info.title || "").split("/")[0].trim() || info.title;
        const description = info.description ? info.description.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "") : "";
        const genre = (info.genre || "").split(",").map(s => s.trim()).filter(x => x);

        // series is either a dict {ep_name: ep_id} (JSON stringified in some versions) or plain object
        let seriesMap = info.series;
        if (typeof seriesMap === "string") {
            try { seriesMap = JSON.parse(seriesMap.replace(/'/g, '"')); } catch (e) { seriesMap = {}; }
        }
        seriesMap = seriesMap || {};
        // API /playlist expects the TITLE id (not episode id) and returns all
        // episodes as one array. We pack "titleId::episodeName" so getVideoList
        // can resolve the right row.
        const episodes = Object.keys(seriesMap).map(name => ({
            name: name,
            url: String(info.id) + "::" + name,
            dateUpload: Date.now().toString(),
            scanlator: "AnimeVost"
        }));
        // Sort by numeric prefix
        episodes.sort((a, b) => {
            const na = parseInt((a.name.match(/(\d+)/) || [0, 0])[1]);
            const nb = parseInt((b.name.match(/(\d+)/) || [0, 0])[1]);
            return na - nb;
        });

        return {
            name: title,
            imageUrl: info.urlImagePreview || "",
            description: description,
            genre: genre,
            status: info.isFinished === "1" ? 1 : 0,
            episodes: episodes.reverse()
        };
    }

    async getVideoList(packedUrl) {
        // packedUrl format: "titleId::episodeName"
        const sep = (packedUrl || "").indexOf("::");
        if (sep < 0) return [];
        const titleId = packedUrl.substring(0, sep);
        const epName = packedUrl.substring(sep + 2);

        const res = await this.client.post(
            `${this.source.apiUrl}/playlist`,
            { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
            { "id": titleId }
        );
        if (res.statusCode !== 200) return [];
        let arr;
        try { arr = JSON.parse(res.body); } catch (e) { return []; }
        if (!Array.isArray(arr)) return [];

        const target = arr.find(x => x && x.name === epName) || arr[0];
        if (!target) return [];

        const videos = [];
        if (target.hd) {
            videos.push({
                url: target.hd,
                originalUrl: target.hd,
                quality: "AnimeVost 720p",
                headers: this.headers
            });
        }
        if (target.std) {
            videos.push({
                url: target.std,
                originalUrl: target.std,
                quality: "AnimeVost 480p",
                headers: this.headers
            });
        }
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() { return []; }
}
