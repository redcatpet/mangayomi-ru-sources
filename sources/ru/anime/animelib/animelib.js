// @include: lib_family_base
// @include: kodik_extractor

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
    "version": "0.4.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animelib.js",
    "notes": "Аниме через backend семейства Lib (site_id=5). Origin+Referer обязательны. Несколько озвучек через players[] + Kodik-extractor для kodikplayer iframe."
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
            return { name: slug, imageUrl: "", description: `(Ошибка загрузки HTTP ${infoRes.statusCode})`, status: 5, genre: [], episodes: [] };
        }
        const info = JSON.parse(infoRes.body).data;
        // Real episode list is /api/episodes?anime_id=X (confirmed via live probe); /anime/{slug}/episodes is legacy.
        let episodes = [];
        const epByAnime = await this.client.get(`${this.source.apiUrl}/episodes?anime_id=${info.id}`, headers);
        if (epByAnime.statusCode === 200) {
            try { episodes = JSON.parse(epByAnime.body).data || []; } catch (e) {}
        }
        if (!episodes.length) {
            const epRes = await this.client.get(`${this.source.apiUrl}/anime/${slug}/episodes`, headers);
            if (epRes.statusCode === 200) {
                try { episodes = JSON.parse(epRes.body).data || []; } catch (e) {}
            }
        }

        return {
            name: libCoerceString(info.rus_name || info.eng_name || info.name || slug),
            imageUrl: libProxyImage(libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || "")),
            author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
            status: libParseStatus(info.status && libCoerceString(info.status.label)),
            description: libCoerceString(info.summary || info.description || ""),
            genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
            episodes: episodes.map(ep => ({
                name: `Сезон ${ep.season || 1} · Эпизод ${ep.number || ep.item_number || "?"}` + (ep.name ? `: ${libCoerceString(ep.name)}` : ""),
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
            const playerName = String(p.player || "").toLowerCase();
            const teamName = (p.team && p.team.name) || "?";
            const translationLabel = (p.translation_type && (p.translation_type.label || p.translation_type.name))
                                 || (p.translation && p.translation.label) || "";
            const tag = [teamName, translationLabel].filter(x => x && x !== "?").join(" · ");

            let src = p.src || p.href || "";
            if (!src) continue;
            if (src.indexOf("//") === 0) src = "https:" + src;

            if (playerName === "kodik" || src.indexOf("kodikplayer") >= 0) {
                const kodikVids = await kodikExtract(this.client, src, this.source.baseUrl, `AniLib · ${tag || "Kodik"}`);
                for (const v of kodikVids) videos.push(v);
                continue;
            }
            // AniLib's own player or Sibnet/Aniboom — keep direct URL as-is
            const qLabel = (p.quality && (p.quality.label || p.quality.value))
                        || (p.video && p.video.quality) || "?";
            videos.push({
                url: src,
                originalUrl: src,
                quality: `AniLib · ${tag || playerName} ${qLabel}`,
                headers: { "User-Agent": headers["User-Agent"], "Referer": this.source.baseUrl + "/" }
            });
        }
        videos.sort((a, b) => {
            const qa = parseInt((a.quality.match(/(\d+)p?/) || [0, 0])[1]);
            const qb = parseInt((b.quality.match(/(\d+)p?/) || [0, 0])[1]);
            return qb - qa;
        });
        return videos;
    }

    async getPageList(url) { return []; }
    getFilterList() { return []; }
    getSourcePreferences() { return libSourcePreferences(); }
}
