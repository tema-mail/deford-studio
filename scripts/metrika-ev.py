"""Раздел «Метрика и каналы» Deford – кодом эталона EV SIBIR, без переписывания.

Владелец 16.10.2026: «не придумывай, бери с готовых кабинетов». Поэтому сбор, периоды
и экран – модули ~/Documents/ev-sibir/server (metrika, metrika_periods, metrika_report,
metrika_view, metrika_view_ind, gsc, ywm) как есть; здесь только подстановка: счётчик,
цели, домен, и выкладка всех вкладок в один JSON для админки.

Запуск: SSL_CERT_FILE=$(python3 -c "import certifi;print(certifi.where())") python3 scripts/metrika-ev.py
Пишет src/data/analytics/metrika-ev.json (папка в .gitignore – цифры коммерческие).
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "analytics"
EV = pathlib.Path(os.environ.get("EV_SERVER", "~/Documents/ev-sibir/server")).expanduser()
COUNTER = 95336096
SITE = "https://deford-studio.ru"  # счётчик стоит на сайте Тильды, копия на deford.ru пока без счётчика
# Автоцели счётчика Deford → роли целей эталона
GOAL_IDS = {"lead": 312453330, "phone_click": 324131311, "messenger_click": 312453328}

OUT.mkdir(parents=True, exist_ok=True)
os.environ["LEAD_DB"] = str(OUT / "no-leads.db")  # своей базы заявок у сайта нет – блоки берут цели Метрики
os.environ["METRIKA_REPORT_CACHE"] = str(OUT / "metrika_report.json")
sys.path.insert(0, str(EV))

import gsc  # noqa: E402
import metrika  # noqa: E402
import metrika_periods  # noqa: E402
import metrika_report  # noqa: E402
import metrika_view  # noqa: E402
import ywm  # noqa: E402

metrika.COUNTER = COUNTER
gsc.SITE = "sc-domain:deford.ru"  # доступа у сервисного аккаунта нет – блок отдаёт пустой статус
ywm.SITE = "deford-studio.ru"  # API Вебмастера не отвечает из сети


def _counter_info() -> tuple[str, dict]:
    tz = metrika.api(f"/management/v1/counter/{COUNTER}").get("counter", {}).get("time_zone_name") or "Europe/Moscow"
    return tz, dict(GOAL_IDS)


metrika.counter_info = _counter_info

# Тексты эталона, которые у Deford неверны: своей базы заявок нет – формы уходят в Тильду.
# Окно согласия на cookie у сайта есть, поэтому оговорки эталона про cookie оставлены как есть.
FIXES = [
    ("Заявки с форм – все, из базы сайта.",
     "Заявки с форм – цель Метрики «Формы»: своей базы заявок нет, формы уходят в Тильду."),
    ("Все заявки из базы сайта – форма записи и окно скидки. Источник известен, только если человек согласился на "
     "cookie, иначе «Неизвестно».",
     "Отправленные формы сайта – автоцель Метрики «Формы». Источник известен, только если человек согласился на cookie."),
    ("Мессенджеры (Telegram и MAX)", "Мессенджеры (Telegram, MAX, WhatsApp)"),
    ("Переход в Telegram или MAX по кнопкам сайта. Считает Метрика – только посетители с согласием на cookie.",
     "Переход в Telegram, MAX или WhatsApp по кнопкам сайта. Считает Метрика – только посетители с согласием на cookie."),
]


def main() -> None:
    # --cached: только перерисовать из прошлой выгрузки, без запросов к API
    cache = metrika_report.load_cache() if "--cached" in sys.argv else metrika_report.refresh()
    views = {}
    for key, *_ in metrika_periods.PERIODS:
        views[f"ind:{key}"] = metrika_view.render(cache, {"v": "ind", "p": key}, SITE)
    for key, *_ in metrika_report.MODES:
        views[f"cmp:{key}"] = metrika_view.render(cache, {"v": "cmp", "c": key}, SITE)
    for k, html in views.items():
        # обёртка <main> и скрипт кнопки – страницы EV; у нас раздел живёт внутри каркаса админки
        html = html.replace(metrika_view.SCRIPT, "").replace("<main>", "", 1).replace("</main>", "", 1)
        # «· N мин назад» EV считает сервер при каждом показе; у нас разметка застывает – оставляем дату
        html = re.sub(r"(Данные на [0-9.]+, [0-9:]+) · [^<]+", r"\1", html)
        # ссылки на страницы сайта у EV относительные – у нас ведут на сайт с счётчиком
        html = re.sub(r'href="(/(?!admin/)[^"]*)"', lambda m: f'href="{SITE}{m.group(1)}"', html)
        # вкладки «Товарный спрос» нет: у сайта нет товаров, это визитка с заявками
        for a, b in FIXES:
            html = html.replace(a, b)
        views[k] = html
    out = {"fetched_at": cache.get("fetched_at"), "errors": cache.get("errors") or [], "views": views}
    (OUT / "metrika-ev.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    p = (cache.get("periods") or {}).get("month") or {}
    s = p.get("summary") or {}
    print(f"обновлено {cache.get('fetched_at')}; месяц {p.get('date1')}…{p.get('date2')}: визиты {s.get('visits')}, "
          f"посетители {s.get('users')}, целевые {s.get('actions')}")
    for e in out["errors"]:
        print("  ошибка:", e)


if __name__ == "__main__":
    main()
