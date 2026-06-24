import hashlib
import html
import json
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


SUPABASE_URL = "https://yongznyjoipfhusfovuw.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
OUTPUT_PATH = Path("data/three_colleges_teachers.json")

SOURCES = {
    "ee": {
        "url": "https://www.ee.tsinghua.edu.cn/ryqk/teacher/xxgdzyjs/js2.htm",
        "college": "电子工程系",
    },
    "cs": {
        "url": "https://www.cs.tsinghua.edu.cn/szzk/jzgml.htm",
        "college": "计算机科学与技术系",
    },
    "math": {
        "url": "https://www.math.tsinghua.edu.cn/szdw1/js/ayjs.htm",
        "college": "数学科学系",
    },
}

EE_INSTITUTES = {
    "1": "信息光电子研究所",
    "2": "通信研究所",
    "3": "微波与天线研究所",
    "4": "信息认知与智能系统研究所",
    "5": "电路与系统研究所",
    "6": "信息系统研究所",
    "7": "实验教学中心",
}

EE_TITLES = {
    "1": "高级",
    "2": "副高级",
    "3": "中级",
}

TITLE_PRIORITY = {
    "教授": 1,
    "研究员": 2,
    "副教授": 3,
    "副研究员": 4,
    "高级工程师": 5,
    "助理教授": 6,
    "助理研究员": 7,
    "工程师": 8,
    "高级": 9,
    "副高级": 10,
    "中级": 11,
    "所长": 12,
    "副所长": 13,
}


def fetch(url):
    request = Request(url, headers={"User-Agent": "ratemp-three-college-sync/0.1"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def normalize_text(value):
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def strip_tags(value):
    return normalize_text(re.sub(r"<[^>]+>", " ", value or ""))


def is_name(value):
    return bool(re.fullmatch(r"[\u4e00-\u9fff·]{2,5}", normalize_text(value)))


def clean_missing(value):
    text = normalize_text(value)
    return text if text else "To be added"


def teacher_id(prefix, college, name, source_url):
    digest = hashlib.sha1(f"{college}::{name}::{source_url}".encode("utf-8")).hexdigest()[:16]
    return f"thu-{prefix}-{digest}"


def make_record(prefix, college, name, title, email, research, source_url):
    return {
        "id": teacher_id(prefix, college, name, source_url),
        "name": normalize_text(name),
        "college": college,
        "title": clean_missing(title),
        "email": clean_missing(email),
        "research": clean_missing(research),
        "intro": f"Imported from official Tsinghua faculty page: {source_url}",
        "source_url": source_url,
        "scraped_at": datetime.now().isoformat(timespec="seconds"),
    }


def scrape_ee():
    cfg = SOURCES["ee"]
    page_html = fetch(cfg["url"])
    records = []
    for inst_id, title_id, raw_json in re.findall(
        r"function\s+topage_(\d+)_(\d+).*?var\s+qh_data\s*=\s*(\[.*?\]);",
        page_html,
        re.S,
    ):
        try:
            items = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        for item in items:
            name = normalize_text(item.get("showTitle", "")).replace(" ", "")
            if not is_name(name):
                continue
            fields = item.get("fields") or {}
            source_url = (item.get("url") or {}).get("asString") or cfg["url"]
            email = fields.get("dzyx", "")
            research = fields.get("yjly") or EE_INSTITUTES.get(inst_id, "")
            records.append(make_record(
                "ee",
                cfg["college"],
                name,
                EE_TITLES.get(title_id, ""),
                email,
                EE_INSTITUTES.get(inst_id, research),
                source_url,
            ) | {"research_detail": clean_missing(research)})
    return unique_records(records)


def scrape_cs():
    cfg = SOURCES["cs"]
    page_html = fetch(cfg["url"])
    content_start = page_html.find('<div class="people01">')
    if content_start >= 0:
        page_html = page_html[content_start:]
    records = []
    current_dept = ""
    current_title = ""
    token_pattern = re.compile(
        r"<h4>(?P<dept>.*?)</h4>|<h3>(?P<title>.*?)</h3>|<li>(?P<li>.*?)</li>",
        re.S,
    )
    for match in token_pattern.finditer(page_html):
        if match.group("dept"):
            current_dept = strip_tags(match.group("dept"))
            continue
        if match.group("title"):
            current_title = strip_tags(match.group("title"))
            continue
        block = match.group("li") or ""
        name_match = re.search(r"<h2>\s*<a[^>]+href=\"([^\"]+)\"[^>]*>(.*?)</a>\s*</h2>", block, re.S)
        if not name_match:
            continue
        name = strip_tags(name_match.group(2)).replace(" ", "")
        if not is_name(name):
            continue
        text_fields = [strip_tags(item) for item in re.findall(r"<p>(.*?)</p>", block, re.S)]
        title = next((item for item in text_fields if item and not re.search(r"@|\d{4,}", item)), current_title)
        email_match = re.search(r"[\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,}", block)
        email = email_match.group(0) if email_match else ""
        source_url = urljoin(cfg["url"], name_match.group(1))
        records.append(make_record("cs", cfg["college"], name, title, email, current_dept, source_url))
    return unique_records(records)


def scrape_math():
    cfg = SOURCES["math"]
    page_html = fetch(cfg["url"])
    records = []
    sections = re.split(r'<div class="dept"><div class="deptTil gp-f24">(.*?)</div>', page_html)
    for index in range(1, len(sections), 2):
        dept = strip_tags(sections[index])
        section_html = sections[index + 1]
        post = ""
        for match in re.finditer(r'<div class="post fwBold">(.*?)</div>|<dd><a href="([^"]+)">(.*?)</a></dd>', section_html, re.S):
            if match.group(1):
                post = strip_tags(match.group(1)).replace(" ", "")
                continue
            href = match.group(2)
            name = strip_tags(match.group(3)).replace(" ", "")
            if not is_name(name):
                continue
            title = "教授" if post == "所长" else "副教授" if post == "副所长" else post
            source_url = urljoin(cfg["url"], href)
            records.append(make_record("math", cfg["college"], name, title, "", dept, source_url))
    return unique_records(records)


def unique_records(records):
    by_person = {}
    for record in records:
        key = (record["college"], record["name"])
        current = by_person.get(key)
        if not current or title_rank(record["title"]) < title_rank(current["title"]):
            by_person[key] = record
    return sorted(by_person.values(), key=lambda item: (item["college"], item["research"], item["name"]))


def title_rank(title):
    return TITLE_PRIORITY.get(title, 99)


def save_local(records):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def supabase_request(path, method="GET", payload=None):
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required.")
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
    with urlopen(request, timeout=60) as response:
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
    for start in range(0, len(to_insert), 100):
        supabase_request("teachers", method="POST", payload=to_insert[start:start + 100])
    if to_insert:
        supabase_request("system_logs", method="POST", payload={
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "message": f"Imported {len(to_insert)} teachers from EE, CS, and Math official faculty pages.",
        })
    return len(to_insert), len(existing_ids)


def scrape_all():
    groups = {
        "ee": scrape_ee(),
        "cs": scrape_cs(),
        "math": scrape_math(),
    }
    records = []
    for key, items in groups.items():
        print(f"{key}: {len(items)}")
        records.extend(items)
    return sorted(records, key=lambda item: (item["college"], item["research"], item["name"]))


def main():
    records = scrape_all()
    save_local(records)
    inserted, existing_count = sync_supabase(records)
    print(f"Saved local data to {OUTPUT_PATH}")
    print(f"Total scraped records: {len(records)}")
    print(f"Supabase existing teachers before sync: {existing_count}")
    print(f"Inserted new teachers: {inserted}")


if __name__ == "__main__":
    main()
