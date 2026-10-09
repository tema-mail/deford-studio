# deford-studio

Перенос главной страницы deford-studio.ru с Тильды на код (Astro + чистый CSS).

## Запуск

```bash
npm install
npm run dev        # http://localhost:4321
npm run build
```

## Сверка с оригиналом

```bash
node scripts/shots.mjs https://deford-studio.ru/ ref    # эталон
node scripts/shots.mjs http://localhost:4321/     new   # копия
```

Скриншоты пишутся в `reference/` на ширинах 1440 / 1200 / 980 / 768 / 640 / 480 / 375.

## Состав главной (по блокам Тильды)

| Блок Тильды | Компонент | Статус |
|---|---|---|
| rec4116082401 | Nav | ✅ |
| rec4140995301 | Hero | ✅ |
| rec4124751801 | System | ✅ |
| rec4126606901 | Practice | — |
| rec4135167301 | Cases | — |
| rec4135627701 | About | — |
| rec4135871501 | WhenToCome | — |
| rec4136994401 | Consult | — |
| rec4137240201 | Faq | — |
| rec4137897301 | Footer | — |
| rec4107223701 | Preloader | — |
| rec4107223601 | Курсор | — |
| rec4107224201 | Виджет связи | — |
| rec4107224301 | Cookie-баннер | — |
| rec4209528401 | Попап с формой | — |
