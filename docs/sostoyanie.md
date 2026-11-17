# deford.ru – ход работ

Файл читать первым, в конце работы – строка и коммит.

- 17.11.2026 – кабинет /admin/: второй вход СВЕРХ админа Артёма рядом со входом владельца (схема – ~/Sites/sverh-admin/docs/zamok-dva-vhoda.md). Страницы под случайным ключом, его копии – под ключом владельца (ADMIN_LOGIN/ADMIN_PASS, пароль не менялся) и СВЕРХ (секреты SVERH_LOGIN/SVERH_PASS, локально ~/.config/sverh-admin/dostup.txt). scripts/admin-open.mjs – расшифровка (общая для формы и сейфа Vault.astro), тест – `npm test` в deploy.yml до сборки. Сейф public/admin/vault/metrika.json перешифрован v2 → v3 на оба входа, seal-admin.mjs шифрует так же. «Оставаться в системе» и «Выйти» – те же ключи df_admin_auth/keep.
