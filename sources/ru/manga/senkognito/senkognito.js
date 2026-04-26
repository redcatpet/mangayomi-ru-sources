const mangayomiSources = [{
    "name": "Senkognito",
    "lang": "ru",
    "baseUrl": "https://senkognito.com",
    "apiUrl": "https://api.senkognito.com/graphql",
    "iconUrl": "",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "hasCloudflare": true,
    "version": "0.3.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/senkognito.js",
    "notes": "NSFW-сестра Senkuro. GraphQL API api.senkognito.com/graphql. Каталог фильтруется по rating={EXPLICIT,QUESTIONABLE} — как на самом сайте. Для авторизации лучше всего использовать поле `Auth token` — это значение cookie `access_token` из браузера (DevTools → Cookies → senkognito.com)."
}];

const SK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// Curated genre list (slug → Russian display). Same set as Senkuro since both share
// one backend. NSFW-leaning labels (БДСМ, Хентай, Изнасилование, Футанари etc.) are
// kept here because Senkognito users actually want to filter by them.
const SK_GENRES = [
    ["angel", "Ангел"], ["dystopia", "Антиутопия"], ["bdsm", "БДСМ"], ["god", "Бог"],
    ["ojou_sama", "Богатая леди"], ["vampire", "Вампир"], ["witch", "Ведьма"],
    ["military", "Военное"], ["survival", "Выживание"], ["female_protagonist", "ГГ женщина"],
    ["overpowered_protagonist", "ГГ имба"], ["male_protagonist", "ГГ мужчина"],
    ["josei", "Дзёсей"], ["dragon", "Драконы"], ["drama", "Драма"], ["zombie", "Зомби"],
    ["rape", "Изнасилование"], ["art", "Искусство"], ["historical", "Исторический"],
    ["comedy", "Комедия"], ["space", "Космос"], ["magic", "Магия"], ["mecha", "Меха"],
    ["milf", "Милфы"], ["mystery", "Мистика"], ["music", "Музыка"],
    ["slice_of_life", "Повседневность"], ["crime", "Преступления"], ["adventure", "Приключения"],
    ["psychological", "Психологическое"], ["reincarnation", "Реинкарнация"],
    ["romance", "Романтика"], ["samurai", "Самурай"], ["supernatural", "Сверхъестественное"],
    ["shoujo", "Сёдзе"], ["shoujo_ai", "Сёдзе-ай"], ["shounen", "Сёнен"],
    ["shounen_ai", "Сёнен-ай"], ["sport", "Спорт"], ["seinen", "Сэйнэн"],
    ["thriller", "Триллер"], ["horror", "Ужасы"], ["sci_fi", "Фантастика"],
    ["futanari", "Футанари"], ["fantasy", "Фэнтези"], ["hentai", "Хентай"],
    ["school", "Школа"], ["action", "Экшен"], ["ecchi", "Этти"],
    ["yuri", "Юри"], ["yaoi", "Яой"]
];

const SK_TYPES = [
    ["— Любой —", ""], ["Манга (JP)", "MANGA"], ["Манхва (KR)", "MANHWA"],
    ["Маньхуа (CN)", "MANHUA"], ["Комиксы", "COMICS"], ["OEL Манга", "OEL_MANGA"]
];
const SK_STATUSES = [
    ["— Любой —", ""], ["Онгоинг", "ONGOING"], ["Завершён", "FINISHED"],
    ["Заморожен", "FROZEN"], ["Заброшен", "DROPPED"], ["Анонс", "ANNOUNCEMENT"]
];

// ---- GraphQL queries (extracted from the app's main bundle) ----
//
// Senkognito differs from Senkuro by ALWAYS passing a `rating` filter that limits
// results to NSFW/sensitive ratings. Without it the API returns the full Senkuro
// catalog (both sites share one backend).
// Other filters (status/type/format/label) all use `{include:[...], exclude:[...]}`.
const Q_MANGAS = `query fetchMangas($first: Int = 30, $after: String, $search: String, $rating: MangaRatingFilter, $status: MangaStatusFilter, $type: MangaTypeFilter, $format: MangaFormatFilter, $label: MangaLabelFilter, $orderField: MangaOrderField = POPULARITY_SCORE, $orderDirection: OrderDirection = DESC) {
  mangas(first: $first, after: $after, search: $search, rating: $rating, status: $status, type: $type, format: $format, label: $label, orderBy: {field: $orderField, direction: $orderDirection}) {
    edges { node { id slug type rating titles { lang content } originalName { lang content } cover { main: resize(width: 300, height: 420, format: WEBP) { url } } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Top-level multi-entity search. Indexes every title localization (Cyrillic, Latin,
// Japanese) — unlike `mangas(search:)` which only matches against `originalName`.
// Returned as `SearchManga` inline-fragment nodes; we filter NSFW client-side via
// `mangaRating`.
const Q_SEARCH = `query search($query: String!, $first: Int = 50) {
  search(query: $query, type: MANGA, first: $first) {
    edges {
      node {
        __typename
        ... on SearchManga {
          id slug
          rating
          originalName
          titles { lang content }
          cover { id main: resize(width: 300, height: 420, format: WEBP) { url } }
        }
      }
    }
  }
}`;

// Manga detail by slug. Branch has `primaryTeamActivities` (NOT a direct `team` field).
// description is a TiptapNodeUnion tree — request key node types as inline fragments.
const Q_MANGA = `query fetchManga($slug: String!) {
  manga(slug: $slug) {
    id slug type status rating score views chapters
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
    mainStaff { roles person { name } }
    cover { main: resize(width: 600, height: 850, format: WEBP) { url } }
    branches {
      id lang chapters primaryBranch
      primaryTeamActivities { team { id name } }
    }
  }
}`;

// Chapter list — paginated by branchId.
const Q_CHAPTERS = `query fetchMangaChapters($branchId: ID!, $after: String, $orderBy: MangaChapterOrder!) {
  mangaChapters(first: 100, branchId: $branchId, after: $after, orderBy: $orderBy) {
    edges { node { id slug name number volume createdAt } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Chapter pages by slug. Senkuro caps quality<=80; 1200px max width.
const Q_CHAPTER = `query fetchMangaChapter($slug: String!, $cdnQuality: String) {
  mangaChapter(slug: $slug) {
    id slug name number volume
    pages(cdnQuality: $cdnQuality) {
      number
      image {
        original { url width height }
        compress: resize(width: 1200, quality: 80, format: WEBP) { url }
      }
    }
  }
}`;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get gqlHeaders() {
        const h = {
            "User-Agent": SK_UA,
            "Accept": "application/graphql-response+json, application/json, */*",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
            "Content-Type": "application/json",
            "Origin": this.source.baseUrl,
            "Referer": this.source.baseUrl + "/"
        };
        const prefs = new SharedPreferences();
        // Bearer from `access_token` cookie value — preferred (one field instead of full cookie).
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
        // the qjs binding's serialization). Try string FIRST (Apollo standard);
        // fall back to plain object body which gets form-encoded — Apollo accepts
        // application/x-www-form-urlencoded too if Content-Type is set right.
        const payload = { operationName, query, variables: variables || {} };
        const bodyStr = JSON.stringify(payload);
        let res = await this.client.post(this.source.apiUrl, this.gqlHeaders, bodyStr);
        if (!res || res.statusCode !== 200 || !res.body) {
            // Retry with body as object (some Mangayomi builds re-stringify objects correctly
            // but treat string body as form data)
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
    // Senkuro returns description as an array of nodes (paragraphs/headings/text).
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
        // Prefer Russian, fall back to English, then original.
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

    // Map MangaRating enum (GENERAL/SENSITIVE/QUESTIONABLE/EXPLICIT) to the
    // age label Senkognito itself shows on the title page (0+ / 12+ / 16+ / 18+).
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
        if (s === "ANNOUNCEMENT" || s === "PLANNED") return 4;
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

    // The rating filter that distinguishes Senkognito's catalog from Senkuro's.
    // Reads user override from prefs (default = EXPLICIT + QUESTIONABLE, matching the
    // senkognito.com homepage ground-truth behavior).
    nsfwRatingFilter() {
        const pref = (new SharedPreferences()).get("rating_mode") || "default";
        if (pref === "explicit_only") return { include: ["EXPLICIT"] };
        if (pref === "wide") return { include: ["EXPLICIT", "QUESTIONABLE", "SENSITIVE"] };
        if (pref === "all") return null;  // no filter — same catalog as Senkuro
        return { include: ["EXPLICIT", "QUESTIONABLE"] };  // default
    }

    // Translate Mangayomi filter UI state into GraphQL variables.
    // Filter slot map:
    //   [0] SortFilter, [1] Type, [2] Status, [3] Rating mode override, [4] Genres
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
            if (v) out.type = { include: [v] };
        }
        if (filters[2] && filters[2].values) {
            const v = filters[2].values[filters[2].state || 0].value;
            if (v) out.status = { include: [v] };
        }
        if (filters[3] && Array.isArray(filters[3].state)) {
            const include = [], exclude = [];
            for (const t of filters[3].state) {
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
        const rating = this.nsfwRatingFilter();
        let after = null;
        for (let i = 1; i <= page; i++) {
            const vars = Object.assign({ first: 30, after, orderField: field, orderDirection: "DESC", rating }, extraVars || {});
            const r = await this.gql("fetchMangas", Q_MANGAS, vars);
            if (r.error || !r.data || !r.data.mangas) {
                if (page === 1) {
                    return {
                        list: [{
                            name: `[Senkognito error] ${r.error || "no data"}`,
                            imageUrl: "",
                            link: "__error__"
                        }],
                        hasNextPage: false
                    };
                }
                return { list: [], hasNextPage: false };
            }
            const conn = r.data.mangas || {};
            if (i === page) return { list: this.mapEdges(conn.edges), hasNextPage: !!(conn.pageInfo && conn.pageInfo.hasNextPage) };
            after = conn.pageInfo && conn.pageInfo.endCursor;
            if (!after || !conn.pageInfo.hasNextPage) return { list: [], hasNextPage: false };
        }
        return { list: [], hasNextPage: false };
    }

    async getPopular(page) { return await this.fetchListByOrder("POPULARITY_SCORE", page); }
    async getLatestUpdates(page) { return await this.fetchListByOrder("LAST_CHAPTER_AT", page); }

    // Map result of `search(query, type)` operation. Returns SearchManga inline-fragment
    // nodes; we additionally filter by rating (the search op doesn't accept rating filter,
    // so we apply it client-side to keep Senkognito's NSFW-only flavor consistent).
    mapSearchEdges(edges) {
        const ratingFilter = this.nsfwRatingFilter();
        const allowed = ratingFilter && Array.isArray(ratingFilter.include) ? new Set(ratingFilter.include) : null;
        return (edges || []).map(e => {
            const n = (e && e.node) || {};
            if (n.__typename && n.__typename !== "SearchManga") return null;
            if (allowed && n.rating && !allowed.has(n.rating)) return null;
            return {
                name: this.pickTitle(n.titles, { content: n.originalName }),
                imageUrl: this.coverUrl(n.cover),
                link: n.slug || n.id || ""
            };
        }).filter(x => x && x.name && x.link);
    }

    async search(query, page, filters) {
        const q = (query || "").trim();
        if (q) {
            const r = await this.gql("search", Q_SEARCH, { query: q, first: 50 });
            if (r.error || !r.data) return { list: [], hasNextPage: false };
            const edges = (r.data.search && r.data.search.edges) || [];
            return { list: this.mapSearchEdges(edges), hasNextPage: false };
        }
        // Empty query: catalog with sort + status/type/genre filters applied
        // (rating filter is applied automatically inside fetchListByOrder).
        const f = this.parseFilters(filters);
        const extra = {};
        if (f.status) extra.status = f.status;
        if (f.type) extra.type = f.type;
        if (f.label) extra.label = f.label;
        return await this.fetchListByOrder(f.orderField, page, Object.assign({ orderDirection: f.orderDirection }, extra));
    }

    async getDetail(slug) {
        const r = await this.gql("fetchManga", Q_MANGA, { slug });
        if (r.error || !r.data || !r.data.manga) {
            return { name: slug, imageUrl: "", description: `(Ошибка GraphQL: ${r.error || "нет данных"})`, status: 5, genre: [], chapters: [] };
        }
        const m = r.data.manga;
        const name = this.pickTitle(m.titles, m.originalName);
        const altNames = (m.alternativeNames || []).map(a => a.content).filter(Boolean);

        // Description from localizations[].description (Tiptap tree → plain text).
        // Prefer Russian, fall back to English.
        let descriptionText = "";
        const locs = m.localizations || [];
        const ruLoc = locs.find(l => l && l.lang === "RU" && l.description);
        const enLoc = locs.find(l => l && l.lang === "EN" && l.description);
        const desc = ruLoc || enLoc;
        if (desc && desc.description) descriptionText = this.tiptapToText(desc.description);
        if (altNames.length) {
            const prefix = `Альт. названия: ${altNames.join(" / ")}`;
            descriptionText = descriptionText ? `${prefix}\n\n${descriptionText}` : prefix;
        }

        const labels = (m.labels || []).map(l => this.pickTitle(l.titles, null)).filter(Boolean);
        // Prepend age rating ("18+"/"16+"/etc.) as the first genre chip — most
        // Senkognito titles are 18+ so the badge becomes a visible header on
        // the detail page, matching senkognito.com's "18+" badge behavior.
        const ratingLabel = this.formatRating(m.rating);
        const genre = ratingLabel ? [ratingLabel].concat(labels) : labels;
        const author = (m.mainStaff || []).map(s => s.person && s.person.name).filter(Boolean).join(", ");
        const status = this.parseStatus(m.status);

        // Chapters — iterate over each branch's chapter list.
        // Sort: primary branch first (Russian translation), then by chapter count desc.
        const branches = (m.branches || []).slice().sort((a, b) => {
            if (a.primaryBranch && !b.primaryBranch) return -1;
            if (b.primaryBranch && !a.primaryBranch) return 1;
            return (b.chapters || 0) - (a.chapters || 0);
        });
        const chapters = [];
        for (const br of branches) {
            const branchId = br.id;
            const team = br.primaryTeamActivities && br.primaryTeamActivities[0] && br.primaryTeamActivities[0].team;
            const teamName = (team && team.name) || "";
            let after = null;
            for (let i = 0; i < 50; i++) {  // safety cap: 50 pages × 100 = 5000 chapters
                const cr = await this.gql("fetchMangaChapters", Q_CHAPTERS, {
                    branchId,
                    after,
                    orderBy: { field: "NUMBER", direction: "DESC" }
                });
                if (cr.error || !cr.data || !cr.data.mangaChapters) break;
                const conn = cr.data.mangaChapters;
                for (const e of (conn.edges || [])) {
                    const n = e.node || {};
                    const numLabel = n.number != null ? `Гл. ${n.number}` : "Глава";
                    const volLabel = n.volume != null ? `Том ${n.volume} · ` : "";
                    const titleLabel = n.name ? `: ${n.name}` : "";
                    chapters.push({
                        name: `${volLabel}${numLabel}${titleLabel}`,
                        url: n.slug || n.id,
                        dateUpload: n.createdAt ? new Date(n.createdAt).valueOf().toString() : Date.now().toString(),
                        scanlator: teamName || null
                    });
                }
                if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
                after = conn.pageInfo.endCursor;
            }
        }
        // Dedup by URL — branches sometimes overlap
        const seen = {};
        const dedup = [];
        for (const c of chapters) {
            if (seen[c.url]) continue;
            seen[c.url] = true;
            dedup.push(c);
        }

        return {
            name: name || slug,
            imageUrl: this.coverUrl(m.cover),
            description: descriptionText,
            author,
            genre,
            status,
            chapters: dedup
        };
    }

    async getPageList(url) {
        // url is the chapter slug (e.g. "205606528672089619") or chapter ID
        const slug = String(url || "");
        const cdnPref = (new SharedPreferences()).get("page_quality") || "auto";
        const r = await this.gql("fetchMangaChapter", Q_CHAPTER, {
            slug,
            cdnQuality: cdnPref
        });
        if (r.error || !r.data || !r.data.mangaChapter) return [];
        const ch = r.data.mangaChapter;
        const useCompress = (cdnPref !== "original");
        const headers = {
            "User-Agent": SK_UA,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": this.source.baseUrl + "/"
        };
        return (ch.pages || [])
            .sort((a, b) => (a.number || 0) - (b.number || 0))
            .map(p => {
                const img = p.image || {};
                const u = useCompress ? ((img.compress && img.compress.url) || (img.original && img.original.url) || "")
                                       : ((img.original && img.original.url) || (img.compress && img.compress.url) || "");
                return { url: u, headers };
            })
            .filter(p => p.url);
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
                    ["По количеству глав", "CHAPTERS"],
                    ["По просмотрам", "VIEWS"],
                    ["По дате создания", "CREATED_AT"],
                    ["По дате залива (последняя глава)", "LAST_CHAPTER_AT"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "type",
                name: "Тип",
                state: 0,
                values: SK_TYPES.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "SelectFilter",
                type: "status",
                name: "Статус",
                state: 0,
                values: SK_STATUSES.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "genres",
                name: "Жанры (тап = включить, ещё тап = исключить)",
                state: SK_GENRES.map(x => ({ type_name: "TriState", name: x[1], value: x[0] }))
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "rating_mode",
                listPreference: {
                    title: "Что показывать в каталоге",
                    summary: "По умолчанию каталог Senkognito ограничен NSFW (EXPLICIT+QUESTIONABLE) — как на самом сайте. \"Шире\" добавляет SENSITIVE. \"Всё\" снимает фильтр (тогда каталог становится таким же как Senkuro).",
                    valueIndex: 0,
                    entries: ["NSFW (по умолчанию: EXPLICIT+QUESTIONABLE)", "Только EXPLICIT", "Шире (+SENSITIVE)", "Всё (без фильтра)"],
                    entryValues: ["default", "explicit_only", "wide", "all"]
                }
            },
            {
                key: "page_quality",
                listPreference: {
                    title: "Качество страниц",
                    summary: "Auto/compress = быстро (700-1200px WEBP). Original = оригинал JPEG.",
                    valueIndex: 0,
                    entries: ["Авто (700-1200px WEBP)", "Оригинал (полное качество)"],
                    entryValues: ["auto", "original"]
                }
            },
            {
                key: "bearer_token",
                editTextPreference: {
                    title: "Auth token (access_token)",
                    summary: "Самый простой способ передать сессию. Войди на senkognito.com в браузере → F12 → Application → Cookies → senkognito.com → найди cookie с именем `access_token` → скопируй его Value (длинная строка вида v4.local.X...) → вставь сюда. Префикс 'Bearer ' добавлять НЕ надо.",
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
