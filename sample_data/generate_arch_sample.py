"""Regenerate sample_data/architecture_sample.zip — the bundled demo
architecture that the dashboard's "🎁 Install sample architecture" button
imports at runtime.

The data is defined here as plain Python (not in arch.py) so the runtime
module stays free of demo content. Maintainers run this whenever the demo
needs to evolve (new phase, schema bump, sharper labels, etc.).

Default behaviour: backup any existing input/architecture/, build the demo
in-place, export to a .zip, save it to sample_data/, then restore the
backup. So your local working architecture is never touched.

Usage::

    python sample_data/generate_arch_sample.py            # rebuild the zip
    python sample_data/generate_arch_sample.py --install  # also leave the
                                                          # built data in
                                                          # input/architecture/
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import arch  # noqa: E402


# ---------------------------------------------------------------------------
# Sample data — extended at every phase to exercise newly implemented
# features. Phases covered: 0–8 + free text annotations.
# ---------------------------------------------------------------------------

def _sample_pages_v1() -> list[dict]:
    """Initial root page state — captured into the baseline snapshot."""
    return [
        {"id": "o_root_user", "type": "stamp", "stamp_id": "user", "x": 60, "y": 80, "label": "End user", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_root_mobile", "type": "stamp", "stamp_id": "mobile", "x": 60, "y": 280, "label": "Mobile user", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_root_webapp", "type": "box", "x": 240, "y": 70, "label": "Web App", "color_tag": "frontend", "fid": None, "link_to_page": "p_frontend", "stamp_id": None},
        {"id": "o_root_mobileapp", "type": "box", "x": 240, "y": 270, "label": "Mobile App", "color_tag": "frontend", "fid": None, "link_to_page": "p_frontend", "stamp_id": None},
        {"id": "o_root_apigw", "type": "box", "x": 460, "y": 170, "label": "API Gateway", "color_tag": "backend", "fid": None, "link_to_page": "p_api", "stamp_id": None},
        {"id": "o_root_extapi", "type": "stamp", "stamp_id": "external_api", "x": 660, "y": 80, "label": "Stripe / SES", "color_tag": "external", "fid": None, "link_to_page": None},
        {"id": "o_root_backend", "type": "box", "x": 660, "y": 270, "label": "Backend Services", "color_tag": "backend", "fid": None, "link_to_page": "p_backend", "stamp_id": None},
        {"id": "o_root_db", "type": "stamp", "stamp_id": "db", "x": 460, "y": 410, "label": "Storage", "color_tag": "data", "fid": None, "link_to_page": "p_data"},
        {"id": "o_root_old", "type": "box", "x": 60, "y": 440, "label": "Test box (will be removed)", "color_tag": "deprecated", "fid": None, "link_to_page": None, "stamp_id": None},
        {"id": "e_root_1", "type": "edge", "from": "o_root_user", "to": "o_root_webapp", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_root_2", "type": "edge", "from": "o_root_mobile", "to": "o_root_mobileapp", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_root_3", "type": "edge", "from": "o_root_webapp", "to": "o_root_apigw", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_root_4", "type": "edge", "from": "o_root_mobileapp", "to": "o_root_apigw", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_root_5", "type": "edge", "from": "o_root_apigw", "to": "o_root_backend", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_root_6", "type": "edge", "from": "o_root_extapi", "to": "o_root_backend", "label": "", "color_tag": "external", "fid": None, "link_to_page": None},
        {"id": "e_root_7", "type": "edge", "from": "o_root_backend", "to": "o_root_db", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
    ]


def _sample_pages_root_v2(v1: list[dict]) -> list[dict]:
    """Mid-evolution state — saved as a second snapshot. Removes the old
    test box and adds a draft note. Used as a between-state so the snapshot
    list has more than one entry to demo against."""
    out = []
    for o in v1:
        if o["id"] == "o_root_old":
            continue  # removed
        else:
            out.append(o)
    out.append({
        "id": "o_root_draft_note", "type": "box", "x": 60, "y": 440,
        "label": "📝 Draft notes — review pending",
        "color_tag": "neutral", "fid": None, "link_to_page": None, "stamp_id": None,
    })
    return out


def _sample_pages_root_current(v2: list[dict]) -> list[dict]:
    """Final root state. Diff vs v1 / v2 shows added / removed / moved / changed."""
    out = []
    for o in v2:
        if o["id"] == "o_root_draft_note":
            # promote to the polished announcement note
            out.append({
                "id": "o_root_note", "type": "box", "x": 60, "y": 440,
                "label": "📘 Sample architecture — exercises every feature.",
                "color_tag": "neutral", "fid": None, "link_to_page": None, "stamp_id": None,
            })
            continue
        if o["id"] == "o_root_extapi":
            out.append({**o, "y": 60})  # moved
            continue
        if o["id"] == "o_root_apigw":
            # changed label + added object-to-object link (green ↗ badge will
            # appear on this box, jumping straight to /auth/login on the API
            # layer instead of just landing on the page)
            out.append({
                **o,
                "label": "API Gateway v2",
                "link_to_object": {"page_id": "p_api", "object_id": "o_api_login"},
            })
            continue
        out.append(o)
    out.append({
        "id": "o_root_showcase", "type": "box", "x": 460, "y": 540,
        "label": "🎨 Stamps showcase →",
        "color_tag": "accent", "fid": None, "link_to_page": "p_showcase", "stamp_id": None,
    })
    out.append({
        "id": "o_root_dangling", "type": "box", "x": 700, "y": 540,
        "label": "🔗 Broken link demo",
        "color_tag": "deprecated", "fid": None,
        "link_to_page": "p_does_not_exist", "stamp_id": None,
    })
    out.append({
        "id": "o_root_text_live", "type": "text", "x": 540, "y": 158,
        "label": "🚀 LIVE",
        "color_tag": "deprecated", "fid": None, "link_to_page": None, "stamp_id": None,
    })
    return out


def _make_demo_diagram_png() -> bytes:
    """Tiny placeholder PNG used to demo the description-with-images feature."""
    import io as _io
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(5, 2.4), dpi=100)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5)
    boxes = [(1.5, 2.5, "Client"), (5.0, 2.5, "API Gateway"), (8.5, 2.5, "Service")]
    for x, y, label in boxes:
        ax.add_patch(plt.Rectangle((x - 1, y - 0.7), 2, 1.4,
                                    facecolor="#dbeafe", edgecolor="#3b82f6", linewidth=1.5))
        ax.text(x, y, label, ha="center", va="center",
                fontsize=11, weight="bold", color="#1e3a8a")
    ax.annotate("", xy=(4.0, 2.5), xytext=(2.5, 2.5),
                arrowprops=dict(arrowstyle="->", lw=1.5, color="#475569"))
    ax.annotate("", xy=(7.5, 2.5), xytext=(6.0, 2.5),
                arrowprops=dict(arrowstyle="->", lw=1.5, color="#475569"))
    ax.text(3.25, 2.95, "request", ha="center", fontsize=9, color="#64748b")
    ax.text(6.75, 2.95, "auth + route", ha="center", fontsize=9, color="#64748b")
    ax.axis("off")
    fig.patch.set_facecolor("#ffffff")
    buf = _io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=100)
    plt.close(fig)
    return buf.getvalue()


def _sample_frontend_objects() -> list[dict]:
    return [
        {"id": "o_fe_browser", "type": "stamp", "stamp_id": "browser", "x": 60, "y": 80, "label": "Browser", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_fe_mobile", "type": "stamp", "stamp_id": "mobile", "x": 60, "y": 280, "label": "Mobile", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_fe_login", "type": "box", "x": 260, "y": 70, "label": "Login", "color_tag": "frontend", "fid": "AUTH001", "link_to_page": None, "stamp_id": None},
        {"id": "o_fe_profile", "type": "box", "x": 260, "y": 220, "label": "Profile", "color_tag": "frontend", "fid": "USER010", "link_to_page": None, "stamp_id": None},
        {"id": "o_fe_search", "type": "box", "x": 260, "y": 370, "label": "Search", "color_tag": "frontend", "fid": "SEARCH01", "link_to_page": None, "stamp_id": None},
        {"id": "o_fe_cart", "type": "box", "x": 480, "y": 70, "label": "Cart", "color_tag": "frontend", "fid": "CART001", "link_to_page": None, "stamp_id": None},
        {"id": "o_fe_checkout", "type": "box", "x": 480, "y": 220, "label": "Checkout", "color_tag": "frontend", "fid": "ORD001", "link_to_page": None, "stamp_id": None},
        {"id": "o_fe_back", "type": "box", "x": 680, "y": 460, "label": "↑ Back to Root", "color_tag": "neutral", "fid": None, "link_to_page": "p_root", "stamp_id": None},
        {"id": "e_fe_1", "type": "edge", "from": "o_fe_browser", "to": "o_fe_login", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_fe_2", "type": "edge", "from": "o_fe_browser", "to": "o_fe_search", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_fe_3", "type": "edge", "from": "o_fe_browser", "to": "o_fe_cart", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_fe_4", "type": "edge", "from": "o_fe_mobile", "to": "o_fe_login", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_fe_5", "type": "edge", "from": "o_fe_mobile", "to": "o_fe_cart", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_fe_6", "type": "edge", "from": "o_fe_login", "to": "o_fe_profile", "label": "after login", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_fe_7", "type": "edge", "from": "o_fe_cart", "to": "o_fe_checkout", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
    ]


def _sample_api_objects() -> list[dict]:
    return [
        {"id": "o_api_login", "type": "box", "x": 60, "y": 70, "label": "/auth/login", "color_tag": "backend", "fid": "AUTH001", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_register", "type": "box", "x": 60, "y": 180, "label": "/auth/register", "color_tag": "backend", "fid": "AUTH002", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_reset", "type": "box", "x": 60, "y": 290, "label": "/auth/reset", "color_tag": "backend", "fid": "AUTH003", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_profile", "type": "box", "x": 280, "y": 70, "label": "/user/profile", "color_tag": "backend", "fid": "USER010", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_cart_add", "type": "box", "x": 280, "y": 180, "label": "/cart/add", "color_tag": "backend", "fid": "CART001", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_cart_remove", "type": "box", "x": 280, "y": 290, "label": "/cart/remove", "color_tag": "backend", "fid": "CART002", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_checkout", "type": "box", "x": 500, "y": 70, "label": "/order/checkout", "color_tag": "backend", "fid": "ORD001", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_pay_charge", "type": "box", "x": 500, "y": 180, "label": "/payment/charge", "color_tag": "backend", "fid": "PAY001", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_pay_refund", "type": "box", "x": 500, "y": 290, "label": "/payment/refund", "color_tag": "backend", "fid": "PAY001", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_search", "type": "box", "x": 720, "y": 70, "label": "/search", "color_tag": "backend", "fid": "SEARCH01", "link_to_page": None, "stamp_id": None},
        {"id": "o_api_to_backend", "type": "box", "x": 720, "y": 290, "label": "→ Backend Services", "color_tag": "neutral", "fid": None, "link_to_page": "p_backend", "stamp_id": None},
        {"id": "o_api_back", "type": "box", "x": 720, "y": 460, "label": "↑ Back to Root", "color_tag": "neutral", "fid": None, "link_to_page": "p_root", "stamp_id": None},
        {"id": "e_api_pay", "type": "edge", "from": "o_api_checkout", "to": "o_api_pay_charge", "label": "calls", "color_tag": None, "fid": "PAY001", "link_to_page": None},
        {"id": "e_api_refund", "type": "edge", "from": "o_api_pay_refund", "to": "o_api_to_backend", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_api_login", "type": "edge", "from": "o_api_login", "to": "o_api_to_backend", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_api_search", "type": "edge", "from": "o_api_search", "to": "o_api_to_backend", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
    ]


def _sample_backend_objects() -> list[dict]:
    return [
        {"id": "o_be_auth_worker", "type": "box", "x": 60, "y": 80, "label": "Auth Worker", "color_tag": "backend", "fid": "AUTH001", "link_to_page": None, "stamp_id": None},
        {"id": "o_be_order_worker", "type": "box", "x": 60, "y": 240, "label": "Order Worker", "color_tag": "backend", "fid": "ORD001", "link_to_page": None, "stamp_id": None},
        {"id": "o_be_notify_worker", "type": "box", "x": 60, "y": 400, "label": "Notification Worker", "color_tag": "backend", "fid": "NOTIFY01", "link_to_page": None, "stamp_id": None},
        {"id": "o_be_q1", "type": "stamp", "stamp_id": "queue", "x": 280, "y": 80, "label": "auth events", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_be_q2", "type": "stamp", "stamp_id": "queue", "x": 280, "y": 240, "label": "order events", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_be_q3", "type": "stamp", "stamp_id": "queue", "x": 280, "y": 400, "label": "notify events", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "o_be_cache", "type": "stamp", "stamp_id": "cloud", "x": 480, "y": 240, "label": "Cache", "color_tag": "infra", "fid": None, "link_to_page": None},
        {"id": "o_be_to_api", "type": "box", "x": 660, "y": 80, "label": "← API Layer", "color_tag": "neutral", "fid": None, "link_to_page": "p_api", "stamp_id": None},
        {"id": "o_be_to_data", "type": "box", "x": 660, "y": 240, "label": "→ Data Layer", "color_tag": "neutral", "fid": None, "link_to_page": "p_data", "stamp_id": None},
        {"id": "o_be_back", "type": "box", "x": 660, "y": 400, "label": "↑ Back to Root", "color_tag": "neutral", "fid": None, "link_to_page": "p_root", "stamp_id": None},
        {"id": "e_be_1", "type": "edge", "from": "o_be_auth_worker", "to": "o_be_q1", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_be_2", "type": "edge", "from": "o_be_order_worker", "to": "o_be_q2", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_be_3", "type": "edge", "from": "o_be_notify_worker", "to": "o_be_q3", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_be_4", "type": "edge", "from": "o_be_q1", "to": "o_be_cache", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_be_5", "type": "edge", "from": "o_be_q2", "to": "o_be_cache", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_be_6", "type": "edge", "from": "o_be_cache", "to": "o_be_to_data", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
    ]


def _sample_data_objects() -> list[dict]:
    return [
        {"id": "o_data_primary", "type": "stamp", "stamp_id": "db", "x": 80, "y": 80, "label": "Primary DB", "color_tag": "data", "fid": None, "link_to_page": None},
        {"id": "o_data_replica", "type": "stamp", "stamp_id": "db", "x": 80, "y": 240, "label": "Replica", "color_tag": "data", "fid": None, "link_to_page": None},
        {"id": "o_data_warehouse", "type": "stamp", "stamp_id": "db", "x": 80, "y": 400, "label": "Warehouse", "color_tag": "data", "fid": None, "link_to_page": None},
        {"id": "o_data_audit", "type": "box", "x": 280, "y": 80, "label": "Audit Logger", "color_tag": "data", "fid": "AUDIT01", "link_to_page": None, "stamp_id": None},
        {"id": "o_data_export", "type": "box", "x": 280, "y": 240, "label": "Export Service", "color_tag": "data", "fid": "EXP001", "link_to_page": None, "stamp_id": None},
        {"id": "o_data_import", "type": "box", "x": 280, "y": 400, "label": "Import Service", "color_tag": "data", "fid": "IMP001", "link_to_page": None, "stamp_id": None},
        {"id": "o_data_sync", "type": "box", "x": 500, "y": 80, "label": "Settings Sync", "color_tag": "data", "fid": "SYNC001", "link_to_page": None, "stamp_id": None},
        {"id": "o_data_deprecated", "type": "box", "x": 500, "y": 240, "label": "Old PII Store", "color_tag": "deprecated", "fid": None, "link_to_page": None, "stamp_id": None},
        {"id": "o_data_back", "type": "box", "x": 500, "y": 400, "label": "↑ Back to Root", "color_tag": "neutral", "fid": None, "link_to_page": "p_root", "stamp_id": None},
        {"id": "e_data_1", "type": "edge", "from": "o_data_primary", "to": "o_data_replica", "label": "replication", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_data_2", "type": "edge", "from": "o_data_primary", "to": "o_data_warehouse", "label": "ETL", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_data_3", "type": "edge", "from": "o_data_audit", "to": "o_data_primary", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_data_4", "type": "edge", "from": "o_data_export", "to": "o_data_warehouse", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_data_5", "type": "edge", "from": "o_data_import", "to": "o_data_primary", "label": "", "color_tag": None, "fid": None, "link_to_page": None},
        {"id": "e_data_6", "type": "edge", "from": "o_data_deprecated", "to": "o_data_primary", "label": "deprecated", "color_tag": "deprecated", "fid": None, "link_to_page": None},
    ]


def _sample_showcase_objects() -> list[dict]:
    out: list[dict] = []
    rows = [
        ("Factory", "factory", ["conveyor", "robotic_arm", "control_panel", "sensor", "plc", "agv"], "infra"),
        ("Machines", "machines", ["lathe", "press", "cnc", "motor", "pump", "compressor"], "infra"),
        ("Medical", "medical", ["stethoscope", "hospital", "pill", "iv_bag", "monitor", "syringe"], "accent"),
    ]
    for ri, (label, prefix, ids, tag) in enumerate(rows):
        y = 80 + ri * 160
        out.append({
            "id": f"o_show_{prefix}_label", "type": "box",
            "x": 40, "y": y - 8, "label": label, "color_tag": tag,
            "fid": None, "link_to_page": None, "stamp_id": None,
        })
        for ci, sid in enumerate(ids):
            out.append({
                "id": f"o_show_{prefix}_{sid}", "type": "stamp", "stamp_id": sid,
                "x": 220 + ci * 90, "y": y, "label": sid,
                "color_tag": None, "fid": None, "link_to_page": None,
            })
    out.append({
        "id": "o_show_note", "type": "box", "x": 40, "y": 560,
        "label": "📂 Drop your own SVGs into resources/stamps/<category>/ to extend this palette.",
        "color_tag": "neutral", "fid": None, "link_to_page": None, "stamp_id": None,
    })
    out.append({
        "id": "o_show_back", "type": "box", "x": 700, "y": 560,
        "label": "↑ Back to Root", "color_tag": "neutral",
        "fid": None, "link_to_page": "p_root", "stamp_id": None,
    })
    return out


def _build_sample_in_place() -> None:
    """Populate input/architecture/ with the curated demo. Wipes any existing
    contents in that directory."""
    if arch._ARCH_ROOT.exists():
        shutil.rmtree(arch._ARCH_ROOT)
    arch._PAGES_DIR.mkdir(parents=True, exist_ok=True)
    arch._FLOWS_DIR.mkdir(parents=True, exist_ok=True)

    pages = [
        {"id": "p_root", "name": "Root (overview)", "locked": False},
        {"id": "p_frontend", "name": "Frontend layer", "locked": False},
        {"id": "p_api", "name": "API layer", "locked": False},
        {"id": "p_backend", "name": "Backend layer", "locked": False},
        {"id": "p_data", "name": "Data layer", "locked": False},
        {"id": "p_showcase", "name": "Stamps showcase", "locked": False},
        {"id": "p_legacy", "name": "Legacy notes (forgotten)", "locked": False},
    ]
    arch._write_index({"pages": pages})

    def _payload(pid: str, name: str, objects: list[dict], zoom: float = 0.85) -> dict:
        return {
            "page_id": pid,
            "name": name,
            "schema_version": arch.SCHEMA_VERSION,
            "locked": False,
            "objects": objects,
            "viewport": {"x": 20, "y": 10, "zoom": zoom},
        }

    v1 = _sample_pages_v1()
    arch._write_page("p_root", _payload("p_root", "Root (overview)", v1))
    arch._create_snapshot("p_root", "v1 — initial sketch")

    v2 = _sample_pages_root_v2(v1)
    arch._write_page("p_root", _payload("p_root", "Root (overview)", v2))
    arch._create_snapshot("p_root", "v2 — after design review")

    arch._write_page("p_root", _payload("p_root", "Root (overview)", _sample_pages_root_current(v2)))

    arch._write_page("p_frontend", _payload("p_frontend", "Frontend layer", _sample_frontend_objects()))
    arch._write_page("p_api", _payload("p_api", "API layer", _sample_api_objects(), zoom=0.75))
    arch._write_page("p_backend", _payload("p_backend", "Backend layer", _sample_backend_objects()))
    arch._write_page("p_data", _payload("p_data", "Data layer", _sample_data_objects()))
    arch._write_page("p_showcase", _payload("p_showcase", "Stamps showcase", _sample_showcase_objects(), zoom=0.75))
    arch._write_page("p_legacy", _payload("p_legacy", "Legacy notes (forgotten)", [
        {"id": "o_legacy_note", "type": "box", "x": 80, "y": 80,
         "label": "Old design notes — nothing links here anymore.",
         "color_tag": "deprecated", "fid": None, "link_to_page": None, "stamp_id": None},
    ]))

    arch._save_attachment(
        "p_root", "o_root_apigw", "api_gateway_spec_v1.txt",
        b"API Gateway Spec v1\n\n- Routes: /auth/*, /user/*, /order/*\n- Auth: bearer token\n- Rate limit: 100 req/min/user\n",
    )
    arch._save_attachment(
        "p_root", "o_root_apigw", "api_gateway_spec_v2.txt",
        b"API Gateway Spec v2\n\n- Routes: /auth/*, /user/*, /order/*, /payment/*\n- Auth: bearer token + mTLS for /payment\n- Rate limit: 200 req/min/user (paid tier)\n",
    )
    arch._save_attachment(
        "p_root", "o_ghost_object", "old_notes.txt",
        b"This attachment refers to an object that no longer exists.\n",
    )

    # Long-form description with an embedded image, demoing the 📝 panel.
    diagram_filename = arch._save_description_image(
        "p_root", "o_root_apigw", "gateway_flow.png", _make_demo_diagram_png()
    )
    arch._set_description(
        "p_root", "o_root_apigw",
        f"""## API Gateway

The API Gateway is the single entry point for all incoming traffic. Every
client request hits the gateway first, which authenticates, rate-limits, and
routes to the appropriate downstream service.

**Request flow:**

![flow]({diagram_filename})

### Responsibilities

- **Auth**: bearer token + mTLS on `/payment/*`
- **Rate limit**: 200 req/min/user on the paid tier (100 on free)
- **Routing**: matches URL path against the route table

### Recent changes

- 2026-04-01 — migrated from v1 to v2
- 2026-04-15 — added `/payment/*` routes with mTLS

> **Tip**: select this box and switch to the **✏ Edit** tab below the canvas
> to see the markdown source. Upload more images to embed inline.
""",
    )

    arch._write_flow("f_root_path", {
        "id": "f_root_path", "name": "Top-level data path", "color": "#f97316",
        "start": {"page_id": "p_root", "object_id": "o_root_user"},
        "stops": [
            {"page_id": "p_root", "object_id": "o_root_webapp"},
            {"page_id": "p_root", "object_id": "o_root_apigw"},
            {"page_id": "p_root", "object_id": "o_root_backend"},
        ],
        "end": {"page_id": "p_root", "object_id": "o_root_db"},
    })
    arch._write_flow("f_checkout", {
        "id": "f_checkout", "name": "Order checkout (cross-layer)", "color": "#3b82f6",
        "start": {"page_id": "p_frontend", "object_id": "o_fe_cart"},
        "stops": [
            {"page_id": "p_frontend", "object_id": "o_fe_checkout"},
            {"page_id": "p_api", "object_id": "o_api_cart_add"},
            {"page_id": "p_api", "object_id": "o_api_checkout"},
            {"page_id": "p_api", "object_id": "o_api_pay_charge"},
            {"page_id": "p_backend", "object_id": "o_be_order_worker"},
        ],
        "end": {"page_id": "p_data", "object_id": "o_data_primary"},
    })
    arch._write_flow("f_auth_audit", {
        "id": "f_auth_audit", "name": "Auth & audit", "color": "#10b981",
        "start": {"page_id": "p_api", "object_id": "o_api_login"},
        "stops": [
            {"page_id": "p_api", "object_id": "o_api_register"},
            {"page_id": "p_api", "object_id": "o_api_reset"},
            {"page_id": "p_data", "object_id": "o_data_audit"},
        ],
        "end": {"page_id": "p_data", "object_id": "o_data_primary"},
    })


SAMPLE_ZIP = Path(__file__).resolve().parent / "architecture_sample.zip"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--install", action="store_true",
        help="leave the freshly-built architecture in input/architecture/ "
             "instead of restoring the previous state",
    )
    args = p.parse_args()

    backup = arch._ARCH_ROOT.parent / "_arch_backup_for_sample"
    if arch._ARCH_ROOT.exists():
        if backup.exists():
            shutil.rmtree(backup)
        shutil.move(str(arch._ARCH_ROOT), str(backup))
        print(f"Backed up existing architecture → {backup}")

    try:
        _build_sample_in_place()
        blob = arch._export_architecture_bytes()
        SAMPLE_ZIP.write_bytes(blob)
        pages = arch._read_index().get("pages", [])
        print(f"Wrote {SAMPLE_ZIP.relative_to(ROOT)} ({len(blob)} bytes)")
        print(f"  {len(pages)} pages: " + ", ".join(p['name'] for p in pages))
        print(f"  {len(arch._list_flows())} flow(s) on disk")
    finally:
        if not args.install:
            if arch._ARCH_ROOT.exists():
                shutil.rmtree(arch._ARCH_ROOT)
        if backup.exists():
            if not args.install:
                shutil.move(str(backup), str(arch._ARCH_ROOT))
                print("Restored previous architecture")
            else:
                shutil.rmtree(backup)
                print(f"Sample left in {arch._ARCH_ROOT} (--install)")


if __name__ == "__main__":
    main()
