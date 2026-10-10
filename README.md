# qword_bot

Бот для изучения английских слов с FSRS и рекомендациями новых значений.

- [Алгоритм рекомендаций и модели](docs/new-word-recommendations.md).
- [Ограничения, индексы и миграции](docs/model-integrity.md).
- [API репозиториев и примеры](docs/repositories.md).
- [Алгоритмы и сервисы обучения](docs/learning-services.md).

`src/db/repositories` содержит типизированный CRUD для всех 16 таблиц,
очередь FSRS, историю для оценки профиля, выборку кандидатов и транзакции
показа/принятия рекомендаций.

`src/services` реализует оценку словарного профиля, тематические остатки
памяти, ранжирование и исследование новых слов, персональные настройки
FSRS 6 и выбор следующего шага обучения. Точка входа —
`createLearningServices(db)`; обработчики Telegram подключаются к этим сервисам.

```ts
import { db } from "./src/config/connection";
import { createRepositories } from "./src/db/repositories";

const repos = createRepositories(db);
const user = await repos.users.users.create({ telegramId: 123456789 });
await repos.users.ensureProfile(user.id);
const candidates = await repos.recommendation.getCandidates(user.id, {
  now: new Date(),
  minDifficulty: -3,
  maxDifficulty: -1,
  limit: 100,
});
```

```sh
npm run typecheck
npm test
```

Все тесты используют базы в памяти. Интеграционные тесты репозиториев применяют
настоящие миграции через драйвер libSQL; рабочая база не используется.
Для запуска бота нужны `DB_FILE_NAME` и `TELEGRAM_API` в окружении.

Прежние функции пользователей сохранены в `userRepository.ts`.
В `cardRepository.ts` оставлены совместимые псевдонимы CRUD слов.
API удалённых колод и атрибутов больше нет.
