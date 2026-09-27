#!/usr/bin/env python3
import json
import re
from pathlib import Path

PUBLIC_DATA = (
    "market.json","history.json","indicator_history.json","forecast_evaluation.json",
    "nifty_daily_history.json","nifty_ohlc_history.json","common_snapshot.json",
    "india_core.json","india_core_history.json",
)
FORBIDDEN = {
    "shares","quantity","position_size","average_cost","cost_basis","purchase_price",
    "account_type","position_id","planned_total_shares","stage_size","completed_stages",
    "max_stages","opened_at","closed_at","brokerage_account","brokerage_account_id",
    "portfolio_id","api_key","apikey","access_token","token","password","secret",
}
CREDENTIALS = (
    re.compile(r"(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
)

def scan(value,path="$"):
    problems=[]
    if isinstance(value,dict):
        for key,child in value.items():
            p=f"{path}.{key}"
            if str(key).lower() in FORBIDDEN: problems.append(p)
            problems.extend(scan(child,p))
    elif isinstance(value,list):
        for i,child in enumerate(value): problems.extend(scan(child,f"{path}[{i}]"))
    elif isinstance(value,str):
        if any(p.search(value) for p in CREDENTIALS): problems.append(path+":credential-like-value")
    return problems

def validate(root=Path(".")):
    burnin=list(root.rglob("burnin_evidence.json"))
    if burnin: raise ValueError("private burn-in evidence tracked in public tree: "+", ".join(map(str,burnin)))
    for name in PUBLIC_DATA:
        p=root/name
        if not p.exists(): continue
        value=json.loads(p.read_text(encoding="utf-8"))
        bad=scan(value)
        if bad: raise ValueError(f"{name} failed public delivery gate: "+", ".join(bad[:20]))
    return True

if __name__=="__main__":
    validate()
    print("INDIA PUBLIC DELIVERY GATE PASS")
