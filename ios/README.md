# Tune Arena для iOS / iPadOS

Проект: `TuneArena.xcodeproj`, схема: `TuneArena`. Минимальная версия: iOS 16. В проект включены исходники SwiftUI/WKWebView, Info.plist, иконки, конфигурация сервера и общая схема Xcode. Генератор проекта не требуется.

## Симулятор

На Mac с установленным Xcode:

```sh
xcodebuild -project ios/TuneArena.xcodeproj -scheme TuneArena -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath outputs/ios-simulator CODE_SIGNING_ALLOWED=NO build
```

Или открыть проект, выбрать симулятор и нажать Run.

## Настоящий iPhone и IPA

В Signing & Capabilities выбрать свой Apple Team, проверить уникальность `com.tsinderhoz.tunearena` для своей учётной записи, выбрать устройство и запустить. Для архива из корня репозитория:

```sh
export TUNE_APPLE_TEAM_ID=YOUR_TEAM_ID
./scripts/archive-ios.sh
```

Экспортировать архив через Xcode Organizer либо `xcodebuild -exportArchive` с собственным `ExportOptions.plist` на основе примера. Без Apple Team/сертификата/профиля provisioning подписанный IPA не создаётся.

## Поведение

Клиент загружает общий HTTPS-сервер. Сеансы хранятся в собственном WKWebsiteDataStore. В настройках есть изменение сервера, обновление и открытие ссылки из email внутри приложения. Встроенные браузеры поддерживаются не всеми OAuth-провайдерами; для самостоятельного сервера предусмотрен вход по email-ссылке. Пилот ChatGPT остаётся доступен только разрешённому аккаунту.

Для камеры заданы NSCameraUsageDescription и NSPhotoLibraryUsageDescription. WKWebView разрешает запрос камеры только главному фрейму выбранного сервера; решение отдаётся системному запросу разрешения. Микрофон запрещён. Физическая камера, отмена разрешения, смена ориентации и вход проверяются на реальном iPhone перед выпуском.
