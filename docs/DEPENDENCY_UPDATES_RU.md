# Обновления зависимостей и GitHub Actions

Проверено 11 ноября 2026. Автор: Vadym Tsinderhoz.

## Причины отказов

1. Dependabot PR #1 обновил `react-server-dom-webpack` до 19.3.1 и `vinext` до 1.4.5, оставив React/React DOM 19.2.6 и `@vitejs/plugin-rsc` 0.5.26. `npm ci` завершался `ERESOLVE` до тестов. Примеры: [43035604740](https://github.com/Vados992/Tune-Arena/actions/runs/43035604740), [43035593924](https://github.com/Vados992/Tune-Arena/actions/runs/43035593924).
2. Android job вызывал `sdkmanager`, которого не было в PATH runner. Ошибка `command not found`, exit 127, возникала до Gradle. Пример: [43034875107](https://github.com/Vados992/Tune-Arena/actions/runs/43034875107), job 130570957013.
3. `cancel-in-progress: true` позволял следующему запуску прервать упаковку клиентов. В последнем запуске macOS/Windows имеют результат `cancelled`; это не результат ошибки компиляции.

## Исправления

- React, React DOM и RSC зафиксированы на 19.3.1; `@vitejs/plugin-rsc` — 0.5.37. Next и eslint-config-next согласованы на 16.4.6. Сохранены обновления Next, Vite, Zod, Vinext и lock-файлов из PR. Установка проходит без `--force` и `--legacy-peer-deps`.
- Обновлены совместимые инструменты Cloudflare: vite-plugin 1.68.0, Wrangler 4.160.1, workers-types 5.20261110.1; Drizzle Kit 0.31.11. Узкие overrides фиксируют исправленные `sharp` для Miniflare, `tmp` для solc и `fflate` для satori.
- Android workflow явно устанавливает командные инструменты и SDK через `android-actions/setup-android@v3`, проверяет `sdkmanager --version` и использует `ubuntu-24.04`, Java 17, SDK 36 и Build Tools 35.0.0.
- Текущая сборка клиентов больше не отменяется новым запуском. Ручной запуск принимает `platform`: `all`, `desktop`, `android`, `ios`. Пустой параметр означает `all`, в том числе при запуске через старую форму GitHub.
- Dependabot проверяет web, desktop и GitHub Actions еженедельно. Связанные версии framework и Cloudflare сгруппированы. Группировка упрощает проверку, но не гарантирует совместимости будущих версий: обязательна чистая установка и CI.
- CI останавливается при high/critical уязвимостях npm в web и desktop. Проверки и аудит не отключены.

## Фактические результаты

Для исправленного дерева локально успешно выполнены:

- `npm --prefix web ci`, `npm --prefix desktop ci`;
- `npm test`: TypeScript, проверка подписи Mini App, обновление существующей БД, API/SQL, UI, загрузка аватара/машины и desktop policy;
- `npm --prefix web run build`;
- `npm --prefix web run db:local` дважды: все 13 миграций и повтор без изменений;
- `node scripts/check-projects.mjs` и разбор YAML;
- `npm --prefix web audit --audit-level=high`, `npm --prefix desktop audit --audit-level=high`.

На момент проверки npm audit: web — 0 critical, 0 high, 11 moderate, 1 low; desktop — 0 critical, 0 high, 6 moderate, 0 low. Остались предупреждения транзитивных инструментов сборки/линтинга (esbuild-kit/Drizzle, typescript-eslint/minimatch, Babel, electron-builder/minimatch). Аудит не является полным аудитом безопасности приложения; принудительная подмена несовместимых major-версий ради нулевого счётчика не применялась.

Успешные реальные Actions **до этих исправлений**:

- [Web на main 992f12a — 43034874758](https://github.com/Vados992/Tune-Arena/actions/runs/43034874758): тесты, build и два запуска миграций прошли.
- [Клиенты на 5fd6481 — 43030610510](https://github.com/Vados992/Tune-Arena/actions/runs/43030610510): macOS, Windows и iOS прошли с артефактами; Android завершился ошибкой SDK.

Поэтому старый отчёт об отсутствии runner больше не описывает текущие запуски. Исправленный Android workflow и упаковку клиентов с новыми lock-файлами требуется подтвердить отдельным Actions-запуском. В этой сессии они не выдаются за собранные. Все 73 остальных файла платформенных каталогов, конфигурации и downloads совпадают с main; изменён только desktop/package-lock.json.

## Запуск для q5hjdh792d-collab

Доступ `write` подтверждён. Исправления находятся в [PR #1](https://github.com/Vados992/Tune-Arena/pull/1), ветка `dependabot/npm_and_yarn/desktop/npm_and_yarn-298460989c`.

1. Дождаться успешной проверки **Verify web and security** на последнем коммите PR. Старые красные результаты относятся к предыдущему дереву.
2. Открыть **Actions → Build four platform clients → Run workflow** и выбрать указанную ветку PR. Если форма main ещё не показывает `platform`, запуск без параметра соберёт все платформы.
3. Для выборочного запуска до объединения PR использовать GitHub CLI из своего авторизованного аккаунта:

```sh
gh workflow run build-clients.yml --repo Vados992/Tune-Arena --ref dependabot/npm_and_yarn/desktop/npm_and_yarn-298460989c -f platform=android
```

4. После успешных проверок объединить PR в main. В main появится новый выбор платформы в форме; push в main автоматически запускает полную сборку. Артефакты доступны на странице успешного запуска 14 дней.

Ручной запуск коллегой не переносит расходы/лимиты GitHub-hosted runners на его аккаунт. Пакеты остаются тестовыми: для публичного распространения нужны подпись и проверка на устройствах. Сборка не публикует сервер Cloudflare или приложение в магазинах.
