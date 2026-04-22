// @include: lib_family_base

const mangayomiSources = [{
    "name": "AniLib",
    "lang": "ru",
    "baseUrl": "https://anilib.me",
    "apiUrl": "https://api.cdnlibs.org/api",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animelib.js",
    "notes": "Аниме через backend семейства Lib (site_id=5). Эпизоды отдают плееры Kodik / Sibnet / Libria — extractor базовый."
}];

const ANILIB_SITE_ID = 5;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    async getPopular(page) { return await libGetPopular(this.client, this.source, ANILIB_SITE_ID, "anime", page); }
    async getLatestUpdates(page) { return await libGetLatest(this.client, this.source, ANILIB_SITE_ID, "anime", page); }
    async search(query, page, filters) { return await libSearch(this.client, this.source, ANILIB_SITE_ID, "anime", query, page); }

    async getDetail(slug) {
        const headers = libApiHeaders(this.source, ANILIB_SITE_ID);
        const infoRes = await this.client.get(
            `${this.source.apiUrl}/anime/${slug}?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=studios`,
            headers
        );
        if (infoRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], episodes: [] };
        }
        const info = JSON.parse(infoRes.body).data;
        const epRes = await this.client.get(`${this.source.apiUrl}/anime/${slug}/episodes`, headers);
        const episodes = epRes.statusCode === 200 ? (JSON.parse(epRes.body).data || []) : [];

        return {
            name: libCoerceString(info.rus_name || info.eng_name || info.name || slug),
            imageUrl: libProxyImage(libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || "")),
            author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
            status: libParseStatus(info.status && libCoerceString(info.status.label)),
            description: libCoerceString(info.summary || info.description || ""),
            genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
            episodes: episodes.map(ep => ({
                name: `Сезон ${ep.season || 1} · Эпизод ${ep.number || "?"}` + (ep.name ? `: ${libCoerceString(ep.name)}` : ""),
                url: `${this.source.apiUrl}/episodes/${ep.id}`,
                dateUpload: ep.created_at ? new Date(ep.created_at).valueOf().toString() : Date.now().toString(),
                scanlator: null
            })).reverse()
        };
    }

    async getVideoList(url) {
        const headers = libApiHeaders(this.source, ANILIB_SITE_ID);
        const res = await this.client.get(url, headers);
        if (res.statusCode !== 200) return [];
        const ep = JSON.parse(res.body).data || {};
        const videos = [];
        for (const p of (ep.players || [])) {
            const quality = (p.quality && (p.quality.label || p.quality.value)) || "?";
            const team = (p.team && p.team.name) || "";
            const translation = (p.translation && p.translation.label) || "";
            const tag = [team, translation].filter(x => x).join(" / ");
            let videoUrl = p.src || p.href || "";
            if (!videoUrl) continue;
            if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;
            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `AniLib ${quality}${tag ? " · " + tag : ""}`,
                headers: headers
            });
        }
        videos.sort((a, b) => {
            const qa = parseInt((a.quality.match(/(\d+)/) || [0, 0])[1]);
            const qb = parseInt((b.quality.match(/(\d+)/) || [0, 0])[1]);
            return qb - qa;
        });
        return videos;
    }

    async getPageList(url) { return []; }
    getFilterList() { return []; }
    getSourcePreferences() { return libSourcePreferences(); }
}
