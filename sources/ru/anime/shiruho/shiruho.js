// @include: kodik_extractor

const mangayomiSources = [{
    "name": "Shiruho",
    "lang": "ru",
    "baseUrl": "https://shiruho.com",
    "apiUrl": "https://api.shiruho.com/graphql",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "hasCloudflare": true,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/anime/shiruho.js",
    "notes": "GraphQL API api.shiruho.com/graphql (sister-site Senkuro). Многодабные озвучки: Kodik (HLS через extractor) → Sibnet/VK/MyVi/YouTube как iframe. Геоблок: для не-RU IP используй cookie из senkuro-сессии."
}];

const SH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// Curated anime genre list (slug → Russian name). Sourced from
// `query allLabels(subjectType:ANIME)` filtered to depth=1.
const SH_GENRES = [
    ["action", "Боевик"], ["martial_arts", "Боевые искусства"], ["vampire", "Вампиры"],
    ["military", "Военное"], ["harem", "Гарем"], ["detective", "Детектив"],
    ["josei", "Дзёсей"], ["drama", "Драма"], ["historical", "Исторический"],
    ["isekai", "Исекай"], ["comedy", "Комедия"], ["space", "Космос"],
    ["magic", "Магия"], ["mecha", "Меха"], ["mystery", "Мистика"], ["music", "Музыка"],
    ["slice_of_life", "Повседневность"], ["adventure", "Приключения"],
    ["psychological", "Психологическое"], ["parody", "Пародия"],
    ["romance", "Романтика"], ["samurai", "Самураи"],
    ["supernatural", "Сверхъестественное"], ["shoujo", "Сёдзё"],
    ["shounen", "Сёнен"], ["sport", "Спорт"], ["seinen", "Сэйнэн"],
    ["thriller", "Триллер"], ["horror", "Ужасы"], ["sci_fi", "Фантастика"],
    ["fantasy", "Фэнтези"], ["school", "Школа"], ["ecchi", "Этти"],
    ["yuri", "Юри"], ["yaoi", "Яой"]
];

const SH_STATUSES = [
    ["— Любой —", ""], ["Онгоинг", "ONGOING"], ["Завершён", "FINISHED"],
    ["Анонс", "ANNOUNCE"]
];
const SH_FORMATS = [
    ["— Любой —", ""], ["TV", "TV"], ["TV Special", "TV_SPECIAL"], ["Movie (фильм)", "MOVIE"],
    ["OVA", "OVA"], ["ONA", "ONA"], ["Прочее", "OTHER"]
];
const SH_SEASONS = [
    ["— Любой —", ""], ["Зима", "WINTER"], ["Весна", "SPRING"],
    ["Лето", "SUMMER"], ["Осень", "FALL"]
];

// ---- GraphQL queries (extracted from main bundle index-DMbBzR3F.js) ----
const Q_ANIMES = `query fetchAnimes($first: Int = 30, $after: String, $search: String, $status: AnimeStatusFilter, $format: AnimeFormatFilter, $season: AnimeSeasonFilter, $label: AnimeLabelFilter, $orderField: AnimeOrderField = POPULARITY_SCORE, $orderDirection: OrderDirection = DESC) {
  animes(first: $first, after: $after, search: $search, status: $status, format: $format, season: $season, label: $label, orderBy: {field: $orderField, direction: $orderDirection}) {
    edges { node { id slug type status titles { lang content } originalName { lang content } cover { main: resize(width: 300, height: 420, format: WEBP) { url } } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Top-level multi-entity search. Indexes every title localization (RU/EN/JA/etc.) —
// unlike `animes(search:)` which only matches `originalName`. Returns SearchAnime
// inline-fragment nodes.
const Q_SEARCH = `query search($query: String!, $first: Int = 50) {
  search(query: $query, type: ANIME, first: $first) {
    edges {
      node {
        __typename
        ... on SearchAnime {
          id slug
          originalName
          titles { lang content }
          cover { id main: resize(width: 300, height: 420, format: WEBP) { url } }
        }
      }
    }
  }
}`;

// Anime detail by slug. description is a TiptapNodeUnion tree — request key node types.
const Q_ANIME = `query fetchAnime($slug: String!) {
  anime(slug: $slug) {
    id slug type status score views rating
    episodes episodesAired episodeDuration season
    originalName { lang content }
    titles { lang content }
    alternativeNames { lang content }
    localizations {
      lang
      description {
        __typename
        ... on TiptapNodeText { text }
        ... on TiptapNodeNestedBlock { content { __typename ... on TiptapNodeText { text } } }
        ... on TiptapNodeHeading { content { __typename ... on TiptapNodeText { text } } }
      }
    }
    labels { id slug titles { lang content } }
    studios { id name }
    mainStaff { roles person { name } }
    cover { main: resize(width: 600, height: 850, format: WEBP) { url } }
  }
}`;

// Episode list paginated by animeId. Each episode carries an array of translations
// (one per dub/sub × team), each with embedSource (KODIK/SIBNET/VK/MYVI/YOUTUBE) and embedUrl.
const Q_EPISODES = `query fetchAnimeEpisodes($animeId: ID!, $after: String, $orderBy: AnimeEpisodeOrder!) {
  animeEpisodes(animeId: $animeId, first: 100, after: $after, orderBy: $orderBy) {
    edges {
      node {
        id slug name number createdAt
        translations {
          id type embedSource embedUrl
          teams { id name }
          createdAt
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get gqlHeaders() {
        const h = {
            "User-Agent": SH_UA,
            "Accept": "application/graphql-response+json, application/json, */*",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
            "Content-Type": "application/json",
            "Origin": this.source.baseUrl,
            "Referer": this.source.baseUrl + "/"
        };
        const prefs = new SharedPreferences();
        // Bearer from `access_token` cookie value — preferred over full cookie string.
        const bearer = prefs.get("bearer_token");
        if (bearer && bearer.trim()) {
            let v = bearer.trim();
            if (v.toLowerCase().startsWith("bearer ")) v = v.slice(7).trim();
            h["Authorization"] = "Bearer " + v;
        }
        const cookie = prefs.get("session_cookie");
        if (cookie && cookie.trim()) h["Cookie"] = cookie.trim();
        return h;
    }

    async gql(operationName, query, variables) {
        // Mangayomi's Client.post sometimes mangles JSON-string body (depending on
        // qjs binding's serialization). Try string first (Apollo standard); fall
        // back to plain object body.
        const payload = { operationName, query, variables: variables || {} };
        const bodyStr = JSON.stringify(payload);
        let res = await this.client.post(this.source.apiUrl, this.gqlHeaders, bodyStr);
        if (!res || res.statusCode !== 200 || !res.body) {
            res = await this.client.post(this.source.apiUrl, this.gqlHeaders, payload);
        }
        if (!res || res.statusCode !== 200) {
            const code = res ? res.statusCode : "?";
            const snippet = res && res.body ? res.body.slice(0, 200) : "";
            return { error: `HTTP ${code}: ${snippet}` };
        }
        try {
            const j = JSON.parse(res.body);
            if (j.errors) return { error: (j.errors[0] && j.errors[0].message) || "graphql error" };
            return { data: j.data };
        } catch (e) { return { error: "parse error: " + (res.body || "").slice(0, 200) }; }
    }

    // Walk a Tiptap rich-text tree and concatenate plain text content.
    tiptapToText(nodes) {
        if (!nodes) return "";
        const arr = Array.isArray(nodes) ? nodes : [nodes];
        const out = [];
        for (const n of arr) {
            if (!n) continue;
            if (n.__typename === "TiptapNodeText" && n.text) {
                out.push(n.text);
                continue;
            }
            if (n.content && Array.isArray(n.content)) {
                const inner = this.tiptapToText(n.content);
                if (inner) out.push(inner);
            }
        }
        return out.join("\n").trim();
    }

    pickTitle(titles, originalName) {
        if (Array.isArray(titles)) {
            const ru = titles.find(t => t && t.lang === "RU");
            if (ru && ru.content) return ru.content;
            const en = titles.find(t => t && t.lang === "EN");
            if (en && en.content) return en.content;
            if (titles[0] && titles[0].content) return titles[0].content;
        }
        if (originalName && originalName.content) return originalName.content;
        return "";
    }

    // Map AnimeRating (GENERAL/SENSITIVE/QUESTIONABLE/EXPLICIT) to the
    // age label Shiruho itself shows (0+ / 12+ / 16+ / 18+). Same enum as Senkuro.
    formatRating(rating) {
        if (rating === "EXPLICIT") return "18+";
        if (rating === "QUESTIONABLE") return "16+";
        if (rating === "SENSITIVE") return "12+";
        if (rating === "GENERAL") return "0+";
        return "";
    }

    parseStatus(s) {
        if (s === "ONGOING") return 0;
        if (s === "FINISHED") return 1;
        if (s === "FROZEN") return 2;
        if (s === "DROPPED") return 3;
        if (s === "ANNOUNCE" || s === "ANNOUNCEMENT" || s === "PLANNED") return 4;
        return 5;
    }

    coverUrl(cover) {
        if (!cover) return "";
        if (cover.main && cover.main.url) return cover.main.url;
        return "";
    }

    mapEdges(edges) {
        return (edges || []).map(e => {
            const n = e.node || {};
            return {
                name: this.pickTitle(n.titles, n.originalName),
                imageUrl: this.coverUrl(n.cover),
                link: n.slug || n.id || ""
            };
        }).filter(x => x.name && x.link);
    }

    // Translate Mangayomi filter UI state → GraphQL variables.
    // Slot map: [0] Sort, [1] Status, [2] Format, [3] Season, [4] Genres
    parseFilters(filters) {
        const out = { orderField: "POPULARITY_SCORE", orderDirection: "DESC" };
        if (!filters || !filters.length) return out;
        if (filters[0] && filters[0].values && filters[0].state) {
            const idx = filters[0].state.index != null ? filters[0].state.index : 0;
            out.orderField = filters[0].values[idx].value || out.orderField;
            out.orderDirection = filters[0].state.ascending ? "ASC" : "DESC";
        }
        if (filters[1] && filters[1].values) {
            const v = filters[1].values[filters[1].state || 0].value;
            if (v) out.status = { include: [v] };
        }
        if (filters[2] && filters[2].values) {
            const v = filters[2].values[filters[2].state || 0].value;
            if (v) out.format = { include: [v] };
        }
        if (filters[3] && filters[3].values) {
            const v = filters[3].values[filters[3].state || 0].value;
            if (v) out.season = { include: [v] };
        }
        if (filters[4] && Array.isArray(filters[4].state)) {
            const include = [], exclude = [];
            for (const t of filters[4].state) {
                if (t.state === 1) include.push(t.value);
                else if (t.state === 2) exclude.push(t.value);
            }
            if (include.length || exclude.length) {
                out.label = {};
                if (include.length) out.label.include = include;
                if (exclude.length) out.label.exclude = exclude;
            }
        }
        return out;
    }

    async fetchListByOrder(field, page, extraVars) {
        let after = null;
        for (let i = 1; i <= page; i++) {
            const vars = Object.assign({ first: 30, after, orderField: field, orderDirection: "DESC" }, extraVars || {});
            const r = await this.gql("fetchAnimes", Q_ANIMES, vars);
            if (r.error || !r.data || !r.data.animes) {
                if (page === 1) {
                    return {
                        list: [{
                            name: `[Shiruho error] ${r.error || "no data"}`,
                            imageUrl: "",
                            link: "__error__"
                        }],
                        hasNextPage: false
                    };
                }
                return { list: [], hasNextPage: false };
            }
            const conn = r.data.animes || {};
            if (i === page) return { list: this.mapEdges(conn.edges), hasNextPage: !!(conn.pageInfo && conn.pageInfo.hasNextPage) };
            after = conn.pageInfo && conn.pageInfo.endCursor;
            if (!after || !conn.pageInfo.hasNextPage) return { list: [], hasNextPage: false };
        }
        return { list: [], hasNextPage: false };
    }

    async getPopular(page) { return await this.fetchListByOrder("POPULARITY_SCORE", page); }
    async getLatestUpdates(page) { return await this.fetchListByOrder("CREATED_AT", page); }

    // Map result of `search(query, type)` (SearchAnime inline-fragment nodes).
    mapSearchEdges(edges) {
        return (edges || []).map(e => {
            const n = (e && e.node) || {};
            if (n.__typename && n.__typename !== "SearchAnime") return null;
            return {
                name: this.pickTitle(n.titles, { content: n.originalName }),
                imageUrl: this.coverUrl(n.cover),
                link: n.slug || n.id || ""
            };
        }).filter(x => x && x.name && x.link);
    }

    async search(query, page, filters) {
        const q = (query || "").trim();
        // Text search: top-level `search` operation indexes ALL title localizations.
        // The `animes(search:)` filter only matches `originalName` (e.g. "Синяя тюрьма"
        // returns nothing while "blue lock" finds it).
        if (q) {
            const r = await this.gql("search", Q_SEARCH, { query: q, first: 50 });
            if (r.error || !r.data) return { list: [], hasNextPage: false };
            const edges = (r.data.search && r.data.search.edges) || [];
            return { list: this.mapSearchEdges(edges), hasNextPage: false };
        }
        // Empty query: catalog with sort + status/format/season/genre filters applied.
        const f = this.parseFilters(filters);
        const extra = {};
        if (f.status) extra.status = f.status;
        if (f.format) extra.format = f.format;
        if (f.season) extra.season = f.season;
        if (f.label) extra.label = f.label;
        return await this.fetchListByOrder(f.orderField, page, Object.assign({ orderDirection: f.orderDirection }, extra));
    }

    async getDetail(slug) {
        const r = await this.gql("fetchAnime", Q_ANIME, { slug });
        if (r.error || !r.data || !r.data.anime) {
            return { name: slug, imageUrl: "", description: `(Ошибка GraphQL: ${r.error || "нет данных"})`, status: 5, genre: [], episodes: [] };
        }
        const a = r.data.anime;
        const name = this.pickTitle(a.titles, a.originalName);
        const altNames = (a.alternativeNames || []).map(x => x.content).filter(Boolean);

        // Description: prefer Russian, fallback English.
        let descriptionText = "";
        const locs = a.localizations || [];
        const ruLoc = locs.find(l => l && l.lang === "RU" && l.description);
        const enLoc = locs.find(l => l && l.lang === "EN" && l.description);
        const desc = ruLoc || enLoc;
        if (desc && desc.description) descriptionText = this.tiptapToText(desc.description);
        if (altNames.length) {
            const prefix = `Альт. названия: ${altNames.join(" / ")}`;
            descriptionText = descriptionText ? `${prefix}\n\n${descriptionText}` : prefix;
        }

        const labels = (a.labels || []).map(l => this.pickTitle(l.titles, null)).filter(Boolean);
        // Prepend age rating ("0+"/"12+"/"16+"/"18+") as a first chip — visible on
        // detail page, matches the badge shiruho.com itself shows.
        const ratingLabel = this.formatRating(a.rating);
        const genre = ratingLabel ? [ratingLabel].concat(labels) : labels;
        const studios = (a.studios || []).map(s => s.name).filter(Boolean);
        const staff = (a.mainStaff || []).map(s => s.person && s.person.name).filter(Boolean);
        const author = staff.length ? staff.join(", ") : studios.join(", ");

        // Episodes: walk all pages of animeEpisodes, pack translations into URL.
        const animeId = a.id;
        const episodesRaw = [];
        let after = null;
        for (let i = 0; i < 50; i++) {
            const er = await this.gql("fetchAnimeEpisodes", Q_EPISODES, {
                animeId,
                after,
                orderBy: { field: "NUMBER", direction: "ASC" }
            });
            if (er.error || !er.data || !er.data.animeEpisodes) break;
            const conn = er.data.animeEpisodes;
            for (const e of (conn.edges || [])) {
                episodesRaw.push(e.node || {});
            }
            if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
            after = conn.pageInfo.endCursor;
        }

        // Sort episodes by number ascending, then reverse for Mangayomi's "newest first" UI.
        episodesRaw.sort((x, y) => (x.number || 0) - (y.number || 0));
        const episodes = episodesRaw.map(ep => {
            const number = ep.number != null ? ep.number : "?";
            const epName = ep.name ? `: ${ep.name}` : "";
            const trans = (ep.translations || []).filter(t => t && t.embedUrl);
            // Pack as "type|source|teamName|embedUrl" lines (newline-separated).
            const packed = trans.map(t => {
                const teamName = (t.teams && t.teams[0] && t.teams[0].name) || "";
                return `${t.type || ""}|${t.embedSource || ""}|${teamName}|${t.embedUrl}`;
            }).join("\n");
            return {
                name: `Серия ${number}${epName}`,
                url: packed,
                dateUpload: ep.createdAt ? new Date(ep.createdAt).valueOf().toString() : Date.now().toString(),
                scanlator: trans.length ? `${trans.length} озвуч.` : null
            };
        }).reverse();

        return {
            name: name || slug,
            imageUrl: this.coverUrl(a.cover),
            description: descriptionText,
            author,
            genre,
            status: this.parseStatus(a.status),
            episodes
        };
    }

    async getVideoList(url) {
        const videos = [];
        const lines = (url || "").split("\n").filter(x => x.trim());
        for (const line of lines) {
            const parts = line.split("|");
            if (parts.length < 4) continue;
            const type = parts[0];           // DUB | SUB | RAW | ORIGINAL
            const source = parts[1];          // KODIK | SIBNET | VK | MYVI | YOUTUBE
            const teamName = parts[2];
            const embedUrl = parts.slice(3).join("|");  // rejoin in case URL contains '|'
            if (!embedUrl) continue;

            // Build a short label like "DUB · FumoDub" or "SUB · Crunchyroll".
            const typeLabel = type === "DUB" ? "Озвучка" : type === "SUB" ? "Субтитры" : type;
            const labelTag = teamName ? `${typeLabel} · ${teamName}` : typeLabel;

            if (source === "KODIK" || /kodikplayer/i.test(embedUrl)) {
                const extracted = await kodikExtract(this.client, embedUrl, this.source.baseUrl, `Shiruho · ${labelTag}`);
                for (const v of extracted) videos.push(v);
                continue;
            }
            // Non-Kodik: pass through as iframe URL. Mangayomi may or may not play
            // these natively (Sibnet/VK/MyVi often need a WebView).
            let src = embedUrl;
            if (src.startsWith("//")) src = "https:" + src;
            videos.push({
                url: src,
                originalUrl: src,
                quality: `Shiruho · ${labelTag} (${source} iframe)`,
                headers: {
                    "User-Agent": SH_UA,
                    "Referer": this.source.baseUrl + "/"
                }
            });
        }
        return videos;
    }

    getFilterList() {
        return [
            {
                type_name: "SortFilter",
                type: "order",
                name: "Сортировка",
                state: { type_name: "SortState", index: 0, ascending: false },
                values: [
                    ["По популярности", "POPULARITY_SCORE"],
                    ["По рейтингу", "SCORE"],
                    ["По просмотрам", "VIEWS"],
                    ["По дате добавления", "CREATED_AT"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "status",
                name: "Статус",
                state: 0,
                values: SH_STATUSES.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "format",
                name: "Формат",
                state: 0,
                values: SH_FORMATS.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "season",
                name: "Сезон",
                state: 0,
                values: SH_SEASONS.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "genres",
                name: "Жанры (тап = включить, ещё тап = исключить)",
                state: SH_GENRES.map(x => ({ type_name: "TriState", name: x[1], value: x[0] }))
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "bearer_token",
                editTextPreference: {
                    title: "Auth token (access_token)",
                    summary: "Самый простой способ передать сессию. Войди на shiruho.com в браузере → F12 → Application → Cookies → shiruho.com → найди cookie с именем `access_token` → скопируй его Value (длинная строка вида v4.local.X...) → вставь сюда. Префикс 'Bearer ' добавлять НЕ надо.",
                    value: "",
                    dialogTitle: "access_token",
                    dialogMessage: "Пример: v4.local.DWdVvjoPE60luSyiJvWj... (~280 символов)"
                }
            },
            {
                key: "session_cookie",
                editTextPreference: {
                    title: "Session cookie (legacy fallback)",
                    summary: "Альтернатива access_token. Скопируй ВСЮ cookie-строку из DevTools → Application → Cookies. Используй только если Bearer не работает.",
                    value: "",
                    dialogTitle: "Cookie",
                    dialogMessage: "Пример: access_token=v4.local....; theme=dark"
                }
            }
        ];
    }
}
