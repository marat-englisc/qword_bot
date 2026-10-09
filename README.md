# qword_bot
English word learning app

Репозитории используют типы из Drizzle-схем. Поля `id`, `createdAt` и
`updatedAt` заполняются автоматически и не входят в типы входных данных.

| Сущность | Создание | Чтение | Обновление | Удаление |
| --- | --- | --- | --- | --- |
| Колоды | `createDeck` | `getAllDecks`, `getDeckById` | `updateDeckById` | `deleteDeckById` |
| Карточки | `createCard` | `getAllCards`, `getCardById`, `getDeckCards` | `updateCardById` | `deleteCardById` |
| Пользователи | `createUser` | `getAllUsers`, `getUserById`, `getUserByTelegramId` | `updateUserById` | `deleteUserById` |

Колоды и карточки находятся в `src/db/repositories/cardRepository.ts`,
пользователи — в `src/db/repositories/userRepository.ts`.
`changeDeck` сохранён как псевдоним `updateDeckById`.

Создание возвращает новую запись. Чтение одной записи, обновление и удаление
возвращают запись или `undefined`, если она не найдена. Списки упорядочены по `id`.
Обновления частичные: `undefined` пропускается, `null` очищает необязательное поле,
пустой объект возвращает текущую запись без изменений.

Удалить колоду с карточками нельзя: действует `onDelete: "restrict"`.
Связанные данные удаляются согласно `onDelete: "cascade"` в моделях.
Ошибки ограничений базы передаются вызывающему коду.

```ts
import { createDeck, createCard, getDeckCards } from "./src/db/repositories/cardRepository";
import { createUser } from "./src/db/repositories/userRepository";

const deck = await createDeck({ name: "Basics" });
await createCard({ deckId: deck.id, title: "word", transcription: "wɜːd" });
const cards = await getDeckCards(deck.id);
const user = await createUser({ telegramId: 123456789, firstName: "Marat" });
```

Проверки: `npm run typecheck` и `npm test`.
Интеграционные тесты создают схему из моделей в SQLite в памяти; рабочая база
не используется.
