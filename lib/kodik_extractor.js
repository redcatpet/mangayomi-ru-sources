// === kodik_extractor.js ===
// Universal Kodik iframe -> direct HLS/MP4 resolver.
// Used by animego, animelib, animedia, anixart, yummyanime — any site that
// embeds `//kodikplayer.com/seria/{id}/{hash}/{q}` or similar iframes.
//
// Flow:
//   1. Fetch the iframe HTML.
//   2. Parse `urlParams = '{"d":..,"d_sign":..,"pd":..,"pd_sign":..,"ref":..,"ref_sign":..}'`.
//   3. Extract type/id/hash from the iframe path.
//   4. POST those values (form-urlencoded) to `https://{pd}/ftor`.
//   5. Response: `{links: {ugly:[{src}], bad:[...], good:[...]}}` — keys map to 360/480/720.
//   6. Each `src` is ROT18-rotated + base64; decode into an HLS URL.

// --- helpers ---

function kodikBase64Decode(s) {
    // Tolerate URL-safe alphabet + missing padding
    let str = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = str.length % 4;
    if (pad) str += "=".repeat(4 - pad);
    if (typeof atob === "function") {
        try { return atob(str); } catch (e) { /* fall through */ }
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < str.length; i += 4) {
        const c1 = chars.indexOf(str.charAt(i));
        const c2 = chars.indexOf(str.charAt(i + 1));
        const c3p = str.charAt(i + 2) === "=" ? 0 : chars.indexOf(str.charAt(i + 2));
        const c4p = str.charAt(i + 3) === "=" ? 0 : chars.indexOf(str.charAt(i + 3));
        if (c1 < 0 || c2 < 0) break;
        const n = (c1 << 18) | (c2 << 12) | (c3p << 6) | c4p;
        out += String.fromCharCode((n >> 16) & 0xff);
        if (str.charAt(i + 2) !== "=") out += String.fromCharCode((n >> 8) & 0xff);
        if (str.charAt(i + 3) !== "=") out += String.fromCharCode(n & 0xff);
    }
    return out;
}

// ROT18-ish: shift each letter +18 wrapping within its case (matches kodik player.js inline atob)
function kodikRot18Decode(t) {
    if (!t) return "";
    const rotated = String(t).replace(/[a-zA-Z]/g, function (ch) {
        const max = ch <= "Z" ? 90 : 122;
        const code = ch.charCodeAt(0) + 18;
        return String.fromCharCode(max >= code ? code : code - 26);
    });
    return kodikBase64Decode(rotated);
}

function kodikDecodeSrc(src) {
    if (!src) return "";
    const s = String(src);
    // Some kodik responses already return a URL with "//"; use as-is
    if (s.indexOf("//") >= 0) return s.startsWith("http") ? s : ("https:" + s);
    const decoded = kodikRot18Decode(s);
    if (!decoded) return "";
    return decoded.startsWith("http") ? decoded : ("https:" + decoded);
}

// Parse `{host}` and path parts from a kodikplayer-like URL, tolerating `//` prefix.
function kodikParseUrl(raw) {
    if (!raw) return null;
    let u = String(raw);
    if (u.startsWith("//")) u = "https:" + u;
    if (!/^https?:\/\//.test(u)) return null;
    const m = u.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/);
    if (!m) return null;
    const host = m[1];
    const path = m[2] || "";
    const parts = path.split("/").filter(function (x) { return x; });
    // Expected: [type, id, hash, quality?]
    return {
        full: u,
        host: host,
        type: parts[0] || "",
        id: parts[1] || "",
        hash: parts[2] || ""
    };
}

// Fetch a Kodik `serial/{id}/{hash}/{q}` iframe and enumerate all episodes inside it.
// Returns an array of { season, episode, title, id, hash, translationTitle } — each
// item can be converted to a seria URL via kodikBuildSeriaUrl().
async function kodikFetchSerialEpisodes(client, serialUrl, refererUrl) {
    const parsed = kodikParseUrl(serialUrl);
    if (!parsed || parsed.type !== "serial") return [];
    const pageHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Referer": refererUrl || "https://"
    };
    let res;
    try { res = await client.get(parsed.full, pageHeaders); } catch (e) { return []; }
    if (!res || res.statusCode !== 200 || !res.body) return [];
    const body = res.body;

    // Extract current season from serial-seasons-box (if any — fallback season=1)
    let currentSeason = "1";
    const seasonSelect = body.match(/<div[^>]*class="[^"]*serial-seasons-box[^"]*"[^>]*>[\s\S]*?<select[^>]*>([\s\S]*?)<\/select>/);
    if (seasonSelect) {
        const sel = seasonSelect[1].match(/<option[^>]*selected[^>]*value="([^"]+)"/);
        const any = sel || seasonSelect[1].match(/<option[^>]*value="([^"]+)"/);
        if (any) currentSeason = any[1];
    }

    // Episode selector — serial-series-box
    const seriesBlock = body.match(/<div[^>]*class="[^"]*serial-series-box[^"]*"[^>]*>[\s\S]*?<select[^>]*>([\s\S]*?)<\/select>/);
    if (!seriesBlock) return [];
    const options = [];
    const optRe = /<option[^>]*value="([^"]+)"[^>]*data-id="([^"]+)"[^>]*data-hash="([^"]+)"[^>]*(?:data-title="([^"]*)")?[^>]*>/g;
    let m;
    while ((m = optRe.exec(seriesBlock[1])) !== null) {
        options.push({
            season: currentSeason,
            episode: m[1],
            id: m[2],
            hash: m[3],
            title: (m[4] || `${m[1]} серия`).trim()
        });
    }
    return options;
}

function kodikBuildSeriaUrl(id, hash, quality) {
    return `//kodikplayer.com/seria/${id}/${hash}/${quality || "720"}p`;
}

// Main entry. Returns array of Mangayomi video objects.
// `playerUrl`  the kodik iframe URL (may start with // or https).
// `refererUrl` site base URL that embedded the iframe (passed as Referer).
// `labelPrefix` prepended to each quality, e.g. "AniBoom · AniLiberty" or "Kodik".
async function kodikExtract(client, playerUrl, refererUrl, labelPrefix) {
    const parsed = kodikParseUrl(playerUrl);
    if (!parsed || !parsed.type || !parsed.id || !parsed.hash) return [];
    const pageHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Referer": (refererUrl || "https://") + (refererUrl && !refererUrl.endsWith("/") ? "/" : "")
    };

    let pageRes;
    try { pageRes = await client.get(parsed.full, pageHeaders); } catch (e) { return []; }
    if (!pageRes || pageRes.statusCode !== 200 || !pageRes.body) return [];

    const paramMatch = pageRes.body.match(/urlParams\s*=\s*'([^']+)'/);
    if (!paramMatch) return [];
    let params;
    try { params = JSON.parse(paramMatch[1]); } catch (e) { return []; }

    const pd = params.pd || parsed.host;
    // Form body — values in urlParams are URI-encoded, /ftor expects raw values re-URI-encoded
    const decode = function (s) { try { return decodeURIComponent(String(s || "")); } catch (e) { return String(s || ""); } };
    const bodyObj = {
        d: params.d || "",
        d_sign: decode(params.d_sign),
        pd: params.pd || "",
        pd_sign: decode(params.pd_sign),
        ref: decode(params.ref),
        ref_sign: decode(params.ref_sign),
        type: parsed.type,
        id: parsed.id,
        hash: parsed.hash
    };
    const bodyStr = Object.keys(bodyObj).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(bodyObj[k]);
    }).join("&");

    const postHeaders = {
        "User-Agent": pageHeaders["User-Agent"],
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://" + parsed.host,
        "Referer": parsed.full
    };
    let ftorRes;
    try {
        // Mangayomi's client.post accepts (url, headers, body). Body can be either
        // an object (which some builds form-encode) or a raw string. Pass the
        // pre-encoded string for deterministic behavior; if that fails, retry with object.
        ftorRes = await client.post("https://" + pd + "/ftor", postHeaders, bodyStr);
        if (!ftorRes || ftorRes.statusCode !== 200) {
            ftorRes = await client.post("https://" + pd + "/ftor", postHeaders, bodyObj);
        }
    } catch (e) { return []; }
    if (!ftorRes || ftorRes.statusCode !== 200 || !ftorRes.body) return [];

    let data;
    try { data = JSON.parse(ftorRes.body); } catch (e) { return []; }
    const links = data.links || {};

    // Kodik response shape (confirmed via live probe):
    //   {"links":{"360":[{src,type}], "480":[...], "720":[...], "1080":[...]}}
    // Older Kohi-den code used named keys (ugly/bad/good) — keep them as fallbacks just in case.
    const videos = [];
    const seen = {};
    const prefix = labelPrefix || "Kodik";
    const qualityKeys = ["240", "360", "480", "720", "1080", "2160"];
    const keyAliases = { "360": "ugly", "480": "bad", "720": "good", "1080": "great" };

    for (const q of qualityKeys) {
        let arr = links[q];
        if (!arr && keyAliases[q]) arr = links[keyAliases[q]];
        if (!arr || !arr.length) continue;
        const src = arr[0] && arr[0].src;
        const full = kodikDecodeSrc(src);
        if (!full || seen[full]) continue;
        seen[full] = true;
        videos.push({
            url: full,
            originalUrl: full,
            quality: prefix + " " + q + "p",
            headers: {
                "User-Agent": pageHeaders["User-Agent"],
                "Referer": parsed.full
            }
        });
    }
    // Best quality first
    videos.sort(function (a, b) {
        const pa = parseInt((a.quality.match(/(\d+)p/) || [0, 0])[1]);
        const pb = parseInt((b.quality.match(/(\d+)p/) || [0, 0])[1]);
        return pb - pa;
    });

    // Iframe fallback. Kodik's solodcdn HLS uses `:hls:` in path segments
    // (`/720.mp4:hls:seg-1-v1-a1.ts`) which Mangayomi's libmpv-based player
    // sometimes rejects as malformed URL. Append the raw kodik iframe URL as
    // the LAST option so users can switch to it if direct HLS fails.
    videos.push({
        url: parsed.full,
        originalUrl: parsed.full,
        quality: prefix + " · iframe (fallback)",
        headers: {
            "User-Agent": pageHeaders["User-Agent"],
            "Referer": (refererUrl || "https://") + (refererUrl && !refererUrl.endsWith("/") ? "/" : "")
        }
    });
    return videos;
}
