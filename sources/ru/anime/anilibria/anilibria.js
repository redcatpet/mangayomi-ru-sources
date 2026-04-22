const mangayomiSources = [{
    "name": "AniLibria",
    "lang": "ru",
    "baseUrl": "https://anilibria.top",
    "apiUrl": "https://api.anilibria.app/api/v1",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": false,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/anilibria.js",
    "notes": "Переехали в AniLiberty. Старый v2/v3 API отключён — расширение использует новый v1 API на api.anilibria.app."
}];

const ANILIBRIA_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ANILIBRIA_POSTER_BASE = "https://anilibria.top";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get headers() {
        return {
            "Accept": "application/json",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "User-Agent": ANILIBRIA_UA,
            "Referer": this.source.baseUrl + "/"
        };
    }

    absPoster(src) {
        if (!src) return "";
        if (src.startsWith("http")) return src;
        return ANILIBRIA_POSTER_BASE + src;
    }

    parseListResponse(body) {
        const json = JSON.parse(body);
        const items = (json.data || []).map(r => ({
            name: (r.name && (r.name.main || r.name.english)) || r.alias || "",
            imageUrl: this.absPoster(r.poster && (r.poster.preview || r.poster.src)),
            link: r.alias || String(r.id)
        }));
        // Pagination lives under meta.pagination.{current_page,total_pages} (API v1)
        const pag = (json.meta && (json.meta.pagination || json.meta)) || {};
        const current = pag.current_page || pag.page || 1;
        const last = pag.total_pages || pag.last_page || current;
        return { list: items, hasNextPage: current < last };
    }

    async fetchList(sortKey, page) {
        const url = `${this.source.apiUrl}/anime/catalog/releases?page=${page}&limit=30&f[sorting]=${sortKey}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseListResponse(res.body);
    }

    async getPopular(page) {
        return await this.fetchList("RATING_DESC", page);
    }

    async getLatestUpdates(page) {
        return await this.fetchList("FRESH_AT_DESC", page);
    }

    async search(query, page, filters) {
        if (!query) return await this.getPopular(page);
        // API accepts `f[search]=...` query in catalog endpoint
        const url = `${this.source.apiUrl}/anime/catalog/releases?page=${page}&limit=30&f[search]=${encodeURIComponent(query)}`;
        const res = await this.client.get(url, this.headers);
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return this.parseListResponse(res.body);
    }

    statusFromRaw(statusObj) {
        if (!statusObj) return 5;
        const v = statusObj.value || "";
        if (v === "IS_ONGOING") return 0;
        if (v === "IS_FINISHED") return 1;
        if (v === "IS_NOT_ONGOING") return 2;
        return 5;
    }

    async getDetail(alias) {
        const res = await this.client.get(
            `${this.source.apiUrl}/anime/releases/${alias}`,
            this.headers
        );
        if (res.statusCode !== 200) {
            return { name: alias, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], episodes: [] };
        }
        const r = JSON.parse(res.body);

        const name = (r.name && (r.name.main || r.name.english)) || alias;
        const imageUrl = this.absPoster(r.poster && (r.poster.src || r.poster.preview));
        const description = r.description || "";
        const genre = (r.genres || []).map(g => g.name);

        const episodes = (r.episodes || []).map(ep => {
            const ord = ep.ordinal != null ? ep.ordinal : (ep.number || "?");
            const title = ep.name ? `Эпизод ${ord}: ${ep.name}` : `Эпизод ${ord}`;
            // Pack all qualities into the URL as a pipe-encoded map so getVideoList can decode
            const qualities = [];
            if (ep.hls_480) qualities.push("480|" + ep.hls_480);
            if (ep.hls_720) qualities.push("720|" + ep.hls_720);
            if (ep.hls_1080) qualities.push("1080|" + ep.hls_1080);
            return {
                name: title,
                url: qualities.join("\n"),
                dateUpload: ep.updated_at ? new Date(ep.updated_at).valueOf().toString() : Date.now().toString(),
                scanlator: "AniLibria"
            };
        }).reverse();

        return {
            name: name,
            imageUrl: imageUrl,
            description: description,
            genre: genre,
            status: this.statusFromRaw(r.is_ongoing != null ? { value: r.is_ongoing ? "IS_ONGOING" : "IS_FINISHED" } : r.status),
            episodes: episodes
        };
    }

    async getVideoList(url) {
        const lines = (url || "").split("\n").filter(x => x.trim());
        const videos = [];
        for (const line of lines) {
            const idx = line.indexOf("|");
            if (idx < 0) continue;
            const quality = line.substring(0, idx);
            const videoUrl = line.substring(idx + 1);
            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: "AniLibria " + quality + "p",
                headers: this.headers
            });
        }
        // Order by user preference (default 720 — good balance for most connections)
        const pref = (new SharedPreferences()).get("default_quality") || "720";
        videos.sort((a, b) => {
            const qa = parseInt((a.quality.match(/(\d+)p/) || [0, 0])[1]);
            const qb = parseInt((b.quality.match(/(\d+)p/) || [0, 0])[1]);
            // Preferred quality goes first; otherwise high-to-low
            if (a.quality.indexOf(pref + "p") >= 0) return -1;
            if (b.quality.indexOf(pref + "p") >= 0) return 1;
            return qb - qa;
        });
        return videos;
    }

    getFilterList() { return []; }
    getSourcePreferences() {
        return [{
            key: "default_quality",
            listPreference: {
                title: "Качество по умолчанию",
                summary: "Какое качество открывать первым. Остальные доступны в меню плеера.",
                valueIndex: 1,
                entries: ["480p (минимум трафика)", "720p (рекомендуется)", "1080p (лучшее)"],
                entryValues: ["480", "720", "1080"]
            }
        }];
    }
}
