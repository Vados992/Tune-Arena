# Развёртывание самостоятельного сервера

Нужны аккаунт Cloudflare, D1, R2 и настроенный Telegram OIDC. Платформенные клиенты используют адрес вашего общего HTTPS-сервера. Эти ресурсы и провайдеры не создаются установкой клиента.

При подключении GitHub через Cloudflare Dashboard использовать [настройки Workers Builds из корня репозитория](CLOUDFLARE_BUILDS_RU.md): Build command `npm run build:cloudflare`, Deploy command `npm run deploy:cloudflare`. Пустой Build command и прямой `npx wrangler deploy` из несобранного корня вызывают ошибку обнаружения статических файлов.

## 1. Собрать web

```sh
cd web
npm ci
npm run build
npx wrangler login
npx wrangler d1 create tune-arena
npx wrangler r2 bucket create tune-arena-photos
```

Сохранить возвращённый D1 database ID. В shell задать `TUNE_D1_DATABASE_ID`, `TUNE_R2_BUCKET_NAME`, `TUNE_APP_ORIGIN` и `TUNE_ADMIN_TELEGRAM_ID`. `TUNE_APP_ORIGIN` — будущий HTTPS-origin Worker/домена. Идентификаторы ресурсов не являются паролями; ключ Cloudflare не включается в исходники.

```sh
npm run deploy:prepare
npm run db:remote
npm run deploy
```

`prepare-cloudflare.mjs` создаёт игнорируемый `dist/server/wrangler.deploy.json`: реальные bindings DB/BUCKET, production, `TRUST_SITE_AUTH=0` и ваш APP_ORIGIN. Development-параметры не переносятся. Remote migrations применяются до выпуска нового кода. Не подменяйте этот файл конфигурацией локальной базы.

## 2. Авторизация

Регистрация пользователей работает только через Telegram. Google, Apple, телефон и email отключены. Задать `TUNE_ADMIN_TELEGRAM_ID` — числовой `sub` аккаунта владельца в проверенном Telegram OIDC token. Публичный никнейм или email не предоставляют права администратора. После завершённого Telegram-входа сервер сверяет сохранённую provider identity с настроенным ID.

Для Telegram задать `TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET`, зарегистрировать callback `https://ваш-сервер/api/auth/telegram/callback` в настройках провайдера. Реальные provider credentials отсутствуют в репозитории.

В production удалить `LOCAL_DEV_AUTH` и `LOCAL_DEV_ADMIN`; `ENVIRONMENT` оставить production. Не включать доверие к Sites headers на открытом Worker. Не задавайте `TUNE_ADMIN_EMAIL` как замену Telegram ID: этот параметр используется лишь при явно доверенной Sites-интеграции. Проверьте негативный вход обычного аккаунта в `/admin`.

## 3. Клиенты

Из корня репозитория выполнить:

```sh
npm run configure -- https://ваш-сервер
```

Команда обновит `desktop/server.json`, `ios/TuneArena/ServerConfig.json`, `android/app/src/main/assets/server.json` и общую конфигурацию. Затем пересобрать нужные клиенты. Для уже установленных тестовых клиентов адрес можно сменить через их настройки.

Размещённая Tune Arena открыта для общего просмотра и установки PWA отдельным изменением политики доступа 7 ноября 2026. Авторизация и серверная проверка администратора сохранены. Экспорт исходников и установка клиента сами по себе не меняют политику вашего самостоятельного сервера.

## 4. Копии данных и обновления

D1 и R2 резервируются отдельно. Миграции неизменяемы после применения. Для обновления сначала прогнать `npm test`, проверить миграции и роль владельца, затем выпустить Worker. Изменения native-оболочки требуют нового пакета и подписи. Текущий механизм не включает автоматическое обновление установщиков.

## Mini App и несколько владельцев

Для встроенного Telegram-входа задать Worker-secret `TELEGRAM_BOT_TOKEN`; для нескольких полных владельцев — `TUNE_ADMIN_TELEGRAM_IDS` через запятую. Старый одиночный ID поддерживается. [Порядок запуска и приёмка](TELEGRAM_MINI_APP_RU.md).
