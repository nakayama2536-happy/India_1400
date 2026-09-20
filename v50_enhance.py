#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json, math
import update_market as core

MARKET=Path("market.json")
DAILY=Path("nifty_daily_history.json")
INDICATOR_HISTORY=Path("indicator_history.json")
APP_VERSION="4.9"
CHART_METHOD_VERSION="4.9-chart-1"
CHART_WINDOW=30
EXTERNAL_HISTORY_LIMIT=120

def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def valid_number(x):
    try:
        return math.isfinite(float(x))
    except Exception:
        return False

def quote_date(obj):
    t=str((obj or {}).get("as_of_jst") or "")
    return t[:10] if len(t)>=10 else None

def upsert_series(series,obj,status="fresh"):
    if status!="fresh" or not valid_number((obj or {}).get("price")):
        return series
    d=quote_date(obj)
    if not d:
        return series
    point={"date":d,"value":round(float(obj["price"]),6),"as_of_jst":obj.get("as_of_jst"),"provider":obj.get("provider")}
    merged={str(x.get("date")):x for x in (series or []) if isinstance(x,dict) and x.get("date")}
    merged[d]=point
    return [merged[k] for k in sorted(merged)][-EXTERNAL_HISTORY_LIMIT:]

def build_nifty_chart_data(daily):
    recs=daily.get("records") if isinstance(daily,dict) else []
    pairs=[]
    for r in recs or []:
        try:
            d=str(r.get("date")); v=float(r.get("close"))
            if d and math.isfinite(v) and v>0: pairs.append((d,v))
        except Exception: pass
    pairs=sorted(dict(pairs).items())
    if len(pairs)<80:
        return {"available":False,"message":"日足履歴不足"}
    dates=[d for d,_ in pairs]; vals=[v for _,v in pairs]
    arrays=core.build_indicator_arrays(vals)
    start=max(0,len(vals)-CHART_WINDOW)
    price=[]; rsi=[]; macd=[]
    for i in range(start,len(vals)):
        price.append({"date":dates[i],"close":core.round_or_none(vals[i],2),"ma5":core.round_or_none(arrays["ma5"][i],2),"ma25":core.round_or_none(arrays["ma25"][i],2),"ma75":core.round_or_none(arrays["ma75"][i],2)})
        rsi.append({"date":dates[i],"value":core.round_or_none(arrays["rsi"][i],2)})
        macd.append({"date":dates[i],"value":core.round_or_none(arrays["hist"][i],3)})
    return {"available":True,"window_trading_days":CHART_WINDOW,"price":price,"rsi14":rsi,"macd_hist":macd}

def main():
    market=load_json(MARKET,{})
    daily=load_json(DAILY,{"records":[]})
    ih=load_json(INDICATOR_HISTORY,{"schema_version":1,"updated_at_jst":None,"series":{"usdinr":[],"brent":[],"india_vix":[]}})
    market["app_version"]=APP_VERSION
    market["note"]="v5.0 decision-focused: v4.8 guidance/forecast plus color-linked indicator charts, compact external-history display, and clarified source/version presentation."

    market_code=((market.get("market_state") or {}).get("code") or "")
    if market_code!="LIVE":
        nifty=market.get("nifty") or {}; old=nifty.get("provisional") or {}
        nifty["provisional"]={"available":False,"basis":"休場・時間外のため14:00暫定テクニカルは使用しません。確定日足を参照します。","date":old.get("date") or nifty.get("technical_date")}
        market["nifty"]=nifty
        dl=market.get("data_lineage")
        if isinstance(dl,dict):
            ins=dl.get("instruments")
            if isinstance(ins,dict) and isinstance(ins.get("nifty"),dict): ins["nifty"]["provisional"]=False
            nt=dl.get("nifty_technicals")
            if isinstance(nt,dict): nt["provisional_available"]=False

    series=ih.setdefault("series",{})
    cf=market.get("core_fetch") or {}
    series["usdinr"]=upsert_series(series.get("usdinr",[]),market.get("usdinr") or {},(cf.get("usdinr") or {}).get("status"))
    series["brent"]=upsert_series(series.get("brent",[]),market.get("brent") or {},(cf.get("brent") or {}).get("status"))
    vix=market.get("india_vix") or {}
    series["india_vix"]=upsert_series(series.get("india_vix",[]),vix,vix.get("data_status"))
    ih["updated_at_jst"]=market.get("generated_at_jst"); ih["schema_version"]=1
    INDICATOR_HISTORY.write_text(json.dumps(ih,ensure_ascii=False,indent=2),encoding="utf-8")

    nifty_charts=build_nifty_chart_data(daily)
    ext={"usdinr":series.get("usdinr",[])[-CHART_WINDOW:],"brent":series.get("brent",[])[-CHART_WINDOW:],"india_vix":series.get("india_vix",[])[-CHART_WINDOW:]}
    market["chart_data"]={"available":bool(nifty_charts.get("available")),"method_version":CHART_METHOD_VERSION,"window_trading_days":CHART_WINDOW,"nifty":nifty_charts,"external":ext,"external_history_note":"USD/INR・Brent・India VIXはv4.9以降の取得値を蓄積し、3日以上から簡易グラフ表示します。"}
    nf=cf.get("nifty") or {}
    market["source_summary"]={"nifty_current":{"provider":(market.get("nifty") or {}).get("provider"),"as_of_jst":(market.get("nifty") or {}).get("as_of_jst")},"nifty_history":{"provider":nf.get("history_source"),"last_date":nf.get("history_cache_last_date"),"rows":nf.get("history_cache_rows")}}
    if isinstance(market.get("analysis_meta"),dict): market["analysis_meta"]["chart_method_version"]=CHART_METHOD_VERSION
    MARKET.write_text(json.dumps(market,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"app_version":market.get("app_version"),"chart_available":(market.get("chart_data") or {}).get("available"),"provisional_available":((market.get("nifty") or {}).get("provisional") or {}).get("available")},ensure_ascii=False))

if __name__=="__main__":
    main()
