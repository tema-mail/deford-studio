# Планёрка студии – deford.ru/planner/

Перенесена 15.11.2026 из `Deford2027/Deford` (ветка `claude/studio-planner`, папка `planner/`,
адрес был deford2027.github.io/Deford/planner/). Теперь источник – `public/planner/` этого репо,
выкладка вместе с сайтом на FirstVDS Москва.

- `public/planner/index.html` – всё приложение без сборки, `config.js` – адрес и публичный ключ Supabase.
- Данные – в Supabase (проект dnehefuakwacgrmdnezl), не на сервере. Вход – общий пароль студии
  (Supabase → Authentication → Users). Ключ в config.js публичный, без пароля данных не открывает.
- `docs/planner-supabase-setup.sql` – таблица, права и хранилище; запускалось один раз.
- Закрыт от поиска: noindex на странице, `Disallow: /planner/`, исключён из sitemap.
- Бесплатный Supabase засыпает после недели без обращений – включается кнопкой Restore, данные целы.
