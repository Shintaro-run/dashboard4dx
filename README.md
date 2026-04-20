# dashboard4dx

A local-only, single-file Streamlit dashboard that integrates project artifacts
via a single **Function ID** key. Every byte of data stays on the machine running
the app — no outbound network calls beyond `pip install`.

- **Developer:** Shin & Shiobara
- **Version:** 1.0.4
- **License:** MIT

---

## What it does

Drop five kinds of project artifacts into the dashboard. They get joined on
Function ID and presented as KPI tables, charts, a Gantt + calendar, and an
A3-landscape PDF report.

| # | Source (EN / 日本語) | Format | Required structure |
|---|---|---|---|
| 1 | Function ID master / 機能ID一覧 | xlsx | sheet `機能一覧`, **col F** = Function ID, **col G** = Function name. Scan range = row 2 .. last row where col B is filled. Rows whose F cell is empty (section headers, totals) are skipped. Strike-through cells are kept. |
| 2 | WBS / WBS | xlsm | sheet `メイン`, data from row 16. Function ID extracted from cells `機能ID：XXXX` / `機能ID:XXXX` / bare `XXXX` in cols **E–I**. Schedule columns: **P** planned effort, **Q** planned start, **R** planned end, **S** actual start, **T** actual end, **U** actual effort, **V** actual progress %, **AA** planned progress %. |
| 3 | Redmine defect list / Redmine不具合一覧 | csv | columns: トラッカー, ステータス, 担当者, 実開始日, 実終了日, 機能ID, 問題分類. Filter applied: tracker = `不具合管理`. Dates parsed as `MM/DD/YYYY`. |
| 4 | Test counts per spec / 仕様書別テスト集計 | csv | positional columns — A = Function ID, C = total tests, D = executed, E = OK, F = NG. |
| 5 | LoC per Function ID / 機能ID別コード行数 | xlsx | sheet `機能ID別サマリ`, A = Function ID, B = LoC. |
| 6 | Design page counts / 設計書ページ数 | manual form | entered inside the **Design pages** tab; auto-saved to `input/design_pages.json`. |

**Function ID format:** 1–10 ASCII letters followed by 1–10 ASCII digits
(`AUTH001`, `SYM1010`, `ADM01010`, etc.). Full-width letters/digits are
normalised (NFKC) to half-width before matching. Cells may be:

- bare `XXXX`,
- labeled `機能ID：XXXX` / `機能ID:XXXX`, or
- `XXXX：機能名` / `XXXX:name` (the ID followed by a colon and the title
  in the same cell — common in real WBS / Redmine exports).

Hyphenated forms (`AUTH-001`) and other separators are **not** recognised.

A Function ID may legitimately appear with multiple Function names; every
unique `(Function ID, Function name)` pair is kept and joined-data is
duplicated onto each name row.

CSV files may be encoded as **UTF-8 (with or without BOM) or CP932** — the
right encoding is auto-detected so Japanese characters never come back as
mojibake.

---

## Quick start

Requires Python **3.11.9** (3.11.x in general should work, but 3.11.9 is the
pinned target).

```bash
git clone <this-repo>
cd dashboard4dx
python3.11 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run main.py
```

Open the URL Streamlit prints (usually `http://localhost:8501`).

### Try it without real data

`sample_data/` ships fully synthetic files in the exact formats above. Drop
them into the cards on the Dashboard tab to see every screen end-to-end.

To regenerate the sample files:

```bash
python sample_data/generate_samples.py
```

---

## Tabs

The app surfaces five top-level tabs.

### 1. Dashboard

- **Drop your sources** — five drag-and-drop cards (master / WBS / defects /
  tests / code). Each card runs a step-by-step validation as the file lands:
  the T-Rex from the favicon runs along the bottom, jumping over one cactus
  per check (file integrity → sheet/structure → encoding → required columns
  → Function ID extraction → numeric sanity → final dataframe build).
  - On all-clear, the dino reaches the goal.
  - On the first hard error the dino slams into the bad cactus, a “💥 hurt
    T-Rex” popup explains exactly which step failed, and the full structured
    error entry (≤ 3000 chars) is one click away under *“Show detailed log
    entry”*.
- **Project-wide KPIs** — eight metrics across the top: total LoC, open
  defects, test run rate, test pass rate, average bug density, average health
  score, at-risk function count, delayed function count.
- **Integrated tables** — Overview / KPIs / WBS / Defects / Tests /
  Code & Design / All columns, in tabbed views. Clicking any row opens the
  drill-down panel below with that Function ID's full breakdown — schedule,
  effort, every test/code/defect/design metric, composite scores, and the
  list of related defect rows.
- Every column header has a “?” tooltip explaining its definition, source
  column, and how to read it (the cute long-necked dinosaur 🦕 marks each
  tooltip header).

### 2. Charts

Eight Plotly visualisations rebuilt from the joined KPI dataframe and from
saved snapshot history:

- Progress: planned vs actual (horizontal bars, per Function ID)
- Test coverage (OK / NG / not run, stacked)
- LoC × NG scatter (size = design pages, colour = risk score)
- Design pages × LoC scatter (with average-complexity reference line)
- Risk dimensions heatmap
- LoC trend across saved code snapshots
- Test counts trend across saved test snapshots
- Defect trend (weekly opened vs closed + cumulative open line)

Each section title has a “?” tooltip with definition / source / how-to-read,
plus a unique cute B&W dinosaur icon.

A **“Generate PDF report”** button at the top of this tab renders every
chart + the Gantt + a project-wide KPI table to an **A3-landscape** PDF in
the language currently selected. The PDF embeds a CJK-capable font so
Japanese names render correctly. Raw data tables are intentionally excluded
from the report.

### 3. Calendar

- **Gantt chart** at the top — one row per Function ID, planned (grey) +
  actual (green) bars from WBS columns Q–T, today marked with a dashed
  yellow line.
- **FullCalendar** below — month / week / list view. Layers can be toggled:
  WBS planned, WBS actual, defect lifespans (red = unresolved). The view
  opens at the month of the earliest event so sample data is visible
  immediately.

### 4. Design pages

Manual page-count editor. Rows mirror the current master Function IDs;
edits autosave to `input/design_pages.json` and are restored on the next
start. Removing a Function ID from the master simply hides its row — its
stored value is preserved on disk so it reappears if the ID returns later.

### 5. Settings

- **Auto-load of previously imported files** — for each source, see the
  status (auto-loaded / reset for this session) and a button that stops
  auto-loading for the rest of the session. Files on disk are NOT deleted.
- **Per-snapshot deletion** — expand the file list under any source to see
  each saved snapshot with its size and timestamp; a 🗑 popover with a
  two-step confirmation (acknowledge then “Delete”) permanently removes
  that snapshot file. Deleting a Code/Test snapshot removes that point from
  the trend charts on the next render. Empty `<slot>` and `<date>` parent
  folders are pruned automatically.
- **Auto-load of design page counts** — same idea for the design-pages
  store; an expander lists every entry as a small table.
- **Session log** — shows the path of the per-session log file under
  `log/`.

---

## Storage layout

The app writes to two folders next to `main.py`. Both are auto-created on
first use and both are gitignored.

```
input/
├── 2026-04-20/
│   ├── master/   function_master.xlsx
│   ├── wbs/      wbs.xlsm
│   ├── defects/  defects.csv
│   ├── tests/    test_counts_20260420090000.csv
│   └── code/     code_counts_20260420090000.xlsx
├── 2026-04-21/
│   └── ...
└── design_pages.json

log/
└── log_YYYYMMDDhhmmss.log
```

- `input/<date>/<slot>/<filename>` — every successful upload is mirrored
  here. The date folder is taken from the `_YYYYMMDDhhmmss` stamp in the
  filename when present (Code/Test exports), otherwise the upload date.
  Same filename overwrites; different timestamps live alongside each other,
  forming the trend-chart history.
- `input/design_pages.json` — current state of the manual page-count form.
- `log/log_YYYYMMDDhhmmss.log` — one file per Streamlit session. Every
  validation error, PDF-generation error, and any other caught exception is
  appended as a structured block (timestamp, category, summary, context,
  full traceback). The on-screen detail is capped at 3000 characters; the
  log file always retains the untruncated version.

If you ever want a clean slate, delete `input/` and `log/` from the file
system or use the Settings tab. Sample data lives elsewhere, in
`sample_data/`, which is committed to the repo and never modified by the
app.

---

## UI niceties

- **Language toggle** in the title row: `EN` / `日本語`. Affects every
  label, tooltip, chart title, and PDF.
- **Drill-down panel** — click any row in any table on the Dashboard tab to
  surface the full per-Function-ID dossier (WBS schedule, every KPI, the
  list of related defects). Click ✕ to close.
- **🦖 hidden bubble** — clicking the T-Rex icon in the title pops a small
  card with developer/version info; clicking again hides it.
- **Hover help** — every column header, every metric, every chart heading,
  the Gantt heading and the calendar heading carry a “?” icon with a
  formatted definition / source / how-to-read tooltip.
- **Cute B&W dinosaur icons** — each chart and the calendar gets its own
  pixel-art dinosaur (raptor, stego, trike, para, spino, diplo, anky, ptero,
  bronto, plesio); the page favicon and title are the T-Rex.

---

## Privacy & security

- **No outbound network calls.** The only network activity at any point is
  `pip install -r requirements.txt`. The app itself never opens a socket.
- Uploaded data is processed in-memory; the only on-disk writes are under
  `input/`, `log/`, and `resources/icons/` (auto-generated favicon).
- `.gitignore` excludes `input/`, `log/`, `gitignore/`, virtual envs, build
  artifacts, OS files, IDE files, and any common credential file pattern.
  `sample_data/` is intentionally **not** ignored — it is fully synthetic
  and meant to ship with the repo.

---

## Dependencies

Pinned in `requirements.txt`:

| package | purpose |
|---|---|
| `streamlit==1.39.0` | UI framework |
| `pandas==2.2.3` | data wrangling |
| `numpy==2.1.3` | numeric ops |
| `openpyxl==3.1.5` | xlsx / xlsm reader |
| `plotly==5.24.1` | charts (Gantt, scatter, heatmap, etc.) |
| `kaleido==0.2.1` | static PNG export of Plotly figures (PDF report) |
| `reportlab==4.2.5` | PDF generation, embedded CJK font |
| `streamlit-calendar==1.3.1` | FullCalendar component |

Everything is open-source and downloadable from PyPI without additional
network access at runtime.
