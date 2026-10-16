"""Работа с DNS домена deford.ru через API reg.ru.

Доступ: ~/.config/regru/credentials.json (логин и пароль аккаунта),
IP мака добавлен в белый список API владельцем 17.10.2026.

  python3 scripts/regru.py show          – показать записи зоны
  python3 scripts/regru.py to-beget      – перевести A-записи на сервер Beget
"""

from __future__ import annotations

import json
import pathlib
import ssl
import sys
import urllib.parse
import urllib.request

import certifi

DOMAIN = "deford.ru"
BEGET_IP = "45.12.72.227"
OLD_PAGES = {"185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"}

_ctx = ssl.create_default_context(cafile=certifi.where())
_cr = json.loads(pathlib.Path.home().joinpath(".config/regru/credentials.json").read_text())


def api(method: str, **params) -> dict:
    """Вызов API. Параметры уходят внутри input_data, иначе reg.ru их не видит."""
    payload = {"username": _cr["username"], "password": _cr["password"], **params}
    data = urllib.parse.urlencode(
        {"input_data": json.dumps(payload, ensure_ascii=False), "input_format": "json", "output_format": "json"}
    ).encode()
    req = urllib.request.Request("https://api.reg.ru/api/regru2/" + method, data=data)
    with urllib.request.urlopen(req, timeout=60, context=_ctx) as r:
        return json.loads(r.read().decode())


def records() -> list[dict]:
    res = api("zone/get_resource_records", domains=[{"dname": DOMAIN}])
    if res.get("result") != "success":
        raise SystemExit("API: " + json.dumps(res, ensure_ascii=False)[:300])
    dom = res["answer"]["domains"][0]
    if dom.get("result") != "success":
        raise SystemExit("зона: " + json.dumps(dom, ensure_ascii=False)[:300])
    return dom.get("rrs", [])


def show() -> None:
    for rr in records():
        print(f"  {(rr.get('subname') or '@'):<8} {rr.get('rectype',''):<7} {rr.get('content','')}")


def to_beget() -> None:
    before = records()
    print("было:")
    show()

    # Снимаем всё, что уводит домен на GitHub Pages: A и AAAA корня и CNAME www.
    # AAAA важны: без них браузер по IPv6 всё равно пришёл бы на старый хостинг.
    for rr in before:
        sub = rr.get("subname") or "@"
        typ = rr.get("rectype")
        content = rr.get("content", "")
        if sub not in ("@", "www"):
            continue
        uводит = (
            (typ == "A" and content in OLD_PAGES)
            or (typ == "AAAA" and content.startswith("2606:50c0"))
            or (typ == "CNAME" and sub == "www")
        )
        if not uводит:
            continue
        res = api("zone/remove_record", domains=[{"dname": DOMAIN}],
                  subdomain=sub, record_type=typ, content=content)
        print(f"  снято {sub} {typ} {content}: {res.get('result')}")

    for sub in ("@", "www"):
        res = api("zone/add_alias", domains=[{"dname": DOMAIN}], subdomain=sub, ipaddr=BEGET_IP)
        print(f"  добавлено {sub} A {BEGET_IP}: {res.get('result')}")
        if res.get("result") != "success":
            print("   ", json.dumps(res, ensure_ascii=False)[:200])

    print("стало:")
    show()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "show"
    {"show": show, "to-beget": to_beget}[cmd]()
