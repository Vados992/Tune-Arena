# Развёртывание самостоятельного сервера

Нужны аккаунт Cloudflare, D1, R2 и настроенный отправитель email либо Telegram OIDC. Платформенные клиенты используют адрес вашего общего HTTPS-сервера. Эти ресурсы и провайдеры не создаются установкой клиента.

## 1. Собрать web

```sh
cd web
npm ci
npm run build
npx wrangler login
npx wrangler d1 create tune-arena
npx wrangler r2 bucket create tune-arena-photos
```

Сохранить возвращённый D1 database ID. В shell задать `TUNE_D1_DATABASE_ID`, `TUNE_R2_BUCKET_NAME`, `TUNE_APP_ORIGIN` и `TUNE_ADMIN_EMAIL`. `TUNE_APP_ORIGIN` — будущий HTTPS-origin Worker/домена. Идентификаторы ресурсов не являются паролями; ключ Cloudflare не включается в исходники.

```sh
npm run deploy:prepare
npm run db:remote
npm run deploy
```

`prepare-cloudflare.mjs` создаёт игнорируемый `dist/server/wrangler.deploy.json`: реальные bindings DB/BUCKET, production, `TRUST_SITE_AUTH=0` и ваш APP_ORIGIN. Development-параметры не переносятся. Remote migrations применяются до выпуска нового кода. Не подменяйте этот файл конфигурацией локальной базы.

## 2. Авторизация

Для email задать секрет `RESEND_API_KEY` и переменную/секрет `EMAIL_FROM` для подтверждённого домена. Например:

```sh
npx wrangler secret put RESEND_API_KEY --name tune-arena
npx wrangler secret put EMAIL_FROM --name tune-arena
```

`TUNE_ADMIN_EMAIL` должен быть email владельца, который завершит подтверждённый email-вход. Telegram-профиль сам по себе не доказывает владение этим email. Для привязки email к уже авторизованному профилю нужно выполнить email-подтверждение в том же сеансе.

Для Telegram задать `TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET`, зарегистрировать callback `https://ваш-сервер/api/auth/telegram/callback` в настройках провайдера. Реальные provider credentials отсутствуют в репозитории.

В production удалить `LOCAL_DEV_AUTH` и `LOCAL_DEV_ADMIN`; `ENVIRONMENT` оставить production. Не включать доверие к Sites headers на открытом Worker. Проверьте негативный вход обычного аккаунта в `/admin`.

## 3. Клиенты

Из корня репозитория выполнить:

```sh
npm run configure -- https://ваш-сервер
```

Команда обновит `desktop/server.json`, `ios/TuneArena/ServerConfig.json`, `android/app/src/main/assets/server.json` и общую конфигурацию. Затем пересобрать нужные клиенты. Для уже установленных тестовых клиентов адрес можно сменить через их настройки.

Исходный приватный пилот ChatGPT не становится публичным от экспорта исходников или установки клиентов. Его данные и политика доступа не изменены этой работой.

## 4. Копии данных и обновления

D1 и R2 резервируются отдельно. Миграции неизменяемы после применения. Для обновления сначала прогнать `npm test`, проверить миграции и роль владельца, затем выпустить Worker. Изменения native-оболочки требуют нового пакета и подписи. Текущий механизм не включает автоматическое обновление установщиков.
