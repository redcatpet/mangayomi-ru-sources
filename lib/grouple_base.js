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
    return {
        "User-Agent": GROUPLE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Referer": "https://www.google.com/"
    };
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

    // Title
    const nameEl = doc.selectFirst("h1.names span.name") || doc.selectFirst("span.name") || doc.selectFirst("h1.names");
    const name = nameEl ? nameEl.text.trim() : "";

    // Cover
    let imageUrl = "";
    const picImg = doc.selectFirst("div.picture-fotorama img");
    if (picImg) {
        imageUrl = picImg.attr("data-full") || picImg.attr("data-thumb") || picImg.attr("src") || "";
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = imageUrl.startsWith("//") ? "https:" + imageUrl : groupleAbs(baseUrl, imageUrl);
        }
    }

    // Description — meta[itemprop=description] has the full text
    let description = "";
    const metaDesc = doc.selectFirst("meta[itemprop=description]");
    if (metaDesc) description = (metaDesc.attr("content") || "").trim();
    if (!description) {
        const d = doc.selectFirst("div.manga-description");
        if (d) description = d.text.trim();
    }

    // Author / artist / genre — Aidoku pattern: span.elem_{X} > a.{person|element}-link
    const extractLinks = (elemClass, linkType) => {
        return doc.select(`span.elem_${elemClass} a.${linkType}-link`).map(e => e.text.trim()).filter(x => x);
    };
    const author = extractLinks("author", "person").concat(extractLinks("screenwriter", "person")).join(", ");
    const artist = extractLinks("illustrator", "person").join(", ");
    const genre = extractLinks("genre", "element").concat(extractLinks("tag", "element"));

    // Status text
    let statusText = "";
    const metas = doc.select("p.subject-meta");
    for (const m of metas) {
        const txt = m.text;
        if (txt && txt.indexOf("Статус тайтла") >= 0) { statusText = txt; break; }
    }
    if (!statusText) {
        const anyMeta = doc.selectFirst(".subject-meta");
        if (anyMeta) statusText = anyMeta.text || "";
    }
    const status = groupleStatus(statusText);

    // Chapters — Aidoku selector matches rows that actually have a chapter link
    const chapters = [];
    const rows = doc.select("div.chapters-link table tr, table.table-chapters tr, div.chapters-link tr");
    for (const row of rows) {
        const a = row.selectFirst("a.chapter-link, a[href*='/vol'], a");
        if (!a) continue;
        const href = a.attr("href");
        if (!href) continue;
        // Skip empty/nav rows
        if (href === "/" || href.indexOf("#") === 0) continue;
        const fullTitle = (a.text || "").replace(" новое", "").trim();
        if (!fullTitle) continue;
        // Strip leading numbers like "1 - 1 ..." to "..."
        let title = fullTitle.replace(/^[\d\s\-]+/, "");
        if (!title) title = fullTitle;

        // Date from td[data-date-raw] or last td
        let dateTxt = "";
        const dateTd = row.selectFirst("td[data-date-raw]");
        if (dateTd) dateTxt = dateTd.attr("data-date-raw") || dateTd.text;
        if (!dateTxt) {
            const tds = row.select("td");
            if (tds.length) dateTxt = (tds[tds.length - 1].text || "").trim();
        }

        // Scanlator from title attr (minus "(Переводчик)")
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

// Common filter list — genres are shared across Grouple sites (subset for MVP)
function groupleFilterList() {
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
        }
    ];
}

// Reusable base class — subclass in each Grouple source file and optionally
// override getBaseUrl() to expose mirror-switching UI.
class GroupleBase extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getBaseUrl() {
        const override = (new SharedPreferences()).get("override_base_url");
        if (override && override.trim()) {
            return override.trim().replace(/\/$/, "");
        }
        return this.source.baseUrl;
    }

    async getPopular(page) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(groupleListUrl(baseUrl, "RATING", page), groupleHeaders(baseUrl));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return groupleParseList(res.body, baseUrl);
    }

    async getLatestUpdates(page) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(groupleListUrl(baseUrl, "UPDATED", page), groupleHeaders(baseUrl));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return groupleParseList(res.body, baseUrl);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        let sort = "RATING";
        if (filters && filters[0] && filters[0].values) {
            const idx = (filters[0].state && filters[0].state.index) || 0;
            sort = filters[0].values[idx].value;
        }
        const offset = (page - 1) * 70;
        const url = `${baseUrl}/search/advancedResults?q=${encodeURIComponent(query || "")}&offset=${offset}&sortType=${sort}`;
        const res = await this.client.get(url, groupleHeaders(baseUrl));
        if (res.statusCode !== 200) return { list: [], hasNextPage: false };
        return groupleParseList(res.body, baseUrl);
    }

    async getDetail(url) {
        return await groupleGetDetail(this.client, this.getBaseUrl(), url);
    }

    async getPageList(url) {
        return await groupleGetPageList(this.client, this.getBaseUrl(), url);
    }

    getFilterList() {
        return groupleFilterList();
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Переопределить baseUrl",
                summary: "Альтернативный mirror при блокировке. Без слеша в конце. Оставьте пустым для значения по умолчанию.",
                value: "",
                dialogTitle: "Base URL",
                dialogMessage: "Например: https://web.usagi.one"
            }
        }];
    }
}
