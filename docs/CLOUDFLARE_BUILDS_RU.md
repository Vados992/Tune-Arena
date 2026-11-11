# Cloudflare Workers Builds: запуск из репозитория

## Ошибка и исправление

`Could not detect a directory containing static files` возникает, когда Cloudflare выполняет `npx wrangler deploy` из корня без предварительной сборки. В корне находятся команды клиентов, а приложение, зависимости и SSR/API Worker — в `web/`. Это серверное приложение, а не папка готового статического сайта. Строка `No packages! Deleted empty lockfile` относится к пустому набору зависимостей корневого package.json; она не означает, что установлены web-зависимости.

В корень добавлены команды, которые явно устанавливают web-зависимости по lock-файлу, собирают Worker и клиентские файлы, готовят production-привязки D1/R2 и указывают Wrangler путь к готовой серверной конфигурации. Публикация использует закреплённую версию Wrangler из web/node_modules. Миграции применяются перед публикацией; при ошибке публикация не продолжается.

## Настройки существующего Worker

Открыть **Workers & Pages → нужный Worker → Settings → Build**. Ссылка `/ai/models/...` открывает каталог моделей AI и не является настройкой сборки сайта.

| Поле | Значение |
|---|---|
| Production branch | `main` |
| Root directory | корень репозитория: `/`, не `web` и не `dist` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Node.js | `24` (файл `.node-version` уже включён) |

Сохранить обе команды и нажать **Retry build / Повторить сборку** для последнего коммита main. Одного повторения старого запуска без изменения команд недостаточно. Для этого production-процесса отключить автоматические публикации непроизводственных веток; previews требуют отдельной D1/R2 и своего адреса.

## Переменные сборки

В **Build Variables and Secrets** задать собственные значения:

| Переменная | Значение |
|---|---|
| `TUNE_D1_DATABASE_ID` | UUID реально созданной D1 в выбранном аккаунте |
| `TUNE_R2_BUCKET_NAME` | имя существующего R2 bucket для фотографий |
| `TUNE_APP_ORIGIN` | HTTPS-origin приложения, например адрес выбранного Worker без пути |
| `TUNE_WORKER_NAME` | точное имя Worker в Cloudflare; если не указано, используется `tune-arena` |
| `TUNE_ADMIN_TELEGRAM_IDS` | подтверждённые числовые ID владельцев через запятую; при отсутствии владельцы не назначаются |

UUID-заглушка локального preview запрещена для публикации. При отсутствии переменных сборка останавливается до установки зависимостей и указывает отсутствующие настройки. ID аккаунта Cloudflare, имя пользователя GitHub и ник Telegram не заменяют Telegram user ID.

Токен сборки Cloudflare должен иметь права на публикацию Worker и применение миграций D1; D1 и R2 должны принадлежать выбранному аккаунту. Ресурсы создать один раз по [DEPLOYMENT_RU.md](DEPLOYMENT_RU.md); повторные сборки используют их данные.

`TELEGRAM_BOT_TOKEN` задать отдельно как **Worker runtime secret**, чтобы работал вход Mini App. Для browser OIDC нужны отдельные runtime secrets `TELEGRAM_CLIENT_ID`/`TELEGRAM_CLIENT_SECRET`. Секреты не записываются в Git или клиентский bundle. Настройка Telegram описана в [TELEGRAM_MINI_APP_RU.md](TELEGRAM_MINI_APP_RU.md).

## Проверка перед публикацией

Из корня репозитория с указанными переменными:

```sh
npm run build:cloudflare
npm run deploy:cloudflare -- --dry-run
```

`--dry-run` проверяет серверный bundle, модули, assets и привязки без применения remote-миграций и без публикации. Настоящая публикация: `npm run deploy:cloudflare`.

После сборки прямой Wrangler из корня также находит production-конфигурацию через `.wrangler/deploy/config.json`, но рекомендуемая deploy-команда выше дополнительно применяет миграции. Локальный `npm --prefix web run build` сам по себе готовит preview-конфигурацию; для production использовать именно `build:cloudflare`.

GitHub Actions проверяет этот же путь сборки и dry-run с фиктивными идентификаторами и доменом `.invalid`: это тест упаковки, а не публикация в реальный аккаунт. Успешную реальную публикацию подтверждают Cloudflare deployment и проверка адреса сайта.
