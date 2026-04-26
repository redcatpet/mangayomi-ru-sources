# Mangayomi RU Sources

Репозиторий расширений для [Mangayomi](https://github.com/kodjodevf/mangayomi) — **30 русских источников** манги, аниме и новелл.

Покрывает то, чего не хватает в основных репозиториях kodjodevf/m2k3a/Schnitzel5: ReadManga-семейство, AnimeGO, AniLib/MangaLib (новые .org-домены), Animesss, YummyAnime, Anixart, Ранобэ.рф, Senkuro/Senkognito/Shiruho и др.

> ⚠ **Большинство сайтов гео-блочат не-RU IP** или возвращают 403/заглушку для незалогиненных пользователей. Для полной работы расширений ожидается российский IP, иногда — Bearer token / cookie из вашей сессии (см. инструкции ниже).

---

## Установка

В Mangayomi → **Больше → Расширения → 🔄 импорт репозитория** → URL:

| Что подключить | URL |
|---|---|
| **Всё (30 источников)** | `https://redcatpet.github.io/mangayomi-ru-sources/index.json` |
| Только манга (12) | `https://redcatpet.github.io/mangayomi-ru-sources/manga_index.json` |
| Только аниме (12) | `https://redcatpet.github.io/mangayomi-ru-sources/anime_index.json` |
| Только новеллы (6) | `https://redcatpet.github.io/mangayomi-ru-sources/novel_index.json` |

После импорта включи нужные источники.

> **Важно**: после крупного апдейта репо **переимпортируй** его (удали → добавь заново), иначе в установленных останутся obsolete-источники с устаревшими доменами/API.

---

## Реальный статус (v0.8.5, проверено через E2E с фактической загрузкой контента)

E2E-харнес (`_scratch/e2e_real.js`) для каждого источника:
1. Запрашивает `getPopular` — должен вернуть список
2. Берёт первый тайтл, вызывает `getDetail` — должен вернуть главы/эпизоды
3. **Реально fetch'ит первую страницу/видео** и проверяет MIME (image/*, m3u8, mp4, html >800B)
4. Если контент — заглушка (deleted1.png, censored stub, pixel.png) — это FAIL

**Итог: 24/30 источников отдают реальный контент с EU IP** (с RU IP больше — гео-блоки снимаются).

### ✅ Полностью работают (отдают реальный контент):

**Аниме (11):** AniLibria · Animedia · AnimeGO · AnimeJoy · AniLib · Animeshka · **Animesss** · AnimeVost · Anixart · **Shiruho** · **YummyAnime**

**Манга (8):** Acomics · Desu.Me · MangaBuff · ReadManga · Remanga · SelfManga · **Senkognito** ⭐ · **Senkuro**

**Новеллы (5):** Jaomix · RanobeHub · RanobeLib · Ранобэ.рф · Tl.Rulate

> **v0.8.5**: у **Senkuro / Senkognito / Shiruho** появилось отдельное поле `Auth token` — туда вставляется только значение cookie `access_token` (одна строка `v4.local.X...` ~280 символов). Расширение само заворачивает её в `Authorization: Bearer ...` — как делает сам сайт. Удобнее, чем копировать всю cookie-строку. Старое поле `Session cookie` оставлено как fallback.
>
> **v0.8.4**: пофикшен каталог **Senkognito**. Раньше показывал ту же мангу, что и Senkuro (потому что оба сайта делят один backend и без фильтра API возвращает всё). Теперь применяется `rating: {include: [EXPLICIT, QUESTIONABLE]}` — соответствует поведению самого senkognito.com. Настраивается в Settings источника (можно расширить до SENSITIVE или вообще снять фильтр).
>
> **v0.8.3**: добавлен **Senkognito** (NSFW-сестра Senkuro). Тот же GraphQL-стек на `api.senkognito.com/graphql`. Для скрытого 18+ контента может потребоваться cookie из senkognito.com.
>
> ⚠ **Важно про кэш**: Mangayomi кэширует детали тайтла локально. После апдейта v0.8.2/0.8.3 описания у уже добавленных тайтлов (Senkuro/Shiruho) **не обновятся автоматически** — нужно либо удалить тайтл из библиотеки и добавить заново, либо нажать кнопку «обновить детали» в карточке тайтла.
>
> **v0.8.2**: добавлен **Shiruho** (anime, sister-site Senkuro). GraphQL API `api.shiruho.com/graphql` — каталог + детали + эпизоды с многодабовыми озвучками (Kodik HLS через extractor + Sibnet/VK/MyVi/YouTube как iframe). Также пофикшено описание в **Senkuro** (теперь парсит Tiptap rich-text вместо показа альт-названий).
>
> **v0.8.1**: пофикшено воспроизведение видео в **Anixart** (Kodik HLS-URL с двоеточиями `/720.mp4:hls:...` ломали libmpv → добавлен iframe-fallback в kodik_extractor). Senkuro каталог получил диагностику ошибок (раньше показывал "0 results" вместо HTTP-кода).
>
> **v0.8.0**: добавлен **Senkuro** (manga). GraphQL API `api.senkuro.com/graphql` — каталог + детали + страницы глав через WebP-CDN с подписанными ссылками. E2E подтверждён: 30 каталог, 21 глава, 624KB WebP первая страница.
>
> **v0.7.3**: Litnet удалён (нейрослоп / низкое качество контента — не оправдывает поддержку CF + Angular SSR).
>
> **v0.7.2 hotfix**: Tl.Rulate каталог восстановлен (регрессия v0.4.0 — фильтр-параметры путали сервер); RanobeHub детальная страница больше не показывает `[object Object]` в авторе и сырой JSON в жанрах; Jaomix парсер стал устойчивее к смене вёрстки (трёхуровневый fallback).

### ⚠ Частично работают (нужен токен / cookie / RU IP)

| Источник | Что нужно | Где взять |
|---|---|---|
| **MangaLib / AniLib / HentaiLib** | Bearer token для 18+ и Pro-глав | `mangalib.org` / `animelib.org` / `hentailib.me` → DevTools → Network → любой XHR к API → `Authorization: Bearer ...` (см. ниже) |
| **MintManga / AllHentai** | Session cookie (без неё сервер шлёт `deleted1.png`) | Сайт → DevTools → Application → Cookies → копируй ВЕСЬ cookie-string после логина |
| **Author.Today** | Session cookie | то же самое — без неё текст глав AES-зашифрован |

### ❌ Известные не-фиксы

- **Jut.Su видео** — сайт отдаёт `<source src="pixel.png">` и подгружает реальный URL JS-функцией с проверкой referer/cookie. Без полноценного JS-engine не вытащить. Каталог + список эпизодов работают; смотри в браузере или через WebView в Mangayomi.
- **Sovetromantica** — был удалён в v0.5; каталог рендерится JS, в HTML пусто.
- **NewManga** — был удалён в v0.5; стал Vue SPA с auth-locked API без публичных endpoints.

---

## Как получить Bearer token (для Lib-семейства)

1. Открой **mangalib.org** / **animelib.org** / **hentailib.me** в Chrome
2. Залогинься (без аккаунта — токена не будет)
3. F12 → вкладка **Network**
4. Открой ЛЮБУЮ мангу/аниме (или просто обнови страницу)
5. В списке запросов найди XHR к `api.cdnlibs.org` или `api2.mangalib.me` или `hapi.hentaicdn.org` или `api.animelib.org` (зависит от сайта)
6. Кликни на запрос → вкладка **Headers** → **Request Headers** → найди `Authorization: Bearer eyJ0eXAi…`
7. Скопируй **всё после слова `Bearer ` (без самого слова Bearer)** — это длинная JWT-строка из 200+ символов
8. В Mangayomi: тыкни на источник → ⚙ Settings → "Auth token (Bearer)" → вставь

> **Важно**: токен **выдаётся отдельно для каждого Lib-сайта**. Токен с mangalib.org НЕ подойдёт для animelib.org — API ответит HTTP 422 "audience mismatch". В таком случае с v0.7.1 расширение автоматически отбросит токен и попробует без авторизации (для публичного контента это работает; платный контент не загрузится).

---

## Про авторизацию в Senkuro / Senkognito / Shiruho

Эти сайты используют **OAuth2-PKCE** через `senkuro.org/oauth/authorize` — login/password endpoint в API нет, login-flow требует браузер-редирект (его Mangayomi-расширения не умеют выполнять). Так что ввести логин/пароль внутри приложения нельзя — нужно один раз залогиниться в браузере и передать оттуда токен.

**Простой способ (рекомендуется)** — поле `Auth token (access_token)`:

1. Залогинься на senkuro.com / senkognito.com / shiruho.com в обычном браузере
2. F12 → **Application** → **Cookies** → выбери домен сайта
3. Найди cookie с именем **`access_token`** (это PASETO-токен, начинается с `v4.local.`)
4. Скопируй **только его Value** (длинная строка ~280 символов)
5. В Mangayomi → источник → ⚙ Settings → **Auth token (access_token)** → вставь

Расширение само добавит `Bearer ` префикс и отправит как `Authorization: Bearer <token>` — точно так же, как делает сам сайт.

**Fallback** — если по какой-то причине Bearer не работает, есть старое поле `Session cookie` куда вставляется ВСЯ cookie-строка (`access_token=...; theme=...`).

Без авторизации работает публичный контент. Токен нужен для:
- 18+ контента, скрытого от анонимов
- DMCA-блочного контента в твоём регионе
- Платных глав / эксклюзивов

> Токен живёт ~30 дней (виден в DevTools в поле Expiration). Когда истечёт — повтори процедуру.

---

## Как получить session cookie (для Grouple / Author.Today)

1. Открой **2.mintmanga.one** / **20.allhen.online** / **author.today**
2. Залогинься (можно бесплатным аккаунтом)
3. F12 → вкладка **Application** → раздел **Cookies** → выбрать домен сайта
4. Скопируй ВСЕ cookies в одну строку формата `key1=value1; key2=value2; key3=value3`
5. В Mangayomi: источник → ⚙ Settings → "Session cookie" → вставь

---

## Настройки источников (overview)

| Группа | Доступные настройки |
|---|---|
| **Grouple** (ReadManga/MintManga/SelfManga/AllHentai) | `Override baseUrl` (если домен заблокирован) + `Session cookie` (для 18+ и DMCA-блокированных глав) |
| **Lib** (MangaLib/HentaiLib/AniLib/RanobeLib) | `Image server` (5 вариантов CDN) + `Auth token (Bearer)` |
| **Remanga** | Bearer token для платного |
| **Desu** | `Override baseUrl` (`desu.uno`/`desu.city`/`desu.me` редиректят) |
| **AniLibria** | `Default quality` (480p / **720p** / 1080p) |
| **Author.Today** | `Session cookie` |
| **Все источники** | Кнопка "🔍 Filter" в каталоге для жанров/статусов/типов (если поддерживается) |

---

## Фильтры

С v0.6 у большинства источников появилась кнопка **🔍 фильтр** над каталогом — там жанры (TriState: тап = включить, два тапа = исключить), статусы, типы, сортировка. Поддерживают:

- **Remanga** — 34 жанра + 5 статусов + 7 типов + возраст + 5 сортировок
- **Grouple** (ReadManga/MintManga/SelfManga/AllHentai) — 40 жанров + 5 сортировок + 7 advanced-флагов
- **Lib** (MangaLib/HentaiLib/RanobeLib/AniLib) — 50 жанров TriState + статусы + типы + 9 ключей сортировки
- **AnimeGO** — path-routing genre/status/type
- **Anixart** — 38 жанров TriState + 6 сортировок + статус + категория (TV/Movie/OVA/...)
- **Desu.Me** — 25 жанров + статус/тип/возраст
- **Tl.Rulate** — 16 категорий + тип (переводы/авторские) + атмосфера + 12 сортировок

---

## Разработка

### Структура

```
lib/
  grouple_base.js       Helpers для ReadManga/MintManga/SelfManga/AllHentai
  lib_family_base.js    Helpers для MangaLib/HentaiLib/AniLib/RanobeLib
  kodik_extractor.js    Универсальный Kodik iframe → HLS extractor
                        (используют animego, animelib, animedia, anixart,
                         animesss, yummyanime)

sources/ru/
  manga/<name>/<name>.js
  anime/<name>/<name>.js
  novel/<name>/<name>.js

icons/                  PNG-иконки источников (128×128)
dist/                   Собранные .js + index.json (генерируется build.py)

build.py                Сборщик: lib + source → dist, генерит index.json
                        REPO_BASE_URL env override для CI

_scratch/
  eval_check.js         Проверка что каждый собранный JS парсится в QuickJS-mode
  e2e_real.js           Полный E2E: реально fetch'ит контент и
                        валидирует MIME (вылавливает заглушки и
                        неработающие endpoints)
  e2e_test.js           Старый E2E (без проверки контента)

.github/workflows/pages.yml   Автодеплой на GitHub Pages
```

### Локальная сборка + проверка

```bash
python build.py                          # ← собирает dist/
node _scratch/eval_check.js              # ← парсит каждый dist/*.js
node _scratch/e2e_real.js                # ← честный E2E с fetch контента
node _scratch/e2e_real.js MangaLib       # ← один источник
```

### API расширения

| Метод | Для | Возвращает |
|---|---|---|
| `getPopular(page)` | все | `{list: [{name, imageUrl, link}], hasNextPage}` |
| `getLatestUpdates(page)` | все | то же |
| `search(query, page, filters)` | все | то же |
| `getDetail(url)` | все | `{name, imageUrl, description, author, genre, status, chapters/episodes}` |
| `getPageList(url)` | манга | `[{url, headers}]` |
| `getVideoList(url)` | аниме | `[{url, originalUrl, quality, headers}]` |
| `getHtmlContent(name, url)` | новеллы | HTML-строка |
| `getFilterList()` | все | `[FilterObject]` |
| `getSourcePreferences()` | все | `[PreferenceObject]` |

Полный контракт: [Mangayomi CONTRIBUTING-JS.md](https://github.com/kodjodevf/mangayomi-extensions/blob/main/CONTRIBUTING-JS.md)

### Важная техническая особенность

Mangayomi использует `flutter_qjs` (QuickJS), который **не обрабатывает корректно многоуровневое наследование классов**. Все `DefaultExtension` ОБЯЗАНЫ extend `MProvider` напрямую, а не через промежуточный базовый класс. Из-за этого `lib/grouple_base.js` и `lib/lib_family_base.js` экспортируют только функции (`groupleParseList`, `libGetPopular`, …), а не базовый класс. Конкатенация делается build-системой через `// @include: <libname>` директиву.

---

## Благодарности

- **Aidoku Community Sources** (Skittyblock, SolsticeLeaf) — Rust-реализации послужили эталоном для ReadManga/MangaBuff/Desu/Remanga endpoints.
- **m2k3a/mangayomi-extensions** — extractor pack (filemoon, dood, mixdrop, okru, vidGuard) — изучен как референс.
- **shikicinema, Shikiplayer** — открытые расширения Shikimori с интеграцией Kodik/AniLibria/community-видео API.

Источники:
- https://github.com/Skittyblock/aidoku-community-sources
- https://github.com/SolsticeLeaf/aidoku-ru-sources
- https://github.com/m2k3a/mangayomi-extensions
- https://github.com/Smarthard/shikicinema
- https://github.com/qt-kaneko/Shikiplayer

---

## Отчёт о проблемах

Баги — [Issues](https://github.com/redcatpet/mangayomi-ru-sources/issues) со скриншотом + примечанием какой источник + какой шаг ломается.

Быстрый фикс домена — **Source → Settings → `Override baseUrl`** (где поддерживается).

---

## Лицензия

Apache-2.0 — см. [LICENSE](LICENSE). Код расширений не содержит контента сайтов — всё что они делают, это парсят публичные страницы / используют публичные API.

Репозиторий **не аффилирован** ни с одним из источников. Пользуйся на свой риск, уважай Terms of Service сайтов, платить авторам — по возможности.
