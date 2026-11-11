# NOYA CLUB — подключение рекуррентных платежей Prodamus

Статус 11.11.2026: код, защищённая запись платежей, чек-аут и интерфейс подготовлены в `feature/club-diagnostic-prototype`; включение платежей **заблокировано конфигурацией**. Действующие оплаты курса не менялись.

## Подключение в Prodamus
1. Создать **отдельный подписной товар NOYA CLUB** с утверждённой ценой в ₽ и периодом (календарный месяц или 30 дней). Проверить совпадение с текстом оферты.
2. Убедиться, что уведомления о повторных списаниях направляются в клубный обработчик. По документации Prodamus для автоматических списаний используется **общий callback URL платёжной формы**. Если эту же форму используют действующие курсы, **не менять URL** без отдельного маршрутизатора уведомлений: сначала используйте отдельную платёжную форму/домен для клуба либо согласуйте безопасную маршрутизацию.
3. Использовать **отдельный** подписной продукт: не заменять ссылки курса и его webhook.

## Переменные окружения в Vercel (preview-ветка)
Создать в Settings → Environment Variables, указать цель Preview и ветку `feature/club-diagnostic-prototype`.

- `NOYA_PRODAMUS_FORM_URL`: URL отдельной формы, например `https://<subdomain>.payform.ru/`.
- `NOYA_PRODAMUS_SUBSCRIPTION_ID`: цифровой ID подписного товара в Prodamus.
- `NOYA_PRODAMUS_SECRET`: секрет подписи Prodamus (Sensitive/Encrypted, **не присылать в переписке**).
- `NOYA_PRODAMUS_SYS`: идентификатор интеграции, согласованный с Prodamus; необходим, если задаётся `urlNotification`.
- `NOYA_PRODAMUS_WEBHOOK_URL`: HTTPS-адрес клуба с путём `/api/club-prodamus-webhook`; важно, чтобы повторные платежи действительно приходили туда через настройки формы.
- `NOYA_CLUB_PRICE_RUB`: точная месячная цена, совпадающая с подписным товаром Prodamus, только цифры.
- `NOYA_CLUB_TERMS_URL`: HTTPS-ссылка на опубликованные условия подписки, периодичность списаний, порядок отмены и возвратов.
- `NOYA_PRODAMUS_ENABLE`: сначала `0`, после успешного теста всех сценариев установить `1`.

Никогда не добавлять Prodamus секреты или service-role ключ Supabase в публичный JavaScript, HTML или GitHub.

## Реализованный маршрут
- `GET /api/club-checkout?status=1`: включена ли оплата и какая цена.
- `POST /api/club-checkout`: проверка Telegram initData и согласия, создание намерения оплаты, подписанный запрос `do=link` Prodamus.
- `POST /api/club-prodamus-webhook`: проверка HMAC `Sign`, домена платёжной формы, обработка успешного первого/повторного платежа.
- `GET /api/club-reward-pdf`: по подписке и двум подтверждённым платежам выдаёт короткую ссылку на `club-rewards/101TRYK_optimized.pdf.pdf`.
- В Vercel три маршрута перенаправляются на `api/club-diagnostic.js` с разными внутренними параметрами, чтобы уложиться в 12 серверных функций тарифа Hobby.
- `public.noya_club_checkout_intents` и RPC `noya_club_record_confirmed_payment` в Supabase: идемпотентная запись платежа и продление срока доступа.

## Безопасное тестирование перед запуском
- Верная ссылка, цена и явное согласие с автопродлением.
- Первый успешный платёж даёт клуб, **но не подарок №1**.
- Повторное подтверждённое списание для той же подписки открывает «101 трюк».
- Дубликат webhook не продлевает доступ повторно.
- Неуспешный/подделанный webhook и возврат на `urlSuccess` не активируют клуб.
- Отдельные course callbacks продолжают работать.
- Проверить реальный Prodamus webhook с подписанным payload: тесты HMAC в GitHub не заменяют проверку с провайдером.
- Проверить доступ к PDF после 1-го и после 2-го списаний внутри Telegram.

## Публикация
GitHub Actions для ветки проходит. 11.11.2026 Vercel вернул ошибку лимита 100 API deployments в сутки (код `api-deployments-free-per-day`), поэтому текущая ветка **ещё не опубликована после консолидации**. Не считать интеграцию работающей, пока новый деплой не станет READY и не пройдут тесты в Telegram.

Документация:
- https://help.prodamus.ru/payform/tekhnicheskaya-dokumentaciya/sozdanie-ssylki-s-avtoplatezhom
- https://help.prodamus.ru/payform/tekhnicheskaya-dokumentaciya/webhook-ob-oplate
- https://help.prodamus.ru/payform/integracii/tekhnicheskaya-dokumentaciya-po-avtoplatezham/uvedomleniya-pri-avtospisanii
