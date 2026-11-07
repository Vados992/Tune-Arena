# Tune Arena для macOS

Требования: macOS 13+, Node.js 24. Исходный клиент находится в `../desktop/`, платформенная конфигурация — `electron-builder.cjs`.

Из корня репозитория:

```sh
npm run desktop:install
npm run desktop
npm run macos
```

Сборка создаёт отдельные DMG и ZIP для x64 и arm64 в `desktop/dist/macos/`. Сервер: `desktop/server.json`; `npm run configure -- https://your-app.example` изменяет исходную конфигурацию всех клиентов. Меню приложения позволяет выбрать другой HTTPS-сервер и открыть email-ссылку внутри того же сеанса.

Камера требует явного разрешения приложения и macOS. Микрофон не запрашивается. Для разработки пакет собирается без сертификата и без Hardened Runtime; это не notarized release. Для подписанного выпуска установите `TUNE_SIGNED_RELEASE=1`, предоставьте собственные `CSC_LINK`/`CSC_KEY_PASSWORD` и параметры Apple notarization согласно документации electron-builder. Секреты передаются окружением/хранилищем CI, а не исходниками. Такой выпуск требует отдельной проверки подписи и запуска на Mac.
