# RESEARCH.md — исследование 30 русских источников для Mangayomi

> Документ составлен на Этапе 0 перед написанием кода. Основан на: (а) прямых WebFetch-пробах из окружения Claude, (б) документации референсных репо (kodjodevf, m2k3a), (в) общеизвестных структурах сайтов из публичных Aniyomi/Mihon-расширений. Сайты, до которых не удалось достучаться из окружения Claude (Cloudflare/гео-блок на РФ-сайтах из USA-дата-центра), помечены **⚠ VPN-verify** — структура заявлена из сторонних источников и требует фактической проверки при разработке.
>
> Пояснение к колонкам:
> - **API** — есть ли JSON-API (предпочтительнее скрапинга)
> - **CF** — требуется ли обход Cloudflare / браузерный challenge
> - **Сложность** — easy / medium / hard (основной критерий скорости: API > простой HTML > HTML с JS-рендером > CF + auth + токены)
> - **Selectors / endpoints** — опорные точки для парсинга
> - **Smoke-test** — ✅ получен живой ответ, ⚠ блок/редирект/требует VPN, ❌ мертвое

---

## Обзор технических паттернов

До детализации по каждому сайту — семейства движков, которые можно и нужно переиспользовать:

### A. Семейство **Grouple** (ReadManga, MintManga, SelfManga, Usagi, SeiManga, ZazaZa, AllHentai и др.)
- Единый HTML-движок. Все используют идентичную разметку листинга и страницы тайтла.
- Листинг: `div.tile.col-sm-6` → внутри `div.img a` (href тайтла), `img.lazy[data-original]` (обложка), `h3 a` (название).
- Пагинация offset-based: `?sortType=RATING&offset=0`, шаг 70.
- Страницы манги подгружаются через inline `<script>` с вызовом `rm_h.initReader(...)` — массив страниц извлекается регулярным выражением. Формат: `["url1","url2",...]` с URL вида `https://t<i>.autoimgs.net/.../X.jpg`, `<script>...rm_h.initReader([[["host","","path1"],["host","","path2"]]])`.
- **Все домены семейства регулярно меняются** (блокировки РКН). Актуальный список mirror надо подтягивать через настройки расширения (additionalParams).
- Общий базовый класс сэкономит >500 строк дублирующегося кода. → `lib/grouple_base.js`

### B. Семейство **Lib** (MangaLib, YaoiLib, HentaiLib, AnimeLib, Ranobelib, MangaLib-API)
- Единый JSON-бэкенд: `api.cdnlibs.org` (основной) и `api.mangalib.me`/`api.anilib.me`/`api.ranobelib.me` (фронтовые).
- Эндпоинты (взято из существующего `mangalib.js` в kodjodevf):
  - Каталог: `GET /api/manga?page=1&sort_by=views|rate_avg|chap_count|...`
  - Детали: `GET /api/manga/{slug}?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists`
  - Главы: `GET /api/manga/{slug}/chapters`
  - Страницы: `GET /api/manga/{slug}/chapter?number=X&volume=Y`
  - Константы: `GET /api/constants?fields[]=genres&fields[]=imageServers`
- **Cloudflare на API активно проверяет UA и Referer**. Обязательно заголовки `Site-Id: <id>`, `Referer: <фронт>/`, браузерный UA.
- Site-Id: 1=MangaLib, 2=SlashLib (устарел), 3=HentaiLib, 4=YaoiLib, 5=AnimeLib, 6-7=Ranobelib, часть меняется.
- Авторизация: JWT bearer, получается ручным логином (token можно положить в SharedPreferences через настройки).
- **Текущий `mangalib.js` из kodjodevf — наш шаблон**, его надо адаптировать под YaoiLib/HentaiLib (то же + Site-Id + baseUrl) и AnimeLib/Ranobelib (другой itemType + getVideoList/getPageList).
- Общая база: `lib/lib_family_base.js`.

### C. Родственные движки помельче
- **Madara** — не актуально для рус. сайтов.
- **Desu.me** имеет собственный публичный API `/manga/api/` (не документирован, но стабилен годами).
- **Remanga** — собственный JSON API `/api/search/catalog/`, `/api/titles/{slug}/`, `/api/titles/{slug}/chapters/`.

---

## Таблица источников

### Манга (12)

| # | Сайт | Приоритет | Домен | API? | CF? | Движок | Сложность | Smoke-test | Заметки |
|---|------|-----------|-------|------|-----|--------|-----------|------------|---------|
| 1 | **ReadManga** | 1 | `web.usagi.one` / `readmanga.live` / mirror-list | нет, HTML | нет | Grouple (A) | easy | ⚠ VPN-verify (наш WebFetch на `usagi.one/list` → 404, но корень есть; обычно домены меняются) | `/list?sortType=RATING&offset=N*70`, `/list?sortType=UPDATED&offset=...`. Поиск: `/search/advanced` POST, либо `/search?q=...` GET. |
| 2 | **MintManga** | 1 | `1.seimanga.me` / `mintmanga.live` (RIP) | нет, HTML | нет | Grouple (A) | easy | ⚠ VPN-verify | Тот же движок → общий базовый класс. **MintManga проекту формально переименовалась в SeiManga**. |
| 3 | **SelfManga** | 1 | `1.selfmanga.live` | нет, HTML | нет | Grouple (A) | easy | ✅ (HTML загрузился; точные классы надо будет смотреть на живом HTML) | Русская авторская манга. |
| 4 | **Desu.me** | 1 | `desu.me` | ✅ `desu.me/manga/api` | да (иногда) | свой | easy | ⚠ 403 (CF) | `/manga/api/?order=popular&limit=20&page=1`, `/manga/api/{id}`, `/manga/api/{id}/chapter/{ch_id}`. Возвращает JSON. На Android-сайдлоаде работает. |
| 5 | **MangaLib** | 2 | `mangalib.org` + API `api.cdnlibs.org` / `api.mangalib.me` | ✅ JSON | да | Lib (B) | medium | ⚠ CF | Существующий `mangalib.js` копируем как основу. Для getPageList нужно выбирать image server через настройки. |
| 6 | **YaoiLib** | 2 | `yaoilib.me` + API | ✅ JSON | да | Lib (B) | medium | ⚠ CF | `Site-Id: 4`. isNsfw=true. |
| 7 | **HentaiLib** | 2 | `hentailib.me` + API | ✅ JSON | да | Lib (B) | medium | ⚠ CF | `Site-Id: 3`. isNsfw=true. |
| 8 | **Remanga** | 2 | `remanga.org` + `api.remanga.org` | ✅ JSON | да | свой | medium | ⚠ ECONNREFUSED | Эндпоинты: `/api/search/catalog/?ordering=-rating&page=1`, `/api/titles/{dir}/`, `/api/titles/chapters/?branch_id=X&page=N`, `/api/titles/chapters/{chapter_id}/`. Возраст 18+ требует auth token. |
| 9 | **AllHentai** | 2 | `1.allhentai.ru` / `z.ahen.me` | нет, HTML | нет | Grouple (A) | easy | ⚠ VPN-verify | Тот же Grouple → общая база. isNsfw=true. |
| 10 | **Acomics** | 2 | `acomics.ru` | нет, HTML | нет | свой | easy | ⚠ VPN-verify | Веб-комиксы по серверной отрисовке. Каталог: `/list/subscr/{page}`, `/list/rating/{page}`. Страницы комикса: `/~{slug}/{num}` с inline `<img id="mainImage">`. |
| 11 | **NewManga** | 2 | `newmanga.org` | ✅ JSON (`/api/...`) | нет | Next.js (свой API) | medium | ⚠ минимальный HTML (SPA) | `GET /api/catalogue?page=1` (или `/api/projects?page=...`), `GET /api/projects/{slug}`, `/api/projects/{slug}/chapters`. Структура JSON может меняться. |
| 12 | **Mangabuff** | 2 | `mangabuff.ru` | нет, HTML | ⚠ частично | свой | medium | ✅ (пагинация `?page=N`) | Карточки: `.cards__item`, внутри `.cards__name`, `.cards__img img[src\|data-src]`. Страницы главы загружаются через JS (`/manga/.../{slug}/1/1` возвращает HTML с `pages = [...]` в inline-script). |

### Аниме (10)

| # | Сайт | Приоритет | Домен | API? | CF? | Видео-плеер | Сложность | Smoke-test | Заметки |
|---|------|-----------|-------|------|-----|-------------|-----------|------------|---------|
| 13 | **AnimeGO** | 1 | `animego.me` (был `.org`) | нет | нет | Kodik / AniLiberty / Sibnet (iframe) | medium | ✅ сеточка видна, пагинация — "Загрузить ещё" | Карточка: `a[href*="/anime/"]`, обложка `img`, сортировка `?sort=rating&direction=desc`. Эпизоды через `/anime/{slug}/player?_allow=true&episode={N}`. **Для плеера придётся парсить Kodik-iframe и вытаскивать HLS** — это medium-hard, придётся писать кастомный extractor. |
| 14 | **Jut.su** | 1 | `jut.su` | нет | нет | собственный плеер с прямыми mp4 | easy | ✅ | Пагинация `/anime/page-{N}/`. Каталог: карточки в `.all_anime_global > .anime_global`. Страница эпизода содержит `<video><source src="...mp4">` прямо в HTML — **идеальный шаблон**. |
| 15 | **AnimeLib** | 2 | `anilib.me` + API | ✅ JSON | да | HLS через API | medium | ⚠ CF | Lib (B) с `Site-Id: 5`, itemType=1. Эпизоды: `/api/anime/{slug}/episodes`, видео: `/api/episodes/{id}`. |
| 16 | **Animedia** | 2 | `animedia.my` (ранее `animedia.tv`) | нет | нет | iframe с токеном | medium | ⚠ VPN-verify | Каталог `/catalog/all`, карточки `.ws-list .ws-tile a`. Эпизоды через `/embeds/{slug}/{season}/{ep}` → JSON со списком серверов. |
| 17 | **Sovetromantica** | 2 | `sovetromantica.com` | нет | нет | свой player + внешние | medium | ⚠ VPN-verify | Каталог `/anime?sort=rating&page=N`. Страница аниме содержит JS-переменную `player.init(...)` с прямой HLS. |
| 18 | **Animevost** | 2 | `animevost.org` + `api.animevost.org/v1` | ✅ JSON v1 | нет | прямые mp4-ссылки | easy | ⚠ VPN-verify | Простой публичный API v1. `/v1/last?page=1&quantity=20`, `/v1/info?id=N`, `/v1/playlist` (POST). Прекрасный кандидат после Anilibria. |
| 19 | **Anilibria** | 1 | ~~`api.anilibria.tv/v3`~~ → `aniliberty.top` / `anilibria.top` API v1 | ✅ JSON | нет | HLS | medium (API новый) | ❌ `api.anilibria.tv` → 410 Gone; новый API `anilibria.top/api/v1/*` ECONNREFUSED из Claude | **КРИТИЧНО:** старый v2/v3 отключён. Новый API v1 документирован на `anilibria.top/api/docs/v1`. Эндпоинты (из документации): `/api/v1/anime/releases/latest`, `/api/v1/anime/catalog/releases`, `/api/v1/anime/releases/{code}`, плюс episodes с HLS. Надо перечитать доки в первую очередь реализации. |
| 20 | **AniGo** | 2 | `anigo.ru` (или `animego-online.ru`?) | нет | возможно | iframe плееры | medium | ⚠ VPN-verify | Непонятный по сравнению с AnimeGO сайт. Требует первоочередной проверки — **возможно снять из списка** и заменить. |
| 21 | **AnimeJoy** | 2 | `animejoy.ru` | нет | ⚠ | свой плеер + Kodik | medium | ⚠ VPN-verify | Популярный сайт, но структура как у DLE (Dataife Engine): `.sect-items article.block`, пагинация `/page/{N}/`. Плеер через `/engine/ajax/controller.php?mod=ajax&action=playlist` POST. |
| 22 | **YummyAnime** | 2 | `yummyani.me` (`yummyanime.club` RIP?) | частично JSON | ⚠ | Kodik/свой | medium | ⚠ VPN-verify | Каталог GraphQL `/api/graphql`. Сложнее типичного, **перепроверить по актуальному домену**. |

### Новеллы (8)

| # | Сайт | Приоритет | Домен | API? | CF? | Сложность | Smoke-test | Заметки |
|---|------|-----------|-------|------|-----|-----------|------------|---------|
| 23 | **Ranobelib** | 1 | `ranobelib.me` + API | ✅ JSON | да | medium | ⚠ CF | Lib (B), `Site-Id: 6` или 7. `/api/manga/{slug}/chapter?number=X&volume=Y` возвращает главу с полем `content` (HTML). |
| 24 | **Author.today** | 1 | `author.today` | ⚠ частично API | нет | medium | ⚠ socket closed (РФ-геоблок US?) | Каталог `/catalog/all/popular?page=N`. Карточки `.book-row`, внутри `.book-title a`, обложка `.book-cover img[src]`. Главы доступны для бесплатных книг через `/work/{id}` → список, `/reader/{chapter_id}` — защищённое AES-шифрование текста главы (ключ в куках `ratb` / `laravel_session`). **Шифрование = hard.** Для MVP — только метаданные + список глав, без загрузки текста. |
| 25 | **Tl.rulate.ru** | 1 | `tl.rulate.ru` | нет, HTML | нет | easy | ✅ (реагирует) | Каталог `/search?t=&type=0&sort=0&page={N}`, карточки — `a[href^="/book/"]`. Книга `/book/{id}` → список глав в `.chapters-new .chapter`. Текст в `/book/{id}/{chapter_id}` внутри `.content-text`. Платные главы ограничены. |
| 26 | **Ранобэ.рф** | 2 | `ранобэ.рф` / `xn--80ac9aeh6f.xn--p1ai` + `api.ранобэ.рф` | ✅ JSON | нет | easy | ⚠ VPN-verify | Публичный API (известен): `https://xn--80ac9aeh6f.xn--p1ai/api/search?page=1&sort=popular`, `/api/books/{slug}`, `/api/books/{slug}/chapters`, `/api/books/{slug}/chapters/{chapter_id}`. |
| 27 | **Jaomix** | 2 | `jaomix.ru` | нет, HTML | нет | easy | ⚠ VPN-verify | Каталог `/projects/?proj_page={N}`. Простая WordPress-like структура, селекторы: `.post-item`, `.post-title a`, `.post-image img[src]`. |
| 28 | **Novel-Tl** | 2 | `novel-tl.com` | нет | нет | medium | ⚠ VPN-verify | Каталог через `/catalog/?page=N&sort=popular`. Главы в `/reader/{slug}-ch{N}`. |
| 29 | **RanobeHub** | 2 | `ranobehub.org` + API | ✅ JSON | нет | easy | ⚠ VPN-verify | Публичный API: `/api/search?page=1&sort=computed_rating`, `/api/ranobe/{id}/contents`, `/api/ranobe/{id}/chapters/{chapter_id}`. |
| 30 | **Litnet** | 2 | `litnet.com` / `litnet.ru` | нет, HTML | нет | medium | ⚠ VPN-verify | Каталог `/ru/top/all?page=N` или `/ru/search`. Текст глав защищён частично (подписочная модель, бесплатные книги доступны). Селекторы: `.book-item`, `.book-title`. Сложность в том, что сессия нужна для постранички. |

---

## Текущие домены (живые на 2026-04)

| Семейство | Актуальные mirror | Примечание |
|-----------|-------------------|------------|
| ReadManga | `web.usagi.one`, mirror-pool через сам сайт | офиц. редирект с `readmanga.live/io/me` |
| MintManga | `1.seimanga.me` | переименован |
| SelfManga | `1.selfmanga.live` ✅ | актив |
| AllHentai | `1.allhentai.ru`, `z.ahen.me` | крутится |
| AnimeGO | `animego.me` ✅ | `.org` редирект |
| Anilibria | `anilibria.top` / `aniliberty.top` | бренд переименован → API новый, старый 410 |
| YummyAnime | `yummyani.me` (?) | `.club` умер |

> Для mirror-пула Grouple-семейства предусмотрю **настройку `baseUrl`** в каждом расширении через `getSourcePreferences` — чтобы пользователь мог подменить домен при блокировке.

---

## Краткая оценка сложности и риски

- **Делаем прямо сейчас без проблем (5 шт.)**: ReadManga, MintManga, SelfManga, SelfManga, AllHentai (все через `grouple_base.js`) — **но актуальный domain-list тестируем через VPN**.
- **Должны работать после базы (5 шт.)**: Jut.su, Tl.rulate, Jaomix, Acomics — простой HTML без защит. AnimeGO — есть, но требует extractor'а Kodik (отдельная боль).
- **Публичные API, легко (3 шт.)**: Animevost v1, RanobeHub, Ranobehub-подобные.
- **AniLibria — переехала**: критично сначала внимательно прочитать новую доку API v1 на `anilibria.top/api/docs/v1` и свериться с живыми ответами через VPN. Пока **API-эндпоинты вписаны на основании docs, но не реально проверены**.
- **Lib-семейство (5 шт.)**: MangaLib/YaoiLib/HentaiLib/AnimeLib/Ranobelib. Cloudflare + заголовки + (опционально) token. Реализуемо через общий `lib_family_base.js`, но требует живого тестирования через VPN. Готов шаблон — `mangalib.js` из kodjodevf.
- **Сложные (hard)**:
  - **Author.today** — текст глав AES-зашифрован. MVP = метаданные+список глав, без загрузки текста.
  - **Litnet** — session + NSFW гейт.
  - **Mangabuff** — страницы главы через JS, пагинация HTML inline — надо регуляркой.
  - **YummyAnime** — GraphQL-запросы, нестандартно.
  - **AniGo** — непонятный сайт, возможно надо заменить.

---

## Итог — порядок имплементации

**Phase 1 — базовые классы (lib/):**
1. `lib/grouple_base.js` — для ReadManga/MintManga/SelfManga/AllHentai/Usagi.
2. `lib/lib_family_base.js` — для MangaLib/YaoiLib/HentaiLib/AnimeLib/Ranobelib.

**Phase 2 — Priority 1 расширения (5 эталонов):**
1. **ReadManga** (манга/HTML, Grouple) — эталон скрапера.
2. **Jut.su** (аниме/HTML, прямые mp4) — эталон для аниме.
3. **Anilibria** (аниме/JSON, новый API) — эталон для API.
4. **Tl.rulate** (новеллы/HTML) — эталон для новелл.
5. **Author.today** (новеллы/hybrid, метаданные only) — сложный кейс с ограничением.

После ок от пользователя — доделываем остальные Priority 1 (MintManga/SelfManga/Desu.me/AnimeGO/Ranobelib) и переходим к Priority 2.

**Phase 3 — Priority 2 (20 расширений)** через базовые классы и одиночные реализации.

**Phase 4 — репо:** README, `index.json`, GH Pages, GitHub Action.

---

## Проблемные моменты — нужны решения ДО кода

1. **AnimeGO и плеер Kodik.** Для `getVideoList` придётся вытащить iframe src и распарсить HLS-ссылку из Kodik. Aniyomi-расширения содержат готовый extractor, который можно портировать на JS (~200 строк). **Либо ограничиться внешним iframe-URL (возврат `{url: kodikIframeSrc, quality: "iframe"}`)** — это хуже для UX, но работает.
2. **Author.today шифрование текста.** MVP отказывается от загрузки текста глав, только метаданные + оглавление — честно пишем в `notes` источника. Альтернатива — использовать поле токена, куда пользователь вставляет session-cookie, и дешифровать на клиенте (~day of work).
3. **Lib-family Site-Id.** Нужно для каждого сайта определить корректный `Site-Id` — **предлагаю сделать это эмпирически при разработке, сверяясь с реальными заголовками запросов в DevTools**.
4. **AniGo и YummyAnime** — оба под вопросом. Рекомендую **заменить**: например, на `animeshka.com` и `sameband.studio` — либо оставить заглушкой и пометить "WIP".

---

## Что я прошу подтвердить перед тем как кодить

1. **Окей ли план?** Переходим к `lib/grouple_base.js` + `lib/lib_family_base.js` + 5 эталонных расширений?
2. **AnimeGO-Kodik:** делать внешний iframe (easy, но хуже UX) или портировать полноценный Kodik extractor (~день работы, идеальный UX)?
3. **Author.today:** MVP без текста глав, или токен-поле + AES-расшифровка?
4. **AniGo / YummyAnime** — заменить чем-то? Предложения: `shiz.cc`, `animeshka.com`, `anilibria-app`.
5. **Mirror-настройки** — делать `baseUrl` настраиваемым через `getSourcePreferences` (рекомендую "да") — ок?

После твоего ок начну Phase 1 (базовые классы) и покажу код 5 эталонов.
