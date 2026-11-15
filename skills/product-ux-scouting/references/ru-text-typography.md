# 🖋️ Russian Typography, Info-Style & Anti-Neuroslop Guide

*Adapted from `talkstream/ru-text` under the MIT License.*

---

## 1. Russian Typography Invariants

| Element | Correct Usage | Forbidden AI Cliché | Rule & Implementation |
| :--- | :--- | :--- | :--- |
| **Quotation Marks** | `«Ёлочки»` | `"Прямые лапки"` | Use `« »` for primary Russian quotes, `„лапки“` for nested quotes: `«Завод „Красный Октябрь“»` |
| **Em Dash** | `Слово — слово` | `Слово - слово` (дефис) | Em dash `—` surrounded by spaces (non-breaking space before the dash: `&nbsp;—`) |
| **Short Prepositions** | `в&nbsp;сети`, `на&nbsp;сервере` | Hanging prepositions at line ends | Non-breaking space after prepositions/particles: `в`, `на`, `с`, `к`, `о`, `у`, `не`, `ни` |
| **Number & Units** | `10&nbsp;кВт`, `15&nbsp;мс`, `500&nbsp;₽` | `10кВт`, `10 кВт` (wrap to next line) | Non-breaking space between numeric quantity and unit symbol |
| **Number Ranges** | `10–20` (en dash, no space) | `10 - 20` or `10-20` | En dash `–` without spaces for ranges |

---

## 2. Anti-Neuroslop: Eliminating Bureaucratic & LLM Fluff

AI models frequently default to corporate bureaucracy ("канцелярит") and repetitive boilerplate. Apply strict info-style editing:

### Banned Fluff Patterns
- ❌ *"Данное решение позволяет обеспечить эффективное функционирование..."*
  ➔ ✅ *"Решение ускоряет работу..."*
- ❌ *"В целях оптимизации процесса обработки данных было принято решение..."*
  ➔ ✅ *"Чтобы ускорить обработку, мы..."*
- ❌ *"Является важным и неотъемлемым компонентом архитектуры..."*
  ➔ ✅ Cut entirely or describe what the component physically does.
- ❌ *"Необходимо отметить, что..."*, *"Как известно, ..."*, *"Следует подчеркнуть..."*
  ➔ ✅ Delete these filler prefixes.

---

## 3. UX Microcopy Standards

- **Buttons & Actions**: Imperative verb indicating the direct outcome:
  - ❌ *"Отправка"* / *"ОК"* ➔ ✅ *"Сохранить профиль"*, *"Подключить станок"*, *"Сбросить аварию"*.
- **Error Messages**: 3-part formula:
  1. **What happened**: *"Сервер телеметрии не ответил за 5 секунд."*
  2. **Why**: *"Станок выключен или обрыв сети на порту 502."*
  3. **Actionable recovery**: *"Проверьте питание контроллера и нажмите «Повторить подключение»."*
- **Empty States**: Never leave an empty white box with *"Нет данных"*. Provide clear context and a primary CTA: *"Нет подключённых датчиков. Нажмите «Добавить датчик», чтобы начать мониторинг."*
