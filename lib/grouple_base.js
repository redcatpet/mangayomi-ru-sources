// === grouple_base.js ===
// Shared helpers for Grouple-engine sites: ReadManga, MintManga, SelfManga,
// AllHentai, Usagi, SeiManga, ZazaZa. They all share one HTML template.
// Usage: this file is prepended to each Grouple extension at build time
// (via `// @include: grouple_base` directive in the source file).
//
// Pagination is offset-based with step 70.

const GROUPLE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GROUPLE_PAGE_SIZE = 70;

function groupleHeaders(baseUrl) {
    return {
        "User-Agent": GROUPLE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Referer": baseUrl + "/"
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
    const tiles = doc.select("div.tile.col-sm-6");
    const list = [];
    for (const tile of tiles) {
        const linkEl = tile.selectFirst("div.img a") || tile.selectFirst("h3 a");
        if (!linkEl) continue;
        const link = linkEl.attr("href");
        if (!link) continue;
        const imgEl = tile.selectFirst("div.img img") || tile.selectFirst("img");
        let imageUrl = "";
        if (imgEl) {
            imageUrl = imgEl.attr("data-original") || imgEl.attr("data-src") || imgEl.attr("src") || "";
            imageUrl = groupleAbs(baseUrl, imageUrl);
        }
        let name = "";
        const h3a = tile.selectFirst("h3 a");
        if (h3a) name = (h3a.attr("title") || h3a.text || "").trim();
        if (!name) name = (linkEl.attr("title") || linkEl.text || "").trim();

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

    const nameEl = doc.selectFirst("span.name") || doc.selectFirst("h1.names .name");
    const name = nameEl ? nameEl.text.trim() : "";

    let imageUrl = "";
    const picImg = doc.selectFirst("div.picture-fotorama img");
    if (picImg) {
        imageUrl = picImg.attr("data-full") || picImg.attr("src") || "";
        imageUrl = groupleAbs(baseUrl, imageUrl);
    }

    let description = "";
    const descMeta = doc.selectFirst("div.manga-description meta[itemprop=description]");
    if (descMeta) description = descMeta.attr("content") || "";
    if (!description) {
        const d = doc.selectFirst("div.manga-description");
        if (d) description = d.text.trim();
    }

    const author = doc.select("span.elem_author a").map(e => e.text.trim()).join(", ");
    const artist = doc.select("span.elem_illustrator a").map(e => e.text.trim()).join(", ");
    const genre = doc.select("span.elem_genre a.element-link").map(e => e.text.trim());

    // Status — in p.subject-meta there's a line "Статус тайтла: ..."
    let statusText = "";
    const metas = doc.select("p.subject-meta");
    for (const m of metas) {
        const txt = m.text;
        if (txt.includes("Статус тайтла")) { statusText = txt; break; }
    }
    const status = groupleStatus(statusText);

    // Chapters live in div.chapters-link table tr (each row has a link + date cell)
    const chapters = [];
    const rows = doc.select("div.chapters-link table tr");
    for (const row of rows) {
        const a = row.selectFirst("a");
        if (!a) continue;
        const href = a.attr("href");
        if (!href) continue;
        const chName = a.text.trim();
        if (!chName) continue;
        // Date: last td or td with "hidden-xxs"
        const dateEl = row.selectFirst("td.hidden-xxs")
                    || row.select("td").slice(-1)[0]
                    || null;
        const dateTxt = dateEl ? dateEl.text.trim() : "";
        chapters.push({
            name: chName,
            url: href + (href.includes("?") ? "&" : "?") + "mtr=1",
            dateUpload: groupleParseDate(dateTxt).toString(),
            scanlator: null
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

// Parse page list from reader HTML — rm_h.initReader([[..., [["srv","","path",w,h], ...]]], 0)
async function groupleGetPageList(client, baseUrl, chapterUrl) {
    const url = groupleAbs(baseUrl, chapterUrl);
    const res = await client.get(url, groupleHeaders(baseUrl));
    const body = res.body;

    const idx = body.indexOf("rm_h.initReader");
    if (idx < 0) {
        // Fallback newer method
        const i2 = body.indexOf("readerDoInit");
        if (i2 < 0) return [];
    }
    const startMarker = body.indexOf("[[", idx);
    if (startMarker < 0) return [];
    // Find matching "]]" — we assume the first ]] closes the inner array
    // inner structure: [["srv","","path",w,h],["srv","","path",w,h],...]
    const endMarker = body.indexOf("]]", startMarker);
    if (endMarker < 0) return [];
    const inner = body.substring(startMarker + 2, endMarker);
    // Split by "],[" but be careful — inner may contain commas in strings
    const parts = inner.split(/\],\s*\[/);
    const pages = [];
    for (const raw of parts) {
        const cleaned = raw.replace(/^\[/, "").replace(/\]$/, "");
        // Extract first three quoted strings (server, empty, path)
        const m = cleaned.match(/"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/);
        if (!m) continue;
        const host = m[1] || "";
        const path = m[3] || "";
        if (!path) continue;
        const full = host + path;
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
