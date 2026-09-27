#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

SOURCES = [
    ("market.json","market_snapshot","市場・判定・テクニカル・予測・品質","json"),
    ("history.json","history_1400","14:00定点履歴","json"),
    ("indicator_history.json","indicator_history","外部指標履歴","json"),
    ("forecast_evaluation.json","forecast_evaluation","予測検証履歴","json"),
    ("nifty_daily_history.json","nifty_daily_history","NIFTY長期日足終値","json"),
    ("nifty_ohlc_history.json","nifty_ohlc_history","NIFTY OHLC履歴","json"),
    ("common_snapshot.json","common_snapshot","共通仕様スナップショット","json"),
    ("india_core.json","india_core","インド・コア最新情報","json"),
    ("india_core_history.json","india_core_history","インド・コア基準価額履歴","json"),
    ("VERSION","version","アプリバージョン","text"),
]

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _array_len(obj, *keys):
    cur=obj
    for key in keys:
        if not isinstance(cur,dict):
            return None
        cur=cur.get(key)
    return len(cur) if isinstance(cur,list) else None

def _latest_date(obj):
    if not isinstance(obj,dict):
        return None
    for key in ("generated_at_jst","updated_at_jst","as_of_date","date_jst","basis_date"):
        if obj.get(key):
            return obj.get(key)
    for path in (
        ("history_1400","date_jst"),
        ("timestamps","market_as_of"),
        ("nifty","technical_date"),
    ):
        cur=obj
        for key in path:
            if not isinstance(cur,dict):
                cur=None
                break
            cur=cur.get(key)
        if cur:
            return cur
    for key in ("records","entries"):
        xs=obj.get(key)
        if isinstance(xs,list) and xs:
            last=xs[-1]
            if isinstance(last,dict):
                return last.get("date_jst") or last.get("date")
    return None

def _rows(obj, path):
    cur=obj
    for key in path:
        if not isinstance(cur,dict):
            return None
        cur=cur.get(key)
    return len(cur) if isinstance(cur,list) else None

def source_meta(root: Path, item):
    path,source_id,purpose,kind=item
    src=root/path
    if not src.exists():
        raise FileNotFoundError(f"required public source missing: {path}")
    data=src.read_bytes()
    obj=None
    if kind=="json":
        try:
            obj=json.loads(data.decode("utf-8"))
        except Exception as e:
            raise ValueError(f"invalid JSON: {path}: {e}") from e
        if not isinstance(obj,dict):
            raise ValueError(f"public source must be JSON object: {path}")
    rows=None
    if isinstance(obj,dict):
        candidates=[
            ("records",),("entries",),("series",),
            ("history_1400","records"),
        ]
        for p in candidates:
            n=_rows(obj,p)
            if n is not None:
                rows=n
                break
    return {
        "source_id":source_id,
        "path":path,
        "purpose":purpose,
        "type":kind,
        "status":"OK",
        "sha256":sha256(data),
        "bytes":len(data),
        "required_for_bundle":True,
        "as_of":_latest_date(obj) if obj is not None else None,
        "rows":rows,
        "revision":None,
    }

def publication_id(files):
    identity=[
        {
            "path":x["path"],
            "sha256":x["sha256"],
            "bytes":x["bytes"],
            "status":x["status"],
            "required_for_bundle":x["required_for_bundle"],
        }
        for x in sorted(files,key=lambda x:x["path"])
    ]
    raw=json.dumps(identity,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")
    return "in-"+sha256(raw)[:20]

def build(root: Path):
    files=[source_meta(root,item) for item in SOURCES]
    return {
        "schema_version":"1.0",
        "market":"INDIA",
        "publication_id":publication_id(files),
        "source_state":"READY",
        "bundle_contract":"deep-dive/0.1",
        "files":files,
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",default=".")
    ap.add_argument("--output",default="publication_manifest.json")
    args=ap.parse_args()
    root=Path(args.root)
    manifest=build(root)
    out=Path(args.output)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"INDIA_PUBLICATION_ID={manifest['publication_id']}")
    print(f"INDIA_PUBLICATION_FILES={len(manifest['files'])}")
    print("INDIA_PUBLICATION_STATUS=READY")

if __name__=="__main__":
    main()
