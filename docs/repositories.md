# Репозитории

Создавай набор через `createRepositories(db)` из `src/db/repositories/index.ts`.
Фабрики принимают libSQL Drizzle database: в приложении передавай `db` из
`config/connection`, в тестах — отдельную базу. Импорт фабрик сам по себе
не читает окружение и не подключается к рабочей базе. Отдельно экспортированы
`createCatalogRepository`, `createUserRepository`, `createLearningRepository`,
`createRecommendationRepository`.

Для логики обучения используй [сервисы](learning-services.md): они уже реализуют
расчёт профиля, ранжирование и обработку ответа FSRS поверх этих операций.

## CRUD всех таблиц

Каждый объект из таблицы имеет одинаковые методы:

```ts
create(data)
get(key)
list(scope, { filter?, limit?, offset? })
update(key, patch)
delete(key)
```

| Объект в repos | Таблица | key | scope для list |
| --- | --- | --- | --- |
| catalog.words | word | { id } | {} |
| catalog.meanings | word_meaning | { id } | {} |
| catalog.examples | word_meaning_example | { id } | {} |
| catalog.cefrLevels | cefr_level | { id } | {} |
| catalog.partsOfSpeech | part_of_speech | { id } | {} |
| catalog.topics | topic | { id } | {} |
| catalog.meaningTopics | word_meaning_topic | { wordMeaningId, topicId } | {} |
| users.users | user | { id } | {} |
| users.settings | user_settings | { userId, key } | { userId } |
| users.profiles | user_recommendation_profile | { userId } | { userId } |
| users.topicProfiles | user_topic_profile | { userId, topicId } | { userId } |
| learning.cards | user_fsrs_data | { userId, wordMeaningId } | { userId } |
| learning.reviews | user_fsrs_review | { userId, id } | { userId } |
| recommendation.assessments | user_vocabulary_assessment | { userId, wordMeaningId } | { userId } |
| recommendation.preferences | user_word_preference | { userId, wordMeaningId } | { userId } |
| recommendation.recommendations | word_recommendation | { userId, id } | { userId } |

`create` возвращает запись; `get/update/delete` — запись или `undefined`.
Поля автоматически выводятся из схем. Типы записей и входов экспортированы
из `src/db/types.ts`, также доступны обобщённые `CreateInput<Table>` и
`UpdateInput<Table, Keys>`.

`id/createdAt/updatedAt` генерируются автоматически. Ключ, `userId` и эти
поля нельзя поменять через `update`; проверка работает и во время выполнения.
`undefined` пропускается, `null` очищает nullable-поле. Пустой patch возвращает
текущую запись без изменения даты обновления. Остальные ограничения и внешние
ключи проверяет SQLite; ошибки не скрываются. Удаления используют CASCADE/RESTRICT
из моделей.

`list` сортирует по ключу, по умолчанию возвращает 100 строк.
`limit` — целое 1..500, `offset` — неотрицательное безопасное целое.
`filter` задаёт равенства полей, включая `null`, и соединяется с обязательным
scope через AND. Фильтр не может снять ограничение по пользователю.

```ts
const examples = await repos.catalog.examples.list({}, {
  filter: { wordMeaningId },
  limit: 100,
});
const settings = await repos.users.settings.list({ userId });
await repos.users.settings.update({ userId, key: "notifications" }, { value: "off" });
```

CRUD — низкоуровневый интерфейс для администрирования/импорта. Для ответов
пользователя используй методы ниже: отдельные CRUD-запросы не обеспечивают
атомарность изменения карточки и журнала или реакции и предпочтения.
Репозитории ограничивают запросы переданным `userId`; его получение из
авторизованного Telegram-пользователя остаётся обязанностью обработчика.

## Словарь и пользователь

`catalog.getMeaningDetails(ids)` загружает до 500 значений за запрос:
слово, CEFR, часть речи, примеры, темы, нормализованные веса и
`effectiveDifficulty`. Сложность берётся из `vocabularyDifficulty` либо из
CEFR: A1=-2, A2=-1, B1=0, B2=1, C1=2, C2=3.
Значения без тем возвращают пустой массив. Примеры и темы загружаются
отдельными запросами, без размножения строк при JOIN.

`catalog.getFullWordInfo(wordId)` возвращает слово с массивом полных
значений либо `undefined`. `replaceMeaningTopics(wordMeaningId, topics)`
атомарно заменяет связи; дубликат темы или ошибка FK не удаляет прежние связи.

`users.getByTelegramId` ищет пользователя.
`users.upsertTelegramUser({ telegramId, username, firstName, lastName })`
создаёт пользователя или обновляет данные Telegram по уникальному ID,
сохраняя `isAdmin`. Отсутствующие username/lastName передаются как `null`.
`catalog.ensureCefrLevel(value)` идемпотентно создаёт один из шести уровней CEFR.
`ensureProfile(userId)` создаёт профиль с defaults, сохраняя существующие настройки.
`setSetting(userId, key, value)` обновляет значение по уникальному ключу.
`setTopicPreference(userId, topicId, { interestWeight?, isBlocked? })`
сохраняет явные предпочтения, не изменяя вычисленную статистику.

## FSRS

- `learning.getSummary(userId)` возвращает число карточек по каждому состоянию
  через GROUP BY, без ограничения размера страницы.
- `learning.introduceMeaning(userId, wordMeaningId, now?)` идемпотентно создаёт
  `createEmptyCard(now)` со `state=New` и `introducedAt`. Повторный вызов
  сохраняет первоначальную дату и состояние. Для принятия рекомендации
  используй `respond`, проверяющий лимиты.
- `getDueCards(userId, now, page?)` возвращает Learning/Review/Relearning
  с `due <= now`, упорядоченные по `due, id`.
- `getNewCards(userId, page?)` возвращает уже добавленные New-карточки
  для первого занятия.
- `getWorkload(userId, now, dayStart, dayEnd)` возвращает `dueCount` и
  `introducedCount`. Для введённых значений используется полуоткрытый
  интервал `[dayStart, dayEnd)`; NULL у старых строк не учитывается.
- `getTopicDueLoad(userId, now)` возвращает `topicId, dueWeight,
  distinctMeanings`. Каждая карточка распределяет единицу нагрузки между
  своими темами пропорционально relevance.
- `getReviewHistory(userId, from, to, page?)` читает журнал за `[from,to)`
  в порядке `review, id`.

`learning.saveReview(userId, wordMeaningId, expectedCard, result, R?)`
принимает исходную запись из БД и `RecordLogItem` от ts-fsrs.
Карточка после ответа и журнал до ответа записываются в одной транзакции.
Проверка исходного состояния предотвращает перезапись результатом,
рассчитанным до другого ответа или ручного изменения. При конфликте перечитай
карточку и пересчитай результат. Manual-события импортируются через CRUD;
обычный путь ответа принимает Again/Hard/Good/Easy. Для первой New-карточки
`retrievabilityBefore` всегда NULL.

```ts
import { fsrs, Rating, State } from "ts-fsrs";

const row = await repos.learning.cards.get({ userId, wordMeaningId });
if (!row) throw new Error("Card not found");
const scheduler = fsrs({ enable_fuzz: false });
const card = repos.learning.toFsrsCard(row);
const now = new Date();
const R = row.state === State.New ? null : scheduler.get_retrievability(card, now, false);
const result = scheduler.next(card, now, Rating.Good);
await repos.learning.saveReview(userId, wordMeaningId, row, result, R);
```

Используй одинаковые параметры FSRS при расчёте R и следующего состояния.

## Данные для профиля и рекомендаций

`recommendation.recordAssessment(userId, wordMeaningId, { knewBefore, source }, at?)`
сохраняет первый ответ, снимок сложности и нормализованные веса тем.
Последующий вызов возвращает первое наблюдение, не меняя его. Новое наблюдение
для значения с карточкой или журналом FSRS запрещено.
Обработчик обязан задавать вопрос до показа перевода/подсказки: БД не знает,
что было раскрыто в интерфейсе.

`getAssessments(userId, from, to, { limit?, after? })` возвращает первичные
наблюдения за `[from,to)`. Курсор: `{ assessedAt, id }`.
`learning.getRecallObservations(userId, from, to, { limit?, after? })`
возвращает Review-события с рейтингом 1..4, известным R и точным интервалом
не менее 24 часов. `previousReviewMillis` вычисляется оконным LAG по полной
предыдущей истории пользователя/значения, включая событие до `from`.
Курсор: `{ review, id }`. Оба метода по умолчанию возвращают 100 строк,
максимум 500; читай до пустой страницы, используя последнюю пару дата/id.

Первое подходящее событие за локальный день, затухание весов, ограничение
вклада одного значения и оценка theta/delta рассчитываются в сервисе.
Репозиторий отдаёт исходные наблюдения без потери предыдущего события.

`replaceStatistics(userId, globalStats, topicStats, at)` атомарно обновляет
вычисленные оценки. Темы, отсутствующие в новом снимке, получают нулевые
оценки. Явные интересы/блокировки и настройки профиля сохраняются.
Снимок с `at` раньше уже записанного `statsUpdatedAt` отклоняется.
Передавай границу данных, использованную при расчёте, и единый полный снимок.

`getUserContext(userId, now, dayStart, dayEnd)` возвращает согласованный
снимок профиля, всех пользовательских тематических профилей и нагрузки.
У нового пользователя профиль может быть `undefined`; создай его через
`ensureProfile`.

`getCandidates(userId, options)` использует курсор `afterMeaningId` и
возвращает полные значения в порядке id. Обязателен `now`, необязательны
`limit, minDifficulty, maxDifficulty, excludeMeaningIds, excludeWordIds`.
Исключаются:

- значения с `isRecommendable=false` и любые существующие FSRS-карточки;
- known, ignored и ещё действующие snoozed; ровно в момент истечения snooze
  значение снова допустимо;
- значения хотя бы с одной заблокированной темой;
- показы этого значения за последние 7 дней;
- значения слова, введённого в обучение за последние 7 дней;
- переданные ID значений и слов текущей выдачи.

Сгенерированная, но не показанная рекомендация не создаёт cooldown.
Кандидаты могут включать несколько значений одного слова: сервис выбирает
одно, после чего исключает wordId. `saveBatch` дополнительно запрещает
несколько значений одного слова в одной выдаче.

Границы сложности выводи из профиля и передавай в запрос. Сервис рассчитывает
score, вероятности, исследовательскую долю и выбирает финальную выдачу.
Для большого пула читай несколько страниц: первые ID сами по себе
не являются лучшими рекомендациями.

## Жизненный цикл рекомендации

`saveBatch(userId, batchId, algorithmVersion, items, now, expiresAt)`
атомарно сохраняет 1..500 выбранных элементов с позициями от 1.
Каждый item содержит `wordMeaningId, reason, predictedKnownProbability,
score, scoreComponents, selectionProbability`. Eligibility проверяется
повторно; ошибка любого элемента откатывает выдачу. Повтор того же batchId
с теми же позициями даёт ошибку уникальности; для чтения используй
`getPendingBatch(userId, batchId, now, page?)`, сортирующий по позиции.

`markShown(userId, recommendationId, now?)` проверяет пользователя, срок
и актуальную допустимость значения, затем устанавливает `shownAt`.
Если новое предложение уже недопустимо, возвращает `undefined`.
Повтор для показанного возвращает первоначальную запись без новой даты.

`respond(userId, recommendationId, feedback, now?, options?)` атомарно
записывает реакцию и связанные изменения:

| feedback | Изменение |
| --- | --- |
| accepted | Проверка срока, eligibility, дневного лимита и нагрузки; новая FSRS-карточка; удаление прежнего предпочтения |
| already_known | Предпочтение known; по явному `assessKnownBeforeReveal=true` — первичное self_report-наблюдение |
| skipped | Snooze на 7 дней |
| too_difficult | Snooze на 30 дней |
| not_interested | Предпочтение ignored |

Для accepted обязательны `options.dayStart/dayEnd`.
Лимит берётся из профиля (без профиля — 10); новые значения приостанавливаются
при `dueCount > max(20, 2 * dailyNewMeaningLimit)`. Проверка и добавление
выполняются внутри одной write-транзакции, включая одновременные запросы.
Ручное `introduceMeaning` не применяет эту политику.

Передавай настоящие границы локального календарного дня из timezone
пользователя. Длина дня при переходах DST может отличаться от 24 часов.
Репозиторий проверяет `dayStart <= now < dayEnd`, но не вычисляет границы
по IANA timezone. Проверять timezone и определять день должен сервис.

Реакция возможна только после показа. Для отсутствующей/чужой рекомендации
возвращается `undefined`; повтор той же реакции идемпотентен, другая реакция
после записанной вызывает `RepositoryConflictError`.
Ответы кроме accepted можно сохранить после expiresAt, если предложение
ранее было показано. Принятие просроченного предложения запрещено.

`RepositoryConflictError` экспортируется из общего index. Ошибки FK/CHECK,
уникальности и драйвера передаются вызывающему коду; при SQLITE_BUSY повторяй
операцию целиком после короткой задержки. Репозитории не повторяют записывающие
операции автоматически.

Дополнительные операции сервисного слоя: `learning.startLearning` атомарно
убирает предпочтение при ручном добавлении, `recommendation.submitAssessment`
сохраняет первичный ответ вместе с known для верного ответа.
`getReadyUnshown(userId, now, limit?, after?)` читает только актуальные
непоказанные предложения с повторной проверкой eligibility; курсор —
`{ createdAt, id }`. Диапазон сложности дополнительно проверяет сервис.

## Проверка

`npm run typecheck` проверяет весь проект. `npm test` запускает проверки
моделей, миграций и репозиториев. Репозитории тестируются с настоящим
`@libsql/client` и миграциями на отдельных базах в памяти: CRUD всех таблиц,
границы дат, фильтры, JSON/Date roundtrip, результат ts-fsrs, атомарность,
повторные реакции и конкурентное принятие при лимите 1.
