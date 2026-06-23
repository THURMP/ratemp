import hashlib
import html
import json
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


SOURCE_URL = "https://www.arch.tsinghua.edu.cn/column/rw"
SUPABASE_URL = "https://yongznyjoipfhusfovuw.supabase.co"
SUPABASE_KEY = "sb_publishable_oNmwyxPHP2EHQijG28q41g_OApP8_Gr"
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
OUTPUT_PATH = Path("data/architecture_teachers.json")

DEPARTMENTS = ["建筑系", "城市规划系", "景观学系", "建筑技术科学系"]
SKIP_LINK_TEXT = {
    "CN", "EN", "首页", "简介", "动态", "系所", "招生", "教学", "科研", "人物", "交流", "链接",
    "师资", "学生", "校友", "建筑学", "城乡规划学", "风景园林学", "建筑环境工程", "来源"
}


def normalize_text(value):
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def fetch(url):
    request = Request(
        url,
        headers={
            "User-Agent": "ratemp-demo-arch-sync/0.1 (+https://github.com/gyliang060823-beep/ratemp)"
        },
    )
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_name_and_title(text):
    text = normalize_text(text)
    if text in SKIP_LINK_TEXT:
        return "", ""
    title = ""
    for marker in ["教授", "副教授", "讲师", "研究员", "副研究员", "助理教授"]:
        if marker in text:
            title = marker
            text = text.replace(marker, "")
            break
    name = text.strip()
    return name, title


def looks_like_name(name):
    if not name or name in SKIP_LINK_TEXT:
        return False
    if re.fullmatch(r"[\u4e00-\u9fff·]{2,5}", name):
        return True
    if re.fullmatch(r"[A-Z][A-Za-z.\-]+(?:\s+[a-zA-Z][A-Za-z.\-]+){1,4}", name):
        return True
    return False


def clean_email(text):
    candidates = re.findall(r"[\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,}", text)
    return " / ".join(candidates) if candidates else normalize_text(text)


def teacher_id(name, department):
    digest = hashlib.sha1(f"建筑学院::{department}::{name}".encode("utf-8")).hexdigest()[:16]
    return f"thu-arch-{digest}"


def scrape():
    page_html = fetch(SOURCE_URL)
    tab_contents = re.findall(r'<div class="tabContent">\s*<ul>(.*?)</ul>\s*</div>', page_html, re.S)
    records = []
    for department, content in zip(DEPARTMENTS, tab_contents):
        for item_html in re.findall(r"<li>(.*?)</li>", content, re.S):
            name_match = re.search(
                r'<div class="name">\s*<a href="([^"]*)">\s*<div>(.*?)</div>\s*</a>\s*</div>',
                item_html,
                re.S,
            )
            if not name_match:
                continue
            href = name_match.group(1)
            name, title = parse_name_and_title(strip_tags(name_match.group(2)))
            if not looks_like_name(name):
                continue
            email_match = re.search(r'<div class="info">.*?</div>', item_html, re.S)
            email = clean_email(strip_tags(email_match.group(0))) if email_match else "To be added"
            records.append({
                "id": teacher_id(name, department),
                "name": name,
                "college": "建筑学院",
                "title": title or "To be added",
                "email": email or "To be added",
                "research": department,
                "intro": f"Imported from Tsinghua Architecture faculty page: {SOURCE_URL}",
                "source_url": urljoin(SOURCE_URL, href),
                "scraped_at": datetime.now().isoformat(timespec="seconds"),
            })
    unique = {}
    for record in records:
        unique[record["id"]] = record
    return list(unique.values())


def strip_tags(value):
    return normalize_text(re.sub(r"<[^>]+>", " ", value))


def save_local(records):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def supabase_request(path, method="GET", payload=None):
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for publishing architecture teachers.")
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8", errors="replace")
    return json.loads(body) if body else None


def sync_supabase(records):
    existing = supabase_request("teachers?select=id,name,college")
    existing_ids = {item["id"] for item in existing}
    existing_people = {(item.get("name"), item.get("college")) for item in existing}
    to_insert = [
        {
            "id": item["id"],
            "name": item["name"],
            "college": item["college"],
            "title": item["title"],
            "email": item["email"],
            "research": item["research"],
            "intro": item["intro"],
        }
        for item in records
        if item["id"] not in existing_ids and (item["name"], item["college"]) not in existing_people
    ]
    if to_insert:
        supabase_request("teachers", method="POST", payload=to_insert)
        supabase_request(
            "system_logs",
            method="POST",
            payload={
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "message": f"Imported {len(to_insert)} teachers from Tsinghua Architecture website.",
            },
        )
    return len(to_insert), len(existing_ids)


def main():
    records = scrape()
    records.sort(key=lambda item: (item["research"], item["name"]))
    save_local(records)
    inserted, existing_count = sync_supabase(records)
    print(f"Scraped architecture teachers: {len(records)}")
    print(f"Saved local data to {OUTPUT_PATH}")
    print(f"Supabase existing teachers before sync: {existing_count}")
    print(f"Inserted new teachers: {inserted}")


if __name__ == "__main__":
    main()
