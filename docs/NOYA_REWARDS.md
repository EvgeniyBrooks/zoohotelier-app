# NOYA CLUB — ежемесячные подарки

## Выпуск

Профиль показывает 12 клубных уровней и конкретные цифровые подарки. Первый подарок открывается только после полного календарного месяца участия. Годовая предоплата не ускоряет выдачу.

Материалы — первая редакция: новые тексты и практические задания, без заявления о персональной экспертной проверке Евгением Бруксом. Эта версия не обещает индивидуальные консультации, доставку физических товаров, видеокурс или профессиональную квалификацию.

## Доступ и сохранение

Полные материалы встроены только в серверный api/club-diagnostic.js. GET ?reward=1..12 проверяет подпись Telegram, собственный профиль, активную подписку и число полных месяцев. Публичный каталог содержит только описания.

В действующей модели стаж непрерывный: после разрыва он начинается заново. Скачанные материалы остаются у участника. Заметки и фотография обложки хранятся локально под подтвержденным Telegram ID и номером подарка; на сервер не отправляются. HTML-экспорт содержит материал и заполненные поля, печать использует возможности браузера.

## Программа

| Месяц | Уровень | Подарок |
|---|---|---|
|1|Новичок|20 игр на 5 минут|
|2|Ученик|Прогулки без скуки — 12 сценариев|
|3|Стажёр|10 трюков для двоих|
|4|Практик|Нос в деле — 12 поисковых квестов|
|5|Знаток собак|Семейное собачье бинго — 30 заданий|
|6|Тренер|Карта наших побед — 6 разделов обзора полугода|
|7|Наставник|Городские приключения — 10 сценариев|
|8|Кинолог|В дорогу с собакой — 6 списков|
|9|Опытный кинолог|Ваши 4 недели — конструктор занятий|
|10|Мастер|Пёс в кадре — 20 идей съёмки|
|11|Эксперт|Наш мини-фестиваль — 5 станций и диплом участия|
|12|Суперкинолог|Книга вашей команды — 12 страниц года и фотообложка|

## Иллюстрации

Созданы встроенным Imagegen. Финальные проектные файлы: assets/rewards/01.webp … assets/rewards/12.webp. WebP, 560 × 560; общая масса 260874 байта. Это иллюстрации цифровых подарков, не обещание физических товаров.

Общая спецификация всех запросов: single illustration for a mobile NOYA CLUB monthly digital gift card; polished three-dimensional editorial still life, tactile matte materials with realistic details, premium studio photography, charming but not childish; square canvas, entire object group centered in the central 78 percent; uniform dark charcoal #171815 background, softly grounded shadow, warm studio key light, subtle lime rim light; charcoal, ivory, restrained lime #F5FA45 and natural warm tones; no text, letters, numbers, watermarks, logos, borders or UI. transparent_background=false.

Индивидуальные предметные части запросов:

1. An open charcoal activity box with a small warm-yellow dog play ball and a fanned set of cream activity cards, tiny lime paw motif, cozy fabric rope beside it. This represents twenty short dog games.

2. A rolled cream route map with a clearly graphic lime winding trail, a charcoal dog leash laid in a loose loop and one small lime map pin. This represents playful walking routes.

3. A relaxed friendly golden dog seated naturally in three-quarter view offering one front paw gently toward a cropped human palm; a small lime reward-training clicker beside them. A tender voluntary training moment.

4. A sturdy open cardboard box, a folded sage green sniffing cloth and a bold magnifying glass, a subtle dotted lime paw trail leading between them. This represents scent-search mini quests.

5. A cream bingo board with a simple three by three grid of tiny dog-related pictograms, lime and warm coral round counters, two small differently sized hand-shaped wooden tokens beside it. This represents shared family activities.

6. An elegant open dark-green journal showing a clean abstract upward line and several lime check marks, a brushed gold paw medal on a short ribbon and a cream pencil. This represents a personal half-year progress review.

7. A miniature quiet city park scene on a low oval base: soft cream bench, one small stylized tree, a short path and a relaxed sandy-colored dog on a loose lead with owner shown only as minimal legs. This represents calm city adventures.

8. A charcoal travel backpack for a dog owner, a compact folded sage travel bowl, a cream luggage tag with a tiny paw motif, and a folded packing checklist. This represents an organized trip with a dog.

9. Four overlapping cream weekly planner sheets, small lime movable task tiles, a chunky charcoal pencil and a soft green timer. This represents a four-week activity planner.

10. A stylish charcoal camera with a lime wrist strap, two cream instant-photo prints of a friendly dog with natural expressions, soft playful composition. This represents creative dog photos and videos.

11. A small brushed warm-gold paw trophy beside three low lime and cream training cones and an open set of cream game station cards, miniature festival feeling. This represents a five-station friendly dog festival.

12. A premium thick charcoal photo album standing partly open, cream pages, a lovely natural dog portrait visible on a page and a lime fabric bookmark, a small gold paw seal. This represents a personal yearbook celebrating a dog and owner.

## Основы бережной практики

Общие принципы добровольности, коротких занятий, подходящей сложности и присмотра при играх сверялись с материалами организаций ниже. Карточки составлены заново; организации не проверяли и не одобряли эту программу.

- Blue Cross: https://www.bluecross.org.uk/advice/dog/behaviour-and-training/dog-and-puppy-training
- Blue Cross: https://www.bluecross.org.uk/advice/dog/how-to-play-with-your-dog
- Blue Cross: https://www.bluecross.org.uk/advice/dog/enrichment-for-dogs
- Dogs Trust: https://www.dogstrust.org.uk/dog-advice/life-with-your-dog/enrichment/enrichment-activities-for-dogs

## Проверка перед публикацией

Серверные проверки включают 12 подарков, подпись и владельца Telegram, границы полных месяцев, годовую предоплату, отсутствие подписки и ошибки БД. Клиентские сценарии с реальным Telegram initData и сохранение файлов во встроенном браузере требуют проверки в самом Telegram; обычный браузер этого не воспроизводит.

