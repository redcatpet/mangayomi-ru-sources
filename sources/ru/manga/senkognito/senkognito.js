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
    "version": "0.2.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "ru/manga/senkognito.js",
    "notes": "NSFW-сестра Senkuro. GraphQL API api.senkognito.com/graphql. Каталог фильтруется по rating={EXPLICIT,QUESTIONABLE} — как на самом сайте. Для авторизации лучше всего использовать поле `Auth token` — это значение cookie `access_token` из браузера (DevTools → Cookies → senkognito.com)."
}];

const SK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// ---- GraphQL queries (extracted from the app's main bundle) ----
//
// Catalog/search. The server's "mangas" query supports many filters; we expose the most
// useful ones (search text, order). orderField enum: SCORE | VIEWS | CREATED_AT | POPULARITY_SCORE.
//
// Senkognito differs from Senkuro by ALWAYS passing a `rating` filter that limits
// results to NSFW/sensitive ratings. The filter shape is:
//   rating: { include: [EXPLICIT, QUESTIONABLE, ...] }
// Without this filter the API returns the full Senkuro catalog (because both sites
// share one backend), which is why earlier versions showed SFW manga on Senkognito.
const Q_MANGAS = `query fetchMangas($first: Int = 30, $after: String, $search: String, $rating: MangaRatingFilter, $orderField: MangaOrderField = POPULARITY_SCORE, $orderDirection: OrderDirection = DESC) {
  mangas(first: $first, after: $after, orderBy: {field: $orderField, direction: $orderDirection}, search: $search, rating: $rating) {
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

    async fetchListByOrder(field, page) {
        // Senkognito uses cursor-based pagination — emulate page-based by walking from p=1.
        // For p>1 we re-walk from start (Mangayomi catalog scrolls page-by-page so this
        // is acceptable: each page is one extra round-trip).
        const rating = this.nsfwRatingFilter();
        let after = null;
        for (let i = 1; i <= page; i++) {
            const r = await this.gql("fetchMangas", Q_MANGAS, { first: 30, after, orderField: field, orderDirection: "DESC", rating });
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
    async getLatestUpdates(page) { return await this.fetchListByOrder("CREATED_AT", page); }

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
        // Text search: top-level `search` operation indexes ALL title localizations
        // (Cyrillic queries actually find results, unlike `mangas(search:)`).
        // Rating filter is applied client-side after fetch.
        if (q) {
            const r = await this.gql("search", Q_SEARCH, { query: q, first: 50 });
            if (r.error || !r.data) return { list: [], hasNextPage: false };
            const edges = (r.data.search && r.data.search.edges) || [];
            return { list: this.mapSearchEdges(edges), hasNextPage: false };
        }
        // No query: catalog with sort filter.
        let orderField = "POPULARITY_SCORE";
        if (filters && filters[0] && filters[0].values) {
            const idx = (filters[0].state && filters[0].state.index != null) ? filters[0].state.index : 0;
            orderField = filters[0].values[idx].value || orderField;
        }
        return await this.fetchListByOrder(orderField, page);
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

        const genre = (m.labels || []).map(l => this.pickTitle(l.titles, null)).filter(Boolean);
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
                    ["По просмотрам", "VIEWS"],
                    ["По дате добавления", "CREATED_AT"]
                ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
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
