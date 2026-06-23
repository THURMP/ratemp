import hashlib
import html
import json
import os
import re
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


TSINGHUA_UNITS_URL = "https://www.tsinghua.edu.cn/yxsz.htm"
SUPABASE_URL = "https://yongznyjoipfhusfovuw.supabase.co"
SUPABASE_KEY = "sb_publishable_oNmwyxPHP2EHQijG28q41g_OApP8_Gr"
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
SUPABASE_DEV_EMAIL = os.environ.get("SUPABASE_DEV_EMAIL")
SUPABASE_DEV_PASSWORD = os.environ.get("SUPABASE_DEV_PASSWORD")
_cached_access_token = None
OUTPUT_PATH = Path("data/all_tsinghua_faculty.json")
REPORT_PATH = Path("data/all_tsinghua_faculty_report.json")

FACULTY_LINK_KEYWORDS = [
    "师资", "教师", "教职", "导师", "人才队伍", "研究队伍", "人员",
    "faculty", "people", "staff", "professor", "teachers", "team"
]
TITLE_MARKERS = [
    "教授", "副教授", "讲师", "研究员", "副研究员", "助理教授", "助理研究员",
    "工程师", "院士", "长聘", "准聘", "博士后", "professor", "associate professor",
    "assistant professor", "lecturer", "researcher"
]
SKIP_UNIT_WORDS = ["书院", "中心", "体育部", "语言教学中心", "艺术教育中心"]
SKIP_NAME_WORDS = [
    "首页", "更多", "新闻", "通知", "招聘", "招生", "联系我们", "学院", "大学",
    "研究院", "研究中心", "实验室", "委员会", "办公室", "中心", "English",
    "交流", "合作", "概况", "科研", "教学", "项目", "成果", "党政", "机构",
    "下载", "服务", "学生", "校友", "人才", "队伍", "方向", "平台", "访问"
]


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            text = normalize_text("".join(self._text))
            if text:
                self.links.append((self._href, text))
            self._href = None
            self._text = []


def normalize_text(value):
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def fetch(url):
    request = Request(
        url,
        headers={
            "User-Agent": "ratemp-demo-all-faculty-sync/0.1 (+https://github.com/gyliang060823-beep/ratemp)"
        },
    )
    with urlopen(request, timeout=8) as response:
        raw = response.read()
    return raw.decode("utf-8", errors="replace")


def links_from_html(page_html, base_url):
    parser = LinkParser()
    parser.feed(page_html)
    return [(urljoin(base_url, href), text) for href, text in parser.links]


def discover_units():
    page_html = fetch(TSINGHUA_UNITS_URL)
    links = links_from_html(page_html, TSINGHUA_UNITS_URL)
    units = {}
    for href, text in links:
        name = clean_unit_name(text)
        if not should_include_unit(name, href):
            continue
        key = (name, normalized_home(href))
        units[key] = {"college": name, "url": normalized_home(href)}
    return list(units.values())


def clean_unit_name(text):
    return normalize_text(text).replace("*", "").strip(" *　")


def should_include_unit(name, href):
    if not name or len(name) > 35:
        return False
    if any(word in name for word in SKIP_UNIT_WORDS):
        return False
    if any(word in name for word in ["院系设置", "奖助体系", "合作研究院"]):
        return False
    if not (name.endswith("学院") or name.endswith("系") or name.endswith("研究院")):
        return False
    host = urlparse(href).netloc
    return host.endswith("tsinghua.edu.cn")


def normalized_home(url):
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/"


def discover_faculty_pages(unit):
    seen = set()
    pages = []
    queue = [unit["url"]]
    host = urlparse(unit["url"]).netloc

    while queue and len(seen) < 5 and len(pages) < 4:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            page_html = fetch(url)
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError):
            continue
        time.sleep(0.05)

        links = links_from_html(page_html, url)
        if is_faculty_page(url, page_html):
            pages.append((url, page_html))
        for href, text in links:
            if urlparse(href).netloc != host:
                continue
            if href in seen or href in queue:
                continue
            joined = f"{text} {href}".lower()
            if any(keyword.lower() in joined for keyword in FACULTY_LINK_KEYWORDS):
                if len(queue) < 12:
                    queue.append(href)

    return pages


def is_faculty_page(url, page_html):
    text = html_to_text(page_html)[:4000].lower()
    marker_count = sum(1 for marker in TITLE_MARKERS if marker.lower() in text)
    joined = url.lower() + " " + text[:500]
    has_keyword = any(keyword.lower() in joined for keyword in FACULTY_LINK_KEYWORDS)
    return has_keyword and marker_count >= 2


def extract_faculty(unit, pages):
    records = {}
    for page_url, page_html in pages:
        links = links_from_html(page_html, page_url)
        page_text = html_to_text(page_html)
        for href, text in links:
            name = clean_name(text)
            if not looks_like_name(name):
                continue
            source_url = href if urlparse(href).netloc else page_url
            department = infer_department(unit, page_url, page_text)
            title = extract_nearby_title(page_text, name)
            if not title:
                continue
            record = make_teacher_record(unit, department, name, title, source_url, page_url)
            records[record["id"]] = record

        for name, title in extract_text_rows(page_text):
            if not looks_like_name(name):
                continue
            department = infer_department(unit, page_url, page_text)
            if not title:
                continue
            record = make_teacher_record(unit, department, name, title, page_url, page_url)
            records[record["id"]] = record
    return list(records.values())


def html_to_text(page_html):
    page_html = re.sub(r"(?is)<script.*?</script>", " ", page_html)
    page_html = re.sub(r"(?is)<style.*?</style>", " ", page_html)
    page_html = re.sub(r"(?i)<br\s*/?>", "\n", page_html)
    page_html = re.sub(r"(?i)</p>|</div>|</h\d>|</li>|</tr>|</td>", "\n", page_html)
    text = re.sub(r"(?s)<[^>]+>", " ", page_html)
    text = html.unescape(text)
    return "\n".join(normalize_text(line) for line in text.splitlines() if normalize_text(line))


def clean_name(value):
    value = normalize_text(value)
    value = re.sub(r"（.*?）|\(.*?\)", "", value)
    if re.search(r"[\u4e00-\u9fff]", value):
        value = re.sub(r"\s+", "", value)
    else:
        value = re.sub(r"\s+", " ", value)
    return value.strip()


def looks_like_name(name):
    if len(name) < 2 or len(name) > 35:
        return False
    if any(word in name for word in SKIP_NAME_WORDS):
        return False
    if any(marker in name for marker in TITLE_MARKERS):
        return False
    if re.fullmatch(r"[\u4e00-\u9fff]{2,4}", name):
        return True
    if re.fullmatch(r"[A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+){1,3}", name):
        return True
    return False


def extract_nearby_title(page_text, name):
    lines = page_text.splitlines()
    for index, line in enumerate(lines):
        if name in line:
            window = " ".join(lines[index:index + 4])
            for marker in TITLE_MARKERS:
                if marker.lower() in window.lower():
                    return clean_title(window)
    return ""


def extract_text_rows(page_text):
    rows = []
    for line in page_text.splitlines():
        if len(line) > 100:
            continue
        for marker in TITLE_MARKERS:
            pattern = rf"(?P<name>[\u4e00-\u9fff]{{2,4}})\s*[,，、\s-]*.*?(?P<title>{re.escape(marker)})"
            match = re.search(pattern, line, re.I)
            if match:
                rows.append((clean_name(match.group("name")), clean_title(match.group("title"))))
                break
    return rows


def clean_title(value):
    value = normalize_text(value)
    for prefix in ["清华大学", "北京清华", "Tsinghua University"]:
        value = value.replace(prefix, "")
    for marker in TITLE_MARKERS:
        if marker.lower() in value.lower():
            return marker if len(value) > 50 else value
    return value[:60] or "To be added"


def infer_department(unit, page_url, page_text):
    for line in page_text.splitlines()[:60]:
        if any(word in line for word in ["系", "方向", "中心"]) and len(line) <= 30:
            return line
    return unit["college"]


def make_teacher_record(unit, department, name, title, source_url, source_page):
    record_key = f"{unit['college']}::{department}::{name}::{source_url}"
    digest = hashlib.sha1(record_key.encode("utf-8")).hexdigest()[:16]
    return {
        "id": f"thu-all-{digest}",
        "name": name,
        "college": unit["college"],
        "title": title or "To be added",
        "email": "To be added",
        "research": department or unit["college"],
        "intro": f"Imported from Tsinghua public faculty page: {source_page}",
        "source_url": source_url,
        "source_page": source_page,
        "scraped_at": datetime.now().isoformat(timespec="seconds"),
    }


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def supabase_request(path, method="GET", payload=None, prefer="return=representation"):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    apikey, bearer = supabase_auth_headers()
    request = Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": apikey,
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    with urlopen(request, timeout=30) as response:
        content = response.read().decode("utf-8", errors="replace")
    return json.loads(content) if content else None


def supabase_auth_headers():
    if SUPABASE_SERVICE_ROLE_KEY:
        return SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY
    if SUPABASE_ACCESS_TOKEN:
        return SUPABASE_KEY, SUPABASE_ACCESS_TOKEN
    if SUPABASE_DEV_EMAIL and SUPABASE_DEV_PASSWORD:
        return SUPABASE_KEY, get_dev_access_token()
    return SUPABASE_KEY, SUPABASE_KEY


def get_dev_access_token():
    global _cached_access_token
    if _cached_access_token:
        return _cached_access_token
    payload = json.dumps({
        "email": SUPABASE_DEV_EMAIL,
        "password": SUPABASE_DEV_PASSWORD,
    }).encode("utf-8")
    request = Request(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        data=payload,
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Content-Type": "application/json",
        },
    )
    with urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
    _cached_access_token = data["access_token"]
    return _cached_access_token


def sync_supabase(teachers):
    existing = supabase_request("teachers?select=id")
    existing_ids = {row["id"] for row in existing}
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
        for item in teachers
        if item["id"] not in existing_ids
    ]
    inserted = 0
    errors = []
    for index in range(0, len(to_insert), 100):
        chunk = to_insert[index:index + 100]
        if not chunk:
            continue
        try:
            supabase_request("teachers", method="POST", payload=chunk)
            inserted += len(chunk)
        except Exception as error:
            errors.append(str(error))
            break
    if inserted:
        try:
            supabase_request(
                "system_logs",
                method="POST",
                payload={
                    "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "message": f"Imported {inserted} teachers from Tsinghua faculty crawler.",
                },
            )
        except Exception:
            pass
    return inserted, len(existing_ids), errors


def main():
    units = discover_units()
    print(f"Discovered {len(units)} official unit sites from Tsinghua yxsz page.")

    all_teachers = {}
    report = []
    for index, unit in enumerate(units, start=1):
        print(f"[{index}/{len(units)}] {unit['college']} {unit['url']}", flush=True)
        pages = discover_faculty_pages(unit)
        teachers = extract_faculty(unit, pages)
        for teacher in teachers:
            all_teachers[teacher["id"]] = teacher
        report.append({
            "college": unit["college"],
            "url": unit["url"],
            "faculty_pages": [page_url for page_url, _ in pages],
            "teacher_count": len(teachers),
        })
        print(f"  pages={len(pages)} teachers={len(teachers)}", flush=True)
        time.sleep(0.05)

    teachers = sorted(all_teachers.values(), key=lambda item: (item["college"], item["research"], item["name"]))
    save_json(OUTPUT_PATH, teachers)
    save_json(REPORT_PATH, report)
    inserted, existing_count, errors = sync_supabase(teachers)
    print(f"Saved local data to {OUTPUT_PATH}")
    print(f"Saved report to {REPORT_PATH}")
    print(f"Supabase existing teachers before sync: {existing_count}")
    print(f"Inserted new teachers: {inserted}")
    if errors:
        print("Supabase sync errors:")
        for error in errors:
            print(error)


if __name__ == "__main__":
    main()
