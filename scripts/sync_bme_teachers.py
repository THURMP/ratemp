import html
import json
import re
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


BASE_URL = "https://www.med.tsinghua.edu.cn/"
COLLEGE = "生物医学工程学院"
OUTPUT_PATH = Path("data/bme_teachers.json")
SUPABASE_URL = "https://yongznyjoipfhusfovuw.supabase.co"
SUPABASE_KEY = "sb_publishable_oNmwyxPHP2EHQijG28q41g_OApP8_Gr"

CATEGORY_URLS = {
    "教研系列": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/jyxl1.htm",
    "神经工程": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/jyxl1/sjgc.htm",
    "医学影像": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/jyxl1/yxyx.htm",
    "微纳医学与组织工程": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/jyxl1/wnyxyzzgc.htm",
    "教学系列": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/jxxl.htm",
    "研究系列": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/yjxl.htm",
    "实验技术系列": "https://www.med.tsinghua.edu.cn/jy/szdw1/sygc/syjsxl.htm",
}


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
            "User-Agent": "ratemp-demo-teacher-sync/0.1 (+https://github.com/gyliang060823-beep/ratemp)"
        },
    )
    with urlopen(request, timeout=20) as response:
        raw = response.read()
    return raw.decode("utf-8", errors="replace")


def find_links(page_html, page_url):
    parser = LinkParser()
    parser.feed(page_html)
    return [(urljoin(page_url, href), text) for href, text in parser.links]


def discover_category_pages(category_url):
    seen = set()
    queue = [category_url]
    pages = []
    category_dir = category_url.rsplit("/", 1)[0] + "/"

    while queue:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        pages.append(url)

        page_html = fetch(url)
        time.sleep(0.2)
        for href, text in find_links(page_html, url):
            if not href.startswith(category_dir):
                continue
            if not href.endswith(".htm"):
                continue
            if href not in seen and href not in queue and re.fullmatch(r"\d+|首页|上页|下页|尾页", text):
                queue.append(href)

    return pages


def discover_teacher_links():
    teachers = {}
    for category, category_url in CATEGORY_URLS.items():
        for page_url in discover_category_pages(category_url):
            page_html = fetch(page_url)
            time.sleep(0.2)
            for href, text in find_links(page_html, page_url):
                if "/info/" not in href or not href.endswith(".htm"):
                    continue
                if not looks_like_person_name(text):
                    continue
                teachers[href] = {"name": text, "category": category, "source_url": href}
    return list(teachers.values())


def looks_like_person_name(text):
    if len(text) < 2 or len(text) > 40:
        return False
    blocked = {"首页", "正文", "清华大学", "北京协和医院"}
    if text in blocked:
        return False
    return not any(marker in text for marker in ["/", "查看更多", "招生简章", "Image"])


def extract_detail(record):
    detail_html = fetch(record["source_url"])
    text = html_to_text(detail_html)
    lines = [line for line in text.splitlines() if line.strip()]

    name = record["name"]
    title = extract_title(lines, name)
    email = extract_email(text)
    intro = f"Imported from Tsinghua Medicine public faculty page: {record['source_url']}"

    return {
        "id": teacher_id(record["source_url"]),
        "name": name,
        "college": COLLEGE,
        "title": title or "To be added",
        "email": email or "To be added",
        "research": record["category"],
        "intro": intro,
        "source_url": record["source_url"],
        "source_category": record["category"],
        "scraped_at": datetime.now().isoformat(timespec="seconds"),
    }


def html_to_text(page_html):
    page_html = re.sub(r"(?is)<script.*?</script>", " ", page_html)
    page_html = re.sub(r"(?is)<style.*?</style>", " ", page_html)
    page_html = re.sub(r"(?i)<br\s*/?>", "\n", page_html)
    page_html = re.sub(r"(?i)</p>|</div>|</h\d>|</li>", "\n", page_html)
    text = re.sub(r"(?s)<[^>]+>", " ", page_html)
    text = html.unescape(text)
    return "\n".join(normalize_text(line) for line in text.splitlines())


def extract_title(lines, name):
    for index, line in enumerate(lines):
        if line == name or line.endswith(f" {name}") or name in line:
            for candidate in lines[index + 1 : index + 6]:
                if is_title_line(candidate):
                    return candidate
    for line in lines:
        if COLLEGE in line and is_title_line(line):
            return line
    return ""


def is_title_line(line):
    title_markers = ["教授", "副教授", "讲师", "研究员", "工程师", "院士", "助理教授", "博士后"]
    return any(marker in line for marker in title_markers) and len(line) <= 80


def extract_email(text):
    match = re.search(r"[\w.\-+]+\s*(?:@|\sat\s|\(at\))\s*[\w.\-]+\.[A-Za-z]{2,}", text, re.I)
    if not match:
        return ""
    return re.sub(r"\s*(?:at|\(at\))\s*", "@", match.group(0), flags=re.I).replace(" ", "")


def teacher_id(source_url):
    match = re.search(r"/info/(\d+)/(\d+)\.htm", source_url)
    if match:
        return f"thu-bme-{match.group(1)}-{match.group(2)}"
    safe = re.sub(r"[^a-z0-9]+", "-", source_url.lower()).strip("-")
    return f"thu-bme-{safe[-80:]}"


def save_local(teachers):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(teachers, ensure_ascii=False, indent=2), encoding="utf-8")


def supabase_request(path, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urlopen(request, timeout=30) as response:
        content = response.read().decode("utf-8", errors="replace")
    return json.loads(content) if content else None


def sync_supabase(teachers):
    existing = supabase_request("teachers?select=id")
    existing_ids = {row["id"] for row in existing}
    new_teachers = [
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

    if new_teachers:
        supabase_request("teachers", method="POST", payload=new_teachers)
        supabase_request(
            "system_logs",
            method="POST",
            payload={
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "message": f"Imported {len(new_teachers)} teachers from Tsinghua BME website.",
            },
        )
    return len(new_teachers), len(existing_ids)


def main():
    print("Discovering Tsinghua BME faculty pages...")
    links = discover_teacher_links()
    print(f"Discovered {len(links)} faculty profile links.")

    teachers = []
    for index, record in enumerate(links, start=1):
        try:
            teacher = extract_detail(record)
            teachers.append(teacher)
            print(f"[{index}/{len(links)}] {teacher['name']} - {teacher['title']}")
            time.sleep(0.2)
        except (HTTPError, URLError, TimeoutError) as error:
            print(f"[skip] {record['name']} {record['source_url']}: {error}")

    teachers.sort(key=lambda item: (item["research"], item["name"]))
    save_local(teachers)
    inserted, existing_count = sync_supabase(teachers)
    print(f"Saved local data to {OUTPUT_PATH}")
    print(f"Supabase existing teachers before sync: {existing_count}")
    print(f"Inserted new teachers: {inserted}")


if __name__ == "__main__":
    main()
