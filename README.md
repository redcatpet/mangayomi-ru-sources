# Mangayomi RU Sources

Репозиторий расширений для [Mangayomi](https://github.com/kodjodevf/mangayomi) — **30 русских источников** манги, аниме и новелл.

Покрывает то, чего не хватает в основных репозиториях kodjodevf/m2k3a/Schnitzel5: крупнейшие русские сайты ReadManga-семейства, аниме-трекеры AnimeGO/Jut.su, любительские новеллы Ранобэ.рф/Ruranobe и т.д.

---

## Как добавить репо в Mangayomi

1. Откройте приложение Mangayomi (iOS, Android, Windows, macOS, Linux).
2. Перейдите: **Больше → Расширения → Импорт**.
3. Вставьте одну из ссылок:

| Что нужно | URL |
|-----------|-----|
| **Всё сразу (манга + аниме + новеллы, 30 шт.)** | `https://<YOUR_USERNAME>.github.io/mangayomi-ru-sources/index.json` |
| Только манга (12 шт.) | `https://<YOUR_USERNAME>.github.io/mangayomi-ru-sources/manga_index.json` |
| Только аниме (10 шт.) | `https://<YOUR_USERNAME>.github.io/mangayomi-ru-sources/anime_index.json` |
| Только новеллы (8 шт.) | `https://<YOUR_USERNAME>.github.io/mangayomi-ru-sources/novel_index.json` |

> Замените `YOUR_USERNAME` на ваш логин GitHub после форка/публикации.

4. После импорта включите нужные источники в списке.

---

## Список источников

**Условные обозначения:**
- ✅ **работает** — smoke-test прошёл, расширение стабильно
- ⚠ **нужна VPN** — сайт заблокирован РКН или вне РФ не отдаёт данные
- 🔐 **нужен логин/токен** — требует auth-token / cookie для полного функционала (вводится в настройках источника)
- 🔧 **MVP** — базовая реализация, есть ограничения (описаны в `notes`)

### Манга (12)

| Источник | URL | Движок | Статус |
|----------|-----|--------|--------|
| ReadManga | web.usagi.one | Grouple | ⚠ VPN |
| MintManga | 1.seimanga.me | Grouple | ⚠ VPN |
| SelfManga | 1.selfmanga.live | Grouple | ✅ |
| AllHentai | 1.allhentai.ru | Grouple | ⚠ VPN · 18+ |
| Desu.Me | desu.me | JSON API | ⚠ CF |
| MangaLib | mangalib.me | Lib API | ⚠ CF · 🔐 для 18+ |
| YaoiLib | yaoilib.me | Lib API | ⚠ CF · 18+ |
| HentaiLib | hentailib.me | Lib API | ⚠ CF · 🔐 18+ |
| Remanga | remanga.org | JSON API | 🔐 для 18+ |
| NewManga | newmanga.org | JSON API | 🔧 MVP |
| MangaBuff | mangabuff.ru | HTML | 🔧 MVP |
| Acomics | acomics.ru | HTML | ⚠ VPN |

### Аниме (10)

| Источник | URL | Движок | Статус |
|----------|-----|--------|--------|
| AniLibria | anilibria.top (новый API v1) | JSON | ✅ API работает |
| Jut.Su | jut.su | HTML (прямой mp4) | ✅ |
| AnimeVost | animevost.org | API v1 | ✅ |
| AnimeGO | animego.me | HTML + Kodik iframe | 🔧 iframe-passthrough |
| AniLib | anilib.me | Lib API | ⚠ CF · 🔧 плеер iframe |
| Animedia | animedia.my | HTML + iframe | ⚠ VPN |
| Sovetromantica | sovetromantica.com | HTML + HLS | ⚠ VPN |
| AnimeJoy | animejoy.ru | HTML + HLS/MP4 | ⚠ VPN |
| Shiz.cc (замена AniGo) | shiz.cc | HTML + Kodik | ⚠ VPN |
| Animeshka (замена YummyAnime) | animeshka.com | HTML + Kodik | ⚠ VPN |

### Новеллы (8)

| Источник | URL | Тип | Статус |
|----------|-----|-----|--------|
| Tl.Rulate | tl.rulate.ru | HTML | ✅ |
| Author.Today | author.today | HTML | ⚠ CF · 🔐 текст глав требует session cookie |
| RanobeLib | ranobelib.me | Lib API | ⚠ CF |
| Ранобэ.рф | ранобэ.рф (IDN) | JSON API | ⚠ VPN |
| Jaomix | jaomix.ru | WordPress | ⚠ VPN |
| Novel-Tl | novel-tl.com | HTML | ⚠ VPN |
| RanobeHub | ranobehub.org | JSON API | ⚠ VPN |
| Litnet | litnet.com | HTML + Cloudflare | 🔐 платные книги требуют подписки |

---

## Про настройки источников

Многие расширения имеют **настраиваемые поля** (при клике на источник → Настройки):

- **Grouple-семейство** (ReadManga/MintManga/SelfManga/AllHentai) — поле «Переопределить baseUrl». Если официальный домен заблокирован, вставьте актуальный mirror (например `https://readmanga.live` вместо `https://web.usagi.one`).
- **Lib-семейство** (MangaLib/YaoiLib/HentaiLib/AnimeLib/Ranobelib) — поле «Bearer token» для 18+ контента и платных глав. Получить: DevTools → Network → любой запрос к `api.cdnlibs.org` → заголовок `Authorization: Bearer ...`.
- **Remanga** — аналогично, Bearer token.
- **Author.Today / Litnet** — поле «Session cookie» для доступа к купленным/платным главам. Скопируйте из DevTools → Application → Cookies.
- **MangaLib** — также поле «Сервер изображений» (main/secondary/compress).

---

## Известные ограничения

1. **AnimeGO/Shiz/Animeshka** пока отдают iframe URL плеера (Kodik/Aniboom), не HLS. Mangayomi может не проигрывать их — это зависит от версии плеера. Полноценная HLS-экстракция из Kodik — TODO.
2. **Author.Today** шифрует текст глав клиентским JS. Без session cookie показывается только список глав и заглушка. С cookie — тоже не гарантировано, сайт агрессивно меняет схему шифрования.
3. **Lib-семейство** активно блокирует неавторизованные запросы к 18+ и платным главам. Без токена вы увидите только бесплатный каталог.
4. **Anilibria v2/v3 API отключён в 2025.** Используется новый API v1 на `api.anilibria.app`, структура ответов принципиально новая.
5. Многие домены **регулярно меняются** (РКН). Если источник перестал работать — проверьте mirror через Google/Telegram-канал сайта, затем обновите `baseUrl` в настройках.

---

## Разработка

### Структура репо

```
lib/                    Базовые классы (переиспользуемые):
  grouple_base.js       ReadManga/MintManga/SelfManga/AllHentai
  lib_family_base.js    MangaLib/YaoiLib/HentaiLib/AnimeLib/Ranobelib

sources/                Исходники расширений:
  ru/
    manga/<name>/<name>.js
    anime/<name>/<name>.js
    novel/<name>/<name>.js

dist/                   Собранные расширения + индексы (генерируется автоматически)
  ru/.../<name>.js
  index.json
  manga_index.json
  anime_index.json
  novel_index.json

build.py                Сборщик: конкатит lib/ + source -> dist/
smoke_test.py           Минимальный harness проверки парсеров
RESEARCH.md             Исследование 30 сайтов (Phase 0)
```

### Локальная сборка

```bash
python build.py
# Читает sources/**/*.js, разрешает `// @include: X` директивы (подгружая lib/X.js),
# пишет в dist/<lang>/<type>/<name>.js и обновляет index.json
```

### Smoke-тест

```bash
pip install beautifulsoup4
python smoke_test.py
```

Проверяет, что CSS-селекторы реальных расширений совпадают со структурой живых страниц.

### Добавление нового источника

1. Создайте `sources/ru/<type>/<name>/<name>.js` с `mangayomiSources = [{...}]` манифестом и `class DefaultExtension extends MProvider` реализацией.
2. Если ваш источник из Grouple или Lib-семейства — добавьте `// @include: grouple_base` / `// @include: lib_family_base` в начало файла и просто `class DefaultExtension extends GroupleBase {}` / `extends LibFamilyBase`.
3. `python build.py` → PR.

### API, которое реализует `DefaultExtension`

| Метод | Возвращает | Описание |
|-------|-----------|----------|
| `getPopular(page)` | `{list: [{name, imageUrl, link}], hasNextPage: bool}` | Каталог по популярности |
| `getLatestUpdates(page)` | то же | По дате обновления |
| `search(query, page, filters)` | то же | Поиск |
| `getDetail(url)` | `{name, imageUrl, description, author, genre, status, chapters/episodes: [{name, url, dateUpload, scanlator}]}` | Детали тайтла |
| `getPageList(url)` | `[{url, headers}]` или `[htmlString]` (новеллы) | Страницы главы |
| `getVideoList(url)` | `[{url, originalUrl, quality, headers}]` | Видео эпизода (только для аниме) |
| `getFilterList()` | `[{type_name, ...}]` | Фильтры поиска |
| `getSourcePreferences()` | `[{key, editTextPreference/listPreference/...}]` | Настройки источника |

Подробности: [Mangayomi CONTRIBUTING-JS.md](https://github.com/kodjodevf/mangayomi-extensions/blob/main/CONTRIBUTING-JS.md).

---

## Отчёт о проблеме

Баги / сломанный источник / предложения по новым сайтам — [Issues](../../issues).

Для быстрого исправления домена — идите в Settings источника и меняйте `override_base_url` (где поддерживается).

---

## Лицензия

Apache-2.0 — см. [LICENSE](LICENSE). Код расширений не содержит контента сайтов; всё что они делают — парсят публичные страницы / используют публичные API.

Репозиторий **не аффилирован** ни с одним из источников. Пользуйтесь на свой риск, уважайте Terms of Service сайтов и платите авторам где это возможно.
