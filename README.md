# dashboard4dx

A local-only, single-file Streamlit dashboard that integrates project artifacts
via a single **Function ID** key. Every byte of data stays on the machine running
the app — no outbound network calls beyond `pip install`.

- **Developer:** Shin & Shiobara
- **Version:** 1.0.80
- **License:** MIT

---

## What it does

Drop five kinds of project artifacts into the dashboard. They get joined on
Function ID and presented as KPI tables, charts, a Gantt + calendar, and an
A3-landscape PDF report.

| # | Source (EN / 日本語) | Format | Required structure |
|---|---|---|---|
| 1 | Function ID master / 機能ID一覧 | xlsx | sheet `機能一覧`, **col F** = Function ID, **col G** = Function name. Scan range = row 2 .. last row where col B is filled. Rows whose F cell is empty (section headers, totals) are skipped. Strike-through cells are kept. |
| 2 | WBS / WBS | xlsm | sheet `メイン`, data from row 16. Function ID extracted from cells `機能ID：XXXX` / `機能ID:XXXX` / bare `XXXX` in cols **E–I**. Schedule columns: **N** assignee (担当者 on sub-task rows), **P** planned effort, **Q** planned start, **R** planned end, **S** actual start, **T** actual end, **U** actual effort, **V** actual progress %, **AA** planned progress %. Sub-task rows (marked with ● in col L) carry the role keyword (開発/テスト仕様書作成/テスト実施) that drives the 担当者×ロール analytics. |
| 3 | Redmine defect list / Redmine不具合一覧 | csv | columns: トラッカー, ステータス, 担当者, 実開始日, 実終了日, 機能ID, 問題分類. Filter applied: tracker = `不具合管理`. Dates parsed as `MM/DD/YYYY`. |
| 4 | Test counts per spec / 仕様書別テスト集計 | csv | positional columns — A = Function ID, C = 総設定テスト数 (planned total = 実施済 + 未実施), D = 実施済, E = OK, F = NG. |
| 5 | LoC per Function ID / 機能ID別コード行数 | xlsx | sheet `機能ID別サマリ`, A = Function ID, B = LoC. |
| 6 | Design page counts / 設計書ページ数 | manual form | entered inside the **Design pages** tab; auto-saved to `input/design_pages.json`. |
| 7 | Calendar / カレンダー | xlsx | optional. Two sheets: `行事` (global events, cols: date / title / description) and `個人非稼働日` (per-assignee non-working days, cols: assignee / start / end / reason). Powers the calendar tab's event layers. |
| 8 | Team roster / 担当者一覧 | xlsx | optional. Sheet `担当者一覧`, cols: チーム名 / 担当者名 / PC貸与数 / 専用携帯貸与数 / VPNアカウント. Currently surfaced as-is in Settings; the assignee-join with role analytics is not yet wired up. |

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

Seven top-level tabs: **Inputs / Charts / Calendar / 🚨 Alerts /
🏁 Delivery / Design pages / Settings**.

### 1. Inputs

Previously called "Dashboard"; renamed in v1.0.65 because the tab is
really just where data lands + the integrated tables live.

- **Drop your sources** — drag-and-drop cards (master / WBS / defects /
  tests / code / calendar / roster). Each card runs a step-by-step
  validation as the file lands: a pixel-art raptor runs along the bottom,
  jumping over one cactus per check (file integrity → sheet/structure →
  encoding → required columns → Function ID extraction → numeric sanity
  → final dataframe build).
  - On all-clear, the dino reaches the goal.
  - On the first hard error the dino slams into the bad cactus, a
    “💥 hurt stegosaurus” popup explains exactly which step failed, and
    the full structured error entry is one click away under
    *“Show detailed log entry”*.
  - Every card surfaces the file's ingest timestamp (`投入日時
    YYYY-MM-DD HH:MM`) so it's obvious which snapshot is currently
    loaded. A fresh upload always re-plays the dino even when the
    validation pattern matches the previously-cached run.
- **Project-wide KPIs** — eight metrics across the top: total LoC, open
  defects, test run rate, test pass rate, average bug density, average
  health score, at-risk function count, delayed function count.
- **Integrated tables** — Overview / KPIs / WBS / Defects / Tests /
  Code & Design / All columns, in tabbed views. Clicking any row opens
  the drill-down panel below.
- Every column header has a "?" tooltip explaining its definition,
  source column, and how to read it (the cute long-necked dinosaur 🦕
  marks each tooltip header).

#### Drill-down panel (per Function ID)

Opens below the tables when a row is clicked. Sections:

- **Schedule (WBS)** — planned/actual periods, effort, delay days, and a
  `⏰ 終了予定まで` readout that shows *days remaining* / *days overdue
  (in red, non-bold)* / *Completed (MM/DD)* depending on state.
- **Assignees on this feature** — `👥 田中 (開発) · 鈴木 (テスト仕様書
  作成) · 渡辺 (テスト実施)` pulled from the WBS sub-task rows.
- **Role progress mini-bars** — one short stacked bar per analytics role
  showing Completed / In-progress / Not-started counts. Surfaces "dev
  done but test execution not started" bottlenecks at a glance.
- **Sub-task breakdown (expander)** — full table of the feature's WBS
  sub-tasks: task label, assignee, role, planned/actual periods,
  progress %, delay days.
- **Tests**, **Code & Design**, **Composite scores**, **Defects**,
  **Trend (across snapshots)** — pre-existing per-metric sections.

### 2. Charts

Plotly visualisations rebuilt from the joined KPI dataframe and from
saved snapshot history:

- Progress: planned vs actual (horizontal bars, per Function ID)
- Test coverage (OK / NG / not run, stacked)
- LoC × NG scatter (size = design pages, colour = risk score)
- Design pages × LoC scatter (with average-complexity reference line)
- Risk dimensions heatmap
- LoC trend across saved code snapshots
- Test counts trend across saved test snapshots
- Defect trend (weekly opened vs closed + cumulative open line)
- **担当者×ロール analytics** — bubble map (breadth × quality × defect
  exposure, colour = dominant role), 100%-stacked problem-class strip
  per assignee, plus two ⚠️ watch-lists below the bubble map for the
  non-measurable edge cases:
  - **障害 0 件** — tests executed but zero defects registered.
    Ambiguous: genuine quality vs. under-reporting vs. shallow coverage.
    Lists the affected assignees + their role breakdown so the reviewer
    knows where to dig.
  - **テスト未実施** — every feature they touched has 実施済 = 0.
    Process red flag, not a quality signal.

Each section title has a "?" tooltip with definition / source / how-to-
read, plus a unique cute B&W dinosaur icon.

A **"Generate PDF report"** button at the top of this tab renders every
chart + the Gantt + a project-wide KPI table to an **A3-landscape** PDF
in the language currently selected. The 担当者×ロール analytics
(including both watch-lists and the ドミナントロール explanation) gets
its own A4-portrait PDF via a separate button. Both PDFs embed a
CJK-capable font so Japanese names render correctly.

### 3. Calendar

- **Gantt chart** at the top — one row per Function ID, planned (grey) +
  actual (green) bars from WBS columns Q–T, today marked with a dashed
  yellow line.
- **FullCalendar** below — month / week / list view. Layers can be
  toggled: WBS planned, WBS actual, defect lifespans (red = unresolved),
  global events (from the 行事 sheet of the calendar upload), per-
  assignee non-working days (from 個人非稼働日). The view opens at the
  month of the earliest event so sample data is visible immediately.

### 4. 🚨 Alerts

One tile per Function ID whose risk score crossed the alert threshold.
Each tile shows:

- Severity badge (🔴 HIGH / 🟡 MEDIUM / 🔵 LOW).
- **リスクスコア** (0 – 1, higher = more attention needed).
- The feature's 機能ID : 機能名称 + a **labelled date** (終了実績日 /
  終了予定日 / 日付不明) so readers don't have to guess which WBS
  column the date came from.
- One row per breaching metric showing the current value and a culprit
  marker: **X** on the top contributor (main culprit), **△** on other
  metrics that also breached but contributed less.

**Risk score formula** — expanded in a collapsible `ℹ️ リスクスコアの求
め方` expander at the top of the tab:

```
score = Σ(n × w) ÷ Σ(w)
```

| metric | weight w | normalisation n | breach condition |
|---|---|---|---|
| 障害発生率 | **3.0** | `min(1, ir ÷ (2 × threshold))` | ir > threshold |
| 遅延日数 | **1.5** | `min(1, (days − 14) ÷ 46)` (60 d cap) | days > 14 |
| テスト密度 | **1.0** | `max(0, 1 − td ÷ threshold)` | td < threshold |
| テスト未実施率 | **1.0** | `max(0, (% − 60) ÷ 40)` (plan ≥ 10) | % > 60 |

Severity buckets: `> 0.70` → 🔴 HIGH / `> 0.35` → 🟡 MEDIUM /
otherwise 🔵 LOW. Features with every metric in-spec (score = 0) do
not alert.

Sort options (severity / date asc / date desc) + the global Function ID
filter both apply.

### 5. 🏁 Delivery

DORA 5Keys team-delivery performance over the trailing 30 days. Four
metric cards:

- **リードタイム** — median (終了実績日 − 開始予定日) in days.
- **変更失敗率 (CFR)** — % of completed features that have at least one
  Redmine defect registered.
- **障害復旧時間** — median (実終了日 − 実開始日) of defects closed in
  the window.
- **信頼性** — mean fault rate across all features.

Each card is colour-coded **Good / Normal / Bad** vs the DORA 2024
industry bands (collapsed into three tiers). Hover the card for the
metric definition, source column, and the exact band thresholds.

### 6. Design pages

Manual page-count editor. Rows mirror the current master Function IDs
**plus 機能名称** (joined from the master so the reviewer sees the name
inline with each ID); edits autosave to `input/design_pages.json` and
are restored on the next start. Removing a Function ID from the master
simply hides its row — its stored value is preserved on disk so it
reappears if the ID returns later.

### 7. Settings

- **Auto-load of previously imported files** — for each source, see the
  status (auto-loaded / reset for this session) and a button that stops
  auto-loading for the rest of the session. Files on disk are NOT
  deleted.
- **Per-snapshot deletion** — expand the file list under any source to
  see each saved snapshot with its size and timestamp; a 🗑 popover
  with a two-step confirmation permanently removes that snapshot file.
  Deleting a Code/Test snapshot removes that point from the trend
  charts on the next render. Empty `<slot>` and `<date>` parent folders
  are pruned automatically.
- **Alert thresholds** — two numeric inputs for fault-rate and test-
  density breach thresholds. Changes immediately restyle every alert
  tile and recalculate the risk score (the other two components —
  遅延 > 14 days and テスト未実施率 > 60% — are hard-coded for now).
- **Auto-load of design page counts** — same idea for the design-pages
  store; an expander lists every entry as a small table.
- **User settings persistence** — language choice + thresholds survive
  app restarts (saved to `.data/user_settings.json`).
- **Session log** — shows the path of the per-session log file under
  `log/`.

---

## Storage layout

The app writes to two folders next to `main.py`. Both are auto-created on
first use and both are gitignored.

```
input/
├── 2026-04-20/
│   ├── master/    function_master.xlsx
│   ├── wbs/       wbs.xlsm
│   ├── defects/   defects.csv
│   ├── tests/     test_counts_20260420090000.csv
│   ├── code/      code_counts_20260420090000.xlsx
│   ├── calendar/  calendar.xlsx
│   └── roster/    roster.xlsx
├── 2026-04-21/
│   └── ...
└── design_pages.json

.data/
├── design_pages.json      (duplicate pointer — legacy, will be
│                           pruned once the last pre-v1.0 install
│                           has re-saved)
└── user_settings.json     language + threshold selections

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
- **Global Function ID filter** — a sidebar multiselect that narrows
  every tab to just the selected IDs. Alerts, DORA metrics, role
  analytics, and the integrated tables all honour it.
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
| `matplotlib==3.9.2` | pure-Python PNG rendering for the PDF report |
| `reportlab==4.2.5` | PDF generation, embedded CJK font |
| `streamlit-calendar==1.3.1` | FullCalendar component |

Everything is open-source and downloadable from PyPI without additional
network access at runtime.
