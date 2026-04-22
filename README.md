# Mangayomi RU Sources

Репозиторий расширений для [Mangayomi](https://github.com/kodjodevf/mangayomi) — **28 русских источников** манги, аниме и новелл.

Покрывает то, чего не хватает в основных репозиториях kodjodevf/m2k3a/Schnitzel5: ReadManga-семейство, AnimeGO, Jut.su, AniLibria (новый API), Ранобэ.рф и др.

> ⚠ Большинство источников заблокированы в РФ — для корректной работы ожидается либо российский IP, либо VPN. Аутентичные зеркала перечислены ниже + можно переопределить `baseUrl` через настройки источника.

---

## Добавить в приложение

Открой Mangayomi → **Больше → Расширения → кнопка импорта репо** → вставь URL:

| Что подключить | URL |
|---|---|
| **Всё (28 источников)** | `https://redcatpet.github.io/mangayomi-ru-sources/index.json` |
| Только манга (12) | `https://redcatpet.github.io/mangayomi-ru-sources/manga_index.json` |
| Только аниме (9) | `https://redcatpet.github.io/mangayomi-ru-sources/anime_index.json` |
| Только новеллы (7) | `https://redcatpet.github.io/mangayomi-ru-sources/novel_index.json` |

После импорта включи нужные источники в списке.

---

## Статус каждого источника

Версия `0.3.0` — крупный рефакторинг: все источники расширяют `MProvider` напрямую (убраны промежуточные базовые классы — Mangayomi's QuickJS не всегда корректно обрабатывал многоуровневое наследование). Плюс исправлены site_id в Lib-семействе, актуализированы пути каталогов у Acomics/Author.Today/Jaomix/Ранобэ.рф и удалены мёртвые домены (shiz.cc, novel-tl.com).

### Манга (12)

| Источник | Домен по умолчанию | Статус | Ограничения |
|---|---|---|---|
| **ReadManga** | `3.readmanga.ru` | ✅ Selectors выверены по Aidoku | — |
| **MintManga** | `2.mintmanga.one` | ✅ Selectors выверены по Aidoku | — |
| **SelfManga** | `1.selfmanga.live` | ✅ Подтверждено живыми probes | — |
| **AllHentai** | `20.allhen.online` | ⚠ 18+ | Домен меняется — при DNS fail поменяй в настройках |
| **Desu.Me** | `desu.uno` (desu.me/desu.city редиректят сюда) | ✅ API `/manga/api` | Иногда Cloudflare |
| **MangaLib** | `mangalib.me` (API `api.cdnlibs.org/api`, site_id=1) | ✅ Fixed covers через weserv-proxy | Для 18+ нужен Bearer token |
| **YaoiLib** | `yaoilib.me` (site_id=6) | ✅ 18+ BL | Bearer token для взрослого |
| **HentaiLib** | `hentailib.me` (site_id=4) | ✅ 18+ | Почти весь контент за токеном |
| **Remanga** | `remanga.org` (API v2) | ✅ Переписано на api.remanga.org/api/v2/ | Bearer token для платного |
| **NewManga** | `newmanga.org` | 🔧 MVP | API может меняться |
| **MangaBuff** | `mangabuff.ru` | ✅ Selectors выверены по Aidoku | — |
| **Acomics** | `acomics.ru` | 🔧 MVP | Русские веб-комиксы |

### Аниме (9)

| Источник | Домен | Статус видео | Примечания |
|---|---|---|---|
| **AniLibria** | `anilibria.top` (API `api.anilibria.app/api/v1`) | ✅ Работает HLS | Новый API v1, старый v2/v3 отключён |
| **Jut.Su** | `jut.su` | ⚠ Каталог/эпизоды — ✅ (cp1251 декодер); видео — ❌ | `<source>` теги на пустом pixel.png, реальный URL подгружает JS. Смотри через кнопку Webview |
| **AnimeVost** | `animevost.org` (API v1) | ✅ MP4 480p/720p | Работает полноценно |
| **AnimeGO** | `animego.me` | ⚠ Каталог ✅, видео — только iframe | Видео через Kodik iframe, без полной экстракции HLS |
| **AniLib** | `anilib.me` (API `api.cdnlibs.org/api`, site_id=5) | ⚠ Базовый extractor | Плееры Kodik/Sibnet/Libria |
| **Animedia** | `amd.online` | 🔧 MVP | .tv/.my мёртвые — переехали на amd.online |
| **Sovetromantica** | `sovetromantica.com` | ❌ Каталог через JS | Смотри через Webview |
| **AnimeJoy** | `animejoy.ru` | ⚠ Каталог ✅, эпизоды стаб | Полные эпизоды через AJAX — WIP |
| **Animeshka** | `animeshka.net` | 🔧 MVP | `.com` умер, переехали на `.net` |

> Удалены как мёртвые домены: **Shiz.cc**, **Novel-Tl**.

### Новеллы (7)

| Источник | Домен | Чтение глав | Примечания |
|---|---|---|---|
| **Tl.Rulate** | `tl.rulate.ru` | ✅ `getHtmlContent` добавлен | Бесплатные главы, платные требуют вход на сайте |
| **Author.Today** | `author.today` | ⚠ Требует session cookie | Текст AES-зашифрован, без cookie только каталог |
| **RanobeLib** | `ranobelib.me` (lib API, site_id=3) | ✅ ProseMirror → HTML конвертер | Bearer token для платного |
| **Ранобэ.рф** | `ранобэ.рф` (punycode) | ✅ v3 API + Next.js data | — |
| **Jaomix** | `jaomix.ru` | ✅ WordPress | — |
| **RanobeHub** | `ranobehub.org` | ✅ JSON API | — |
| **Litnet** | `litnet.com` | ⚠ Требует session cookie | Только бесплатные книги без подписки |

---

## Настройки источников

Многие источники имеют настраиваемые поля (**Источник → Настройки → "⚙ "**):

- **Grouple-семейство** (ReadManga/MintManga/SelfManga/AllHentai) — поле `Переопределить baseUrl`. Если домен заблокирован, вставь актуальный mirror. Список известных зеркал:
  - ReadManga: `3.readmanga.ru`, `web.usagi.one`, `readmanga.io`
  - MintManga: `2.mintmanga.one`, `seimanga.me`
  - SelfManga: `1.selfmanga.live`
  - AllHentai: `20.allhen.online`, `allhentai.ru` (номер меняется)
- **Lib-семейство** (MangaLib/YaoiLib/HentaiLib/AnimeLib/Ranobelib) — поле `Bearer token`. Взять в DevTools → Network → любой запрос к `api.cdnlibs.org` → заголовок `Authorization`. Плюс выбор сервера изображений.
- **Remanga** — Bearer token для 18+.
- **Author.Today / Litnet** — `Session cookie`. Скопируй строку cookie из DevTools → Application → Cookies после логина.
- **Desu** — поле для альтернативного domain.

---

## Известные ограничения и почему

### Видео плеера
| Сайт | Ситуация |
|---|---|
| AniLibria | ✅ Прямой HLS в API (работает) |
| AnimeVost | ✅ Прямые mp4 (работает) |
| Jut.Su | ❌ Сайт отдаёт плейсхолдер-пиксель в `<source>`, реальный URL ставится JS'ом после проверки referer+cookie. Без JS-движка не вытащить |
| AnimeGO / Shiz / Animeshka | ⚠ Kodik iframe — Mangayomi не всегда проигрывает. Полноценный Kodik-extractor (`gvi` + декодирование base64) не написан |
| AniLib | ⚠ Плееры отдаются через `/api/episodes/{id}` — базовый extractor работает, полноценное кодирование серверов не реализовано |

### Текст новелл
- **Author.Today** шифрует текст AES'ом с ключом, привязанным к сессии — без cookie видишь заглушку.
- **Litnet** — платная подписочная модель, без cookie сессии нельзя читать платные книги.
- **Lib-family** (Ranobelib) — часть переводов за Bearer токеном.

### Сами сайты
- **Большинство .ru доменов геоблочат** запросы из-за рубежа → для сборки с не-RU IP смотришь "0 результатов" или 403. **На твоём iPhone/компе с российским IP работать должно.**
- **Sovetromantica** — каталог рендерится JS, не отдаётся в HTML. Смотри через Webview-кнопку.
- **Shiz.cc / Animeshka** — домены мёртвые. Найди актуальные через Telegram-каналы и поменяй в настройках.

---

## Разработка

### Структура

```
lib/                    Базовые классы (конкатенируются с source):
  grouple_base.js       ReadManga/MintManga/SelfManga/AllHentai
  lib_family_base.js    MangaLib/YaoiLib/HentaiLib/AniLib/RanobeLib

sources/ru/
  manga/<name>/<name>.js
  anime/<name>/<name>.js
  novel/<name>/<name>.js

icons/                  PNG-иконки всех 30 источников
dist/                   Собранные .js + index.json (генерируется build.py)

build.py                Сборщик (lib + source → dist, генерит index.json)
smoke_test.py           Проверка селекторов на живом HTML
RESEARCH.md             Исследование 30 сайтов (Phase 0)
.github/workflows/pages.yml   Автодеплой на GitHub Pages
```

### Локальная сборка

```bash
python build.py
```

Читает `sources/**/*.js`, резолвит `// @include: X` директивы (подгружая `lib/X.js`), пишет в `dist/ru/{тип}/{имя}.js`, обновляет `index.json` и 3 per-type индекса.

### Smoke-тест парсеров

```bash
pip install beautifulsoup4
python smoke_test.py
```

### API, которое реализует `DefaultExtension extends MProvider`

| Метод | Для | Возвращает |
|---|---|---|
| `getPopular(page)` | все | `{list, hasNextPage}` |
| `getLatestUpdates(page)` | все | `{list, hasNextPage}` |
| `search(query, page, filters)` | все | `{list, hasNextPage}` |
| `getDetail(url)` | все | `{name, imageUrl, description, author, genre, status, chapters/episodes}` |
| `getPageList(url)` | манга | `[{url, headers}]` |
| `getVideoList(url)` | аниме | `[{url, originalUrl, quality, headers}]` |
| `getHtmlContent(name, url)` | **новеллы** | HTML-строка с текстом главы |
| `getFilterList()` | все | `[FilterObject]` |
| `getSourcePreferences()` | все | `[PreferenceObject]` |

Подробности: [Mangayomi CONTRIBUTING-JS.md](https://github.com/kodjodevf/mangayomi-extensions/blob/main/CONTRIBUTING-JS.md).

---

## Благодарности

Структура URL и CSS-селекторов для ReadManga/MintManga/SelfManga/MangaBuff/Desu/Remanga/MangaOneLove выверена по **Aidoku Community Sources** (Skittyblock, SolsticeLeaf) — тамошние Rust-реализации служили эталоном для правильных endpoints'ов.

- https://github.com/Skittyblock/aidoku-community-sources
- https://github.com/SolsticeLeaf/aidoku-ru-sources

---

## Отчёт о проблемах

Баги / сломанный источник → [Issues](https://github.com/redcatpet/mangayomi-ru-sources/issues) со скриншотом ошибки.

Быстрый фикс домена — **Source → Settings → `Переопределить baseUrl`** (где поддерживается).

---

## Лицензия

Apache-2.0 — см. [LICENSE](LICENSE). Код расширений не содержит контента сайтов — всё что они делают, это парсят публичные страницы / используют публичные API.

Репозиторий **не аффилирован** ни с одним из источников. Пользуйся на свой риск, уважай Terms of Service сайтов, платить авторам — по возможности.
