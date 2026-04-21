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
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/animelib.js",
    "notes": "Аниме через backend семейства Lib. Эпизоды отдают плееры Kodik / Sibnet / Libria — extractor базовый."
}];

// AniLib uses the Lib JSON backend but with `/anime` resource instead of `/manga`.
// Episodes carry `players` array with {quality, href, name}.
class DefaultExtension extends LibFamilyBase {
    get siteId() { return 5; }
    get itemType() { return 1; }

    async parseList(url) {
        try {
            const res = await this.client.get(url, this.apiHeaders);
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };
            const json = JSON.parse(res.body);
            const list = (json.data || []).map(m => ({
                name: libCoerceString(m.rus_name || m.eng_name || m.name || ""),
                imageUrl: libCoerceString((m.cover && (m.cover.default || m.cover.thumbnail)) || ""),
                link: libCoerceString(m.slug_url || m.slug || "")
            }));
            const pag = (json.meta && (json.meta.pagination || json.meta)) || {};
            const current = pag.current_page || 1;
            const last = pag.total_pages || pag.last_page || current;
            return { list: list, hasNextPage: current < last || !!(json.meta && json.meta.has_next_page) };
        } catch (e) {
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        return await this.parseList(`${this.apiUrl}/anime?page=${page}&site_id[]=${this.siteId}&sort_by=rate_avg`);
    }
    async getLatestUpdates(page) {
        return await this.parseList(`${this.apiUrl}/anime?page=${page}&site_id[]=${this.siteId}&sort_by=last_chapter_at`);
    }
    async search(query, page, filters) {
        return await this.parseList(`${this.apiUrl}/anime?q=${encodeURIComponent(query || "")}&page=${page}&site_id[]=${this.siteId}`);
    }

    async getDetail(slug) {
        const infoRes = await this.client.get(
            `${this.apiUrl}/anime/${slug}?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=studios`,
            this.apiHeaders
        );
        const epRes = await this.client.get(
            `${this.apiUrl}/anime/${slug}/episodes`,
            this.apiHeaders
        );
        if (infoRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], episodes: [] };
        }
        const info = JSON.parse(infoRes.body).data;
        const episodes = epRes.statusCode === 200 ? JSON.parse(epRes.body).data : [];

        return {
            name: libCoerceString(info.rus_name || info.eng_name || info.name || slug),
            imageUrl: libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || ""),
            author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
            status: this.parseStatus(info.status && libCoerceString(info.status.label)),
            description: libCoerceString(info.summary || info.description || ""),
            genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
            episodes: episodes.map(ep => ({
                name: `Сезон ${ep.season || 1} · Эпизод ${ep.number || "?"}` + (ep.name ? `: ${libCoerceString(ep.name)}` : ""),
                url: `${this.apiUrl}/episodes/${ep.id}`,
                dateUpload: ep.created_at ? new Date(ep.created_at).valueOf().toString() : Date.now().toString(),
                scanlator: null
            })).reverse()
        };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        if (res.statusCode !== 200) return [];
        const ep = JSON.parse(res.body).data || {};
        const videos = [];
        // `players` is an array of { src, quality:{value, label}, team:{name}, translation:{label} }
        for (const p of (ep.players || [])) {
            const quality = (p.quality && (p.quality.label || p.quality.value)) || "?";
            const team = (p.team && p.team.name) || "";
            const translation = (p.translation && p.translation.label) || "";
            const tag = [team, translation].filter(x => x).join(" / ");
            let videoUrl = p.src || p.href || "";
            if (!videoUrl) continue;
            // Relative URLs → prepend https:
            if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;
            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `AniLib ${quality}${tag ? " · " + tag : ""}`,
                headers: this.apiHeaders
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
}
