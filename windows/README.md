# Tune Arena для Windows

Требования: Windows 10/11 x64, Node.js 24.

В PowerShell, из корня репозитория:

```powershell
npm run desktop:install
npm run desktop
npm run windows
```

Результаты: `desktop/dist/windows/Tune-Arena-Setup-1.0.0-x64.exe` и `Tune-Arena-Portable-1.0.0-x64.exe`. Конфигурация находится в `electron-builder.cjs`; общий клиент — в `../desktop/`.

Тестовые пакеты не имеют Authenticode-подписи. Для доверенного распространения нужен собственный сертификат и отдельная проверка на Windows. Камера запрашивается только для выбранного сервера. У клиента нет доступа Node.js из удалённой веб-страницы. Сетевые ошибки показывают экран восстановления; адрес сервера изменяется через меню.
