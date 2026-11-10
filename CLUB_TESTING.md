# Клуб: тестирование первой версии

Текущая реализация находится в ветке `feature/club-diagnostic-prototype`. Основной курс в `main` не менялся.

## Что готово
- `club-demo.html` — демонстрационная анкета из 10 вопросов, персональный маршрут.
- `api/club-diagnostic.js` — API для сохранения и чтения профилей собак и диагностики. Проверяет подпись Telegram `initData`, наличие профиля `students` и активную подписку `club_subscriptions` (либо права администратора).
- `supabase/migrations/club_profiles_draft.sql` — добавленные таблицы `club_dogs`, `club_diagnostics` с RLS и закрытым прямым доступом.
- Изменения схемы применены в проекте Supabase `imvtdholjeclyznonpdc` миграцией `create_club_dogs_and_diagnostics`.

## Ограничения
- `club-demo.html` пока отдельная страница, а не вкладка в главном меню.
- Для сохранения необходимо открыть страницу внутри Telegram Mini App, где `initData` доступна. Прямое открытие в браузере работает только как демонстрация без сохранения.
- Серверный API допускает только активную клубную подписку или администратора. Платежи/Prodamus пока не интегрированы.
- Повторная диагностика существующей собаки требует передачи `dogId`; текущий демонстрационный интерфейс создаёт новую запись собаки при каждом сохранении. Это нужно исправить до запуска.
- Контент библиотеки и видео ещё не подключены. Названия направлений — предварительные.
- Выраженные трудности одиночества — повод рекомендовать оценку специалиста, а не автоматический диагноз.

## Проверки перед слиянием
1. Проверить отсутствие доступа без валидного Telegram `initData`.
2. Проверить отказ без клубной подписки.
3. Проверить, что администратор может создать профиль и диагностику.
4. Проверить, что пользователь не может записать диагностику к чужой собаке.
5. Проверить сохранение, чтение и повторную диагностику для одной собаки.
6. Проверить работу внутри Telegram и на телефоне.
7. Проверить, что существующие курс и видеоплеер не затронуты.

Не сливать PR в `main`, пока эти проверки не пройдены.

## Проверка Cloudflare Stream — 10 ноября 2026
- В подключённом аккаунте найдено одно готовое видео `6c05ac1743d07d39c393422f659184cb` с названием `неделя 1 (амуниция-диван).mp4`, длительностью 261.03 секунды; `requireSignedURLs=true`.
- Владелец подтвердил: это видео относится к курсу «Управление вниманием». Не добавлять его в библиотеку NOYA CLUB, не изменять его назначение и доступ.
- **Критическая задача перед запуском:** существующий `/api/stream-token.js` выдаёт Cloudflare Stream token по произвольному `videoId` без проверки Telegram initData, подписки или прав на видео. Не использовать его для клуба. Разработать отдельный endpoint, который проверяет Telegram HMAC, клубную подписку и принадлежность видео опубликованному клубному уроку, прежде чем выдавать токен. Оценить и отдельно исправить доступ к видео действующего курса, не ломая учеников.
- Таблицы библиотеки находятся только в черновой миграции `supabase/migrations/club_library_draft.sql` и **не применены** к базе.

## Telegram test, 10 November 2026
- Dedicated bot: @NoyaClubBrooksBot. Telegram initData signature check confirmed in Mini App.
- Branch Preview environment has NOYA_TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (verified names/targets; values not inspected).
- Redeploy after environment changes; verify actual dog save and GET. Do not infer database success from a successful Telegram-only auth check.

- 10.11.2026: Preview Supabase URL corrected to verified `https://imvtdholjeclyznonpdc.supabase.co` after investigating Vercel runtime database errors. Redeploy required. The `SUPABASE_SERVICE_ROLE_KEY` secret is configured but its value is not inspectable; do not log it.
