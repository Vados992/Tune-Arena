# Tune Arena для Android

Минимальная версия: Android 8 / API 26. Compile/target SDK: 36. Android Gradle Plugin: 8.13.2; Gradle Wrapper: 8.13 с закреплённой SHA-256. Нужен полноценный JDK 17+ с `javac` и Android SDK.

```sh
cd android
./gradlew assembleDebug lint
```

В Windows: `gradlew.bat assembleDebug lint`. Либо открыть эту папку в Android Studio. Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.

Для release AAB:

```sh
./gradlew bundleRelease
```

Без ключа это unsigned release bundle. Для подписи задаются `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Секреты и keystore не коммитятся.

`app/src/main/assets/server.json` содержит начальный HTTPS-сервер. В приложении можно изменить его, открыть email-ссылку внутри текущего сеанса и обновить страницу. Интернет обязателен. Смена адреса не меняет серверные права пользователя.

JavaScript включён для интерфейса, но JavaScript-to-Java bridge отсутствует. Камера разрешается только выбранному origin; микрофон запрещён. Выбор фото и съёмка обрабатываются отдельно: файл камеры выдаётся через непубличный ContentProvider с временным URI-доступом. Общие разрешения на чтение памяти устройства не запрашиваются. Фотографии в служебном camera cache старше суток очищаются при запуске.

Перед распространением проверить на устройстве камеру, отказ в разрешении, выбор из галереи, отмену выбора, возврат после внешнего входа и корректность APK/AAB-подписи.
