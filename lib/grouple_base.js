// === grouple_base.js ===
// Shared helpers for Grouple-engine sites: ReadManga, MintManga, SelfManga,
// AllHentai, Usagi, SeiManga, ZazaZa. They all share one HTML template.
// Usage: this file is prepended to each Grouple extension at build time
// (via `// @include: grouple_base` directive in the source file).
//
// Pagination is offset-based with step 70.

const GROUPLE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GROUPLE_PAGE_SIZE = 50;

function groupleHeaders(baseUrl) {
    // Referer must be set to google.com to bypass anti-hotlink filtering;
    // mirror domains 403 requests from unknown referers.
    const h = {
        "User-Agent": GROUPLE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Referer": "https://www.google.com/"
    };
    // Optional session cookie — Grouple sites (esp. MintManga, AllHentai) serve
    // /static/deleted1.png placeholders for all chapters when not logged in.
    // Paste full cookie string from DevTools → Application → Cookies.
    const cookie = (new SharedPreferences()).get("grouple_session_cookie");
    if (cookie && cookie.trim()) h["Cookie"] = cookie.trim();
    return h;
}

function groupleAbs(baseUrl, u) {
    if (!u) return "";
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/")) return baseUrl + u;
    if (u.startsWith("http")) return u;
    return baseUrl + "/" + u;
}

function groupleParseDate(text) {
    if (!text) return Date.now();
    const t = text.toLowerCase();
    const now = new Date();
    if (t.includes("сегодня")) return now.getTime();
    if (t.includes("вчера")) return now.getTime() - 86400000;
    // DD.MM.YY or DD.MM.YYYY
    const m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) {
        let y = parseInt(m[3]);
        if (y < 100) y += 2000;
        return new Date(y, parseInt(m[2]) - 1, parseInt(m[1])).getTime();
    }
    return Date.now();
}

function groupleStatus(text) {
    if (!text) return 5;
    const t = text.toLowerCase();
    if (t.includes("продолжается") || t.includes("выходит") || t.includes("онгоинг")) return 0;
    if (t.includes("лицензирова") || t.includes("завершен") || t.includes("завершён")) return 1;
    if (t.includes("заморожен") || t.includes("приостанов")) return 2;
    if (t.includes("прекращ") || t.includes("брошен")) return 3;
    return 5;
}

// Parse a catalog/search listing page. Returns {list, hasNextPage}.
// Selectors come from Grouple template (stable for >5 years across mirrors).
function groupleParseList(htmlBody, baseUrl) {
    const doc = new Document(htmlBody);
    // Selector is just "div.tile" (the card also has .col-sm-6 and el_NNN but base class is tile)
    const tiles = doc.select("div.tile");
    const list = [];
    for (const tile of tiles) {
        const linkEl = tile.selectFirst("div.img a.non-hover") || tile.selectFirst("div.img a") || tile.selectFirst("h3 a");
        if (!linkEl) continue;
        const link = linkEl.attr("href");
        if (!link) continue;
        // Image — prefer data-original (lazy), fall back to src/data-src/original
        const imgEl = tile.selectFirst("div.img img") || tile.selectFirst("img");
        let imageUrl = "";
        let imgTitle = "";
        if (imgEl) {
            imageUrl = imgEl.attr("data-original") || imgEl.attr("original") || imgEl.attr("data-src") || imgEl.attr("src") || "";
            imgTitle = (imgEl.attr("title") || "").trim();
            if (imageUrl) {
                imageUrl = imageUrl.startsWith("//") ? "https:" + imageUrl : groupleAbs(baseUrl, imageUrl);
            }
        }
        // Title — prefer img[title], then h3 a title/text, then linkEl
        let name = imgTitle;
        if (!name) {
            const h3a = tile.selectFirst("h3 a");
            if (h3a) name = (h3a.attr("title") || h3a.text || "").trim();
        }
        if (!name) name = (linkEl.attr("title") || linkEl.text || "").trim();
        if (!name) continue;

        list.push({
            name: name,
            imageUrl: imageUrl,
            link: link.startsWith("http") ? link.replace(baseUrl, "") : link
        });
    }
    const hasNextPage = tiles.length >= GROUPLE_PAGE_SIZE;
    return { list: list, hasNextPage: hasNextPage };
}

// Build catalog URL with sorting + offset
function groupleListUrl(baseUrl, sort, page) {
    const offset = (page - 1) * GROUPLE_PAGE_SIZE;
    return `${baseUrl}/list?sortType=${sort}&offset=${offset}`;
}

async function groupleGetDetail(client, baseUrl, link) {
    const res = await client.get(groupleAbs(baseUrl, link), groupleHeaders(baseUrl));
    const doc = new Document(res.body);

    // Title — new 2026 layout uses cr-hero-names__main (fallback to legacy h1.names for usagi.one-style mirrors)
    const nameEl = doc.selectFirst("h1.cr-hero-names__main")
                || doc.selectFirst("h1.names span.name")
                || doc.selectFirst("span.name")
                || doc.selectFirst("h1.names")
                || doc.selectFirst("h1");
    const name = nameEl ? nameEl.text.trim() : "";

    // Cover — cr-hero-poster__img (new) or picture-fotorama (legacy)
    let imageUrl = "";
    const picImg = doc.selectFirst("img.cr-hero-poster__img")
                || doc.selectFirst("div.picture-fotorama img")
                || doc.selectFirst("img.manga-cover");
    if (picImg) {
        imageUrl = picImg.attr("data-src") || picImg.attr("data-full") || picImg.attr("data-thumb") || picImg.attr("src") || "";
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = imageUrl.startsWith("//") ? "https:" + imageUrl : groupleAbs(baseUrl, imageUrl);
        }
    }

    // Description
    let description = "";
    const metaDesc = doc.selectFirst("meta[itemprop=description]");
    if (metaDesc) description = (metaDesc.attr("content") || "").trim();
    if (!description) {
        const d = doc.selectFirst("div.cr-description__content") || doc.selectFirst("div.manga-description");
        if (d) description = d.text.trim();
    }

    // Author / artist / genre — new layout uses /list/person/ and /list/category/
    // (legacy layout used span.elem_author a.person-link + a.element-link)
    let persons = doc.select("a[href*='/list/person/']").map(e => e.text.replace(/\s+/g, " ").trim()).filter(x => x);
    // Dedup + drop entries that look like ratings/inflated text
    const seenPersons = {};
    persons = persons.filter(p => {
        if (seenPersons[p]) return false;
        seenPersons[p] = true;
        // Keep only short-ish names (real author names are <60 chars)
        return p.length < 60 && !/\d/.test(p);
    });
    const author = persons.length ? persons.join(", ")
        : doc.select("span.elem_author a.person-link, span.elem_screenwriter a.person-link").map(e => e.text.trim()).filter(x => x).join(", ");
    const artist = doc.select("span.elem_illustrator a.person-link").map(e => e.text.trim()).filter(x => x).join(", ");

    let genre = doc.select("a[href*='/list/category/']").map(e => e.text.trim()).filter(x => x);
    if (!genre.length) {
        genre = doc.select("span.elem_genre a.element-link, span.elem_tag a.element-link")
            .map(e => e.text.trim()).filter(x => x);
    }
    // Add genres from legacy /list/genre if present
    const legacyGenres = doc.select("a[href*='/list/genre/']").map(e => e.text.trim()).filter(x => x);
    for (const g of legacyGenres) if (genre.indexOf(g) < 0) genre.push(g);

    // Status — cr-info-details-item__status (new) or p.subject-meta text (legacy)
    let statusText = "";
    const statusEl = doc.selectFirst(".cr-info-details-item__status");
    if (statusEl) statusText = statusEl.text || "";
    if (!statusText) {
        const metas = doc.select("p.subject-meta");
        for (const m of metas) {
            const txt = m.text;
            if (txt && txt.indexOf("Статус тайтла") >= 0) { statusText = txt; break; }
        }
        if (!statusText) {
            const anyMeta = doc.selectFirst(".subject-meta");
            if (anyMeta) statusText = anyMeta.text || "";
        }
    }
    const status = groupleStatus(statusText);

    // Chapters — new layout: tr.item-row > td.item-title > a.chapter-link.cp-l
    // Legacy: div.chapters-link table tr > a.chapter-link
    const chapters = [];
    let rows = doc.select("tr.item-row");
    if (!rows.length) rows = doc.select("div.chapters-link table tr, table.table-chapters tr");
    for (const row of rows) {
        const a = row.selectFirst("a.chapter-link.cp-l")
               || row.selectFirst("a.chapter-link")
               || row.selectFirst("a[href*='/vol']")
               || row.selectFirst("a");
        if (!a) continue;
        const href = a.attr("href");
        if (!href) continue;
        if (href === "/" || href.indexOf("#") === 0) continue;
        const fullTitle = (a.text || "").replace(" новое", "").trim();
        if (!fullTitle) continue;
        let title = fullTitle.replace(/^[\d\s\-]+/, "");
        if (!title) title = fullTitle;

        let dateTxt = "";
        const dateTd = row.selectFirst("td[data-date-raw]");
        if (dateTd) dateTxt = dateTd.attr("data-date-raw") || dateTd.text;
        if (!dateTxt) {
            const dCell = row.selectFirst("td.date") || row.selectFirst("td[data-date]");
            if (dCell) dateTxt = dCell.attr("data-date-raw") || dCell.attr("data-date") || dCell.text;
        }
        if (!dateTxt) {
            const tds = row.select("td");
            if (tds.length) dateTxt = (tds[tds.length - 1].text || "").trim();
        }

        const scanlator = ((a.attr("title") || "").replace(" (Переводчик)", "").trim()) || null;

        chapters.push({
            name: title,
            url: href + (href.indexOf("?") >= 0 ? "&" : "?") + "mtr=true",
            dateUpload: groupleParseDate(dateTxt).toString(),
            scanlator: scanlator
        });
    }

    return {
        name: name,
        imageUrl: imageUrl,
        description: description,
        author: author,
        artist: artist,
        status: status,
        genre: genre,
        chapters: chapters
    };
}

// Parse page list from reader HTML.
// The actual JS call on modern Grouple sites is:
//   readerInit(chapterInfo, [['https://host/','',"path",w,h], ...])
// Entries use MIXED quotes — host/empty are single-quoted, path is double-quoted.
// Older sites used `rm_h.initReader(...)` with all-single-quoted entries.
async function groupleGetPageList(client, baseUrl, chapterUrl) {
    const url = groupleAbs(baseUrl, chapterUrl);
    const res = await client.get(url, groupleHeaders(baseUrl));
    const body = res.body || "";

    // Locate the outer array literal passed to the reader-init function.
    let idx = body.indexOf("readerInit(");
    if (idx < 0) idx = body.indexOf("rm_h.initReader(");
    if (idx < 0) idx = body.indexOf("rm_h.readerDoInit(");
    if (idx < 0) return [];

    // Find the second argument array: first "[[" after the marker
    const startMarker = body.indexOf("[[", idx);
    if (startMarker < 0) return [];
    const endMarker = body.indexOf("]]", startMarker);
    if (endMarker < 0) return [];

    const inner = body.substring(startMarker + 1, endMarker + 1); // e.g. "[host,'',path,w,h],[...]"
    const pages = [];
    // Each entry is `['host','',"path",w,h]` — capture 3 quoted tokens
    const entryRe = /\[\s*(['"])([^'"]*)\1\s*,\s*(['"])([^'"]*)\3\s*,\s*(['"])([^'"]*)\5\s*(?:,\s*[^\]]+)?\]/g;
    let m;
    while ((m = entryRe.exec(inner)) !== null) {
        const host = m[2] || "";
        const extra = m[4] || "";
        const path = m[6] || "";
        let full;
        if (extra && extra.startsWith("/manga/")) {
            full = host + path;
        } else if (!host && path.startsWith("/static/")) {
            full = baseUrl + path;
        } else if (host) {
            full = host + extra + path;
        } else {
            full = path;
        }
        if (!/^https?:/.test(full)) {
            if (full.startsWith("//")) full = "https:" + full;
            else full = "https:" + full;
        }
        // Strip ?query from one-way.work placeholders where chapters sometimes have expiring tokens
        if (full.indexOf("one-way.work") >= 0 && full.indexOf("?") > 0) {
            full = full.substring(0, full.indexOf("?"));
        }
        pages.push({ url: full, headers: groupleHeaders(baseUrl) });
    }
    return pages;
}

// Common filter list — sort + genre slug list (shared across Grouple sites: readmanga, mintmanga, selfmanga, allhentai).
function groupleFilterList() {
    const genres = [
        ["Арт", "art"], ["Боевик", "action"], ["Боевые искусства", "martial_arts"],
        ["Вампиры", "vampires"], ["Гарем", "harem"], ["Гендерная интрига", "gender_intriga"],
        ["Героическое фэнтези", "heroic_fantasy"], ["Детектив", "detective"],
        ["Дзёсэй", "josei"], ["Додзинси", "doujinshi"], ["Драма", "drama"],
        ["Игра", "game"], ["Исэкай", "isekai"], ["История", "historical"],
        ["Киберпанк", "cyberpunk"], ["Кодомо", "codomo"], ["Комедия", "comedy"],
        ["Махо-сёдзё", "maho-shoujo"], ["Меха", "mecha"], ["Мистика", "mystery"],
        ["Музыка", "music"], ["Научная фантастика", "sci_fi"], ["Повседневность", "slice_of_life"],
        ["Постапокалиптика", "post_apocalyptic"], ["Приключения", "adventure"],
        ["Психология", "psychological"], ["Романтика", "romance"],
        ["Сверхъестественное", "supernatural"], ["Сёдзё", "shoujo"],
        ["Сёдзё-ай", "shoujo_ai"], ["Сёнэн", "shounen"], ["Сёнэн-ай", "shounen_ai"],
        ["Спорт", "sports"], ["Сэйнэн", "seinen"], ["Трагедия", "tragedy"],
        ["Триллер", "thriller"], ["Ужасы", "horror"], ["Фантастика", "fantasy"],
        ["Фэнтези", "fantastic"], ["Школа", "school"], ["Этти", "ecchi"]
    ];
    return [
        {
            type_name: "SortFilter",
            type: "sort",
            name: "Сортировка",
            state: { type_name: "SortState", index: 0, ascending: false },
            values: [
                ["Популярность", "RATING"],
                ["Просмотры", "POPULARITY"],
                ["Обновлённое", "UPDATED"],
                ["Новое", "CREATED"],
                ["Имя", "NAME"]
            ].map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
        },
        {
            type_name: "SelectFilter",
            type: "genre",
            name: "Жанр",
            state: 0,
            values: [["Любой", ""]].concat(genres).map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] }))
        },
        {
            type_name: "GroupFilter",
            type: "flags",
            name: "Доп. фильтры",
            state: [
                ["Высокий рейтинг", "s_high_rate"],
                ["Одиночные", "s_single"],
                ["Для взрослых", "s_mature"],
                ["Переведено", "s_translated"],
                ["Брошенные", "s_abandoned_popular"],
                ["Много глав", "s_many_chapters"],
                ["Ожидает загрузки", "s_wait_upload"]
            ].map(x => ({ type_name: "CheckBox", name: x[0], value: x[1] }))
        }
    ];
}

// Build a catalog URL that honors filter state.
function groupleSearchUrl(baseUrl, query, page, filters) {
    const offset = (page - 1) * 70;
    // Resolve sort
    let sort = "RATING";
    let asc = false;
    if (filters && filters[0] && filters[0].values) {
        const idx = (filters[0].state && filters[0].state.index) || 0;
        sort = filters[0].values[idx].value;
        asc = !!(filters[0].state && filters[0].state.ascending);
    }
    // Genre slug (single-select)
    let genreSlug = "";
    if (filters && filters[1] && filters[1].values) {
        const idx = filters[1].state || 0;
        genreSlug = filters[1].values[idx].value;
    }
    // Flags
    const flagPairs = [];
    if (filters && filters[2] && filters[2].state) {
        for (const f of filters[2].state) if (f.state) flagPairs.push(`${f.value}=1`);
    }

    let url;
    if (query) {
        // Advanced search endpoint
        url = `${baseUrl}/search/advancedResults?q=${encodeURIComponent(query)}&offset=${offset}&sortType=${sort}${asc ? "&sortDirection=ASC" : ""}`;
        if (genreSlug) url += `&el_${genreSlug}=1`;
    } else if (genreSlug) {
        // Genre-scoped listing
        url = `${baseUrl}/list/genre/${genreSlug}?sortType=${sort}&offset=${offset}${asc ? "&sortDirection=ASC" : ""}`;
    } else {
        // Plain listing
        url = `${baseUrl}/list?sortType=${sort}&offset=${offset}${asc ? "&sortDirection=ASC" : ""}`;
    }
    for (const fp of flagPairs) url += `&${fp}`;
    return url;
}

// Base URL resolver: respects user override from SharedPreferences
function groupleBaseUrlFrom(source) {
    const override = (new SharedPreferences()).get("override_base_url");
    if (override && override.trim()) {
        return override.trim().replace(/\/$/, "");
    }
    return source.baseUrl;
}

// Shared preferences definition — same for every Grouple source
function groupleSourcePreferences() {
    return [
        {
            key: "override_base_url",
            editTextPreference: {
                title: "Переопределить baseUrl",
                summary: "Альтернативный mirror при блокировке. Без слеша в конце. Оставьте пустым для значения по умолчанию.",
                value: "",
                dialogTitle: "Base URL",
                dialogMessage: "Например: https://web.usagi.one"
            }
        },
        {
            key: "grouple_session_cookie",
            editTextPreference: {
                title: "Session cookie",
                summary: "Опционально. Если читалка показывает заглушку 'тебе сюда нельзя' / deleted1.png — нужна авторизованная сессия. Скопируй ВСЮ строку Cookie из DevTools (F12) → Application → Cookies на этом сайте после логина и вставь сюда.",
                value: "",
                dialogTitle: "Cookie",
                dialogMessage: "Пример: PHPSESSID=abc...; user_id=12345; user_token=def..."
            }
        }
    ];
}
