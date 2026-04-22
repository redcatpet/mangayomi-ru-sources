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
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/novel/ranobelib.js",
    "notes": "Новеллы семейства Lib (site_id=3). Глава возвращается как HTML-контент. Для некоторых переводов может требоваться Bearer token."
}];

const RANOBELIB_SITE_ID = 3;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    async getPopular(page) { return await libGetPopular(this.client, this.source, RANOBELIB_SITE_ID, "manga", page); }
    async getLatestUpdates(page) { return await libGetLatest(this.client, this.source, RANOBELIB_SITE_ID, "manga", page); }
    async search(query, page, filters) { return await libSearch(this.client, this.source, RANOBELIB_SITE_ID, "manga", query, page, filters); }

    async getDetail(slug) {
        const headers = libApiHeaders(this.source, RANOBELIB_SITE_ID);
        const infoRes = await this.client.get(
            `${this.source.apiUrl}/manga/${slug}?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors`,
            headers
        );
        if (infoRes.statusCode !== 200) {
            return { name: slug, imageUrl: "", description: "(Ошибка загрузки)", status: 5, genre: [], chapters: [] };
        }
        const info = JSON.parse(infoRes.body).data;
        const chRes = await this.client.get(`${this.source.apiUrl}/manga/${slug}/chapters`, headers);
        const chapters = chRes.statusCode === 200 ? (JSON.parse(chRes.body).data || []) : [];
        const chBase = `${this.source.apiUrl}/manga/${slug}/chapter`;
        return {
            name: libCoerceString(info.rus_name || info.eng_name || info.name || slug),
            imageUrl: libProxyImage(libCoerceString((info.cover && (info.cover.default || info.cover.thumbnail)) || "")),
            author: (info.authors || []).map(x => libCoerceString(x && x.name)).filter(Boolean).join(", "),
            status: libParseStatus(info.status && libCoerceString(info.status.label)),
            description: libCoerceString(info.summary || info.description || ""),
            genre: (info.genres || []).map(x => libCoerceString(x && x.name)).filter(Boolean),
            chapters: chapters.map(c => {
                const branchId = c.branches && c.branches[0] && c.branches[0].branch_id;
                let url = `${chBase}?number=${c.number}&volume=${c.volume}`;
                if (branchId) url += `&branch_id=${branchId}`;
                return {
                    name: `Том ${c.volume} Глава ${c.number}` + (c.name ? `: ${libCoerceString(c.name)}` : ""),
                    url,
                    dateUpload: new Date((c.branches && c.branches[0] && c.branches[0].created_at) || Date.now()).valueOf().toString(),
                    scanlator: (c.branches && c.branches[0] && (c.branches[0].teams || []).map(t => libCoerceString(t && t.name)).filter(Boolean).join(", ")) || null
                };
            }).reverse()
        };
    }

    async getHtmlContent(name, url) {
        const headers = libApiHeaders(this.source, RANOBELIB_SITE_ID);
        const res = await this.client.get(url, headers);
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

    getFilterList() { return libFilterList(); }
    getSourcePreferences() { return libSourcePreferences(); }
}
