"""Bound event-driven fund retries; never infer NAV publication or market holidays."""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))


def decide(event, now, data):
    if event in ('schedule', 'workflow_dispatch'):
        return True, 'existing_trigger'
    if event != 'push':
        return False, 'unsupported_event'
    now = now.astimezone(JST)
    if now.weekday() >= 5 or now.hour < 18:
        return False, 'outside_evening_retry_window'
    stamp = data.get('attempted_at_jst') or data.get('fetched_at_jst')
    if stamp is None:
        return True, 'no_previous_attempt'
    previous = datetime.fromisoformat(stamp)
    if previous.tzinfo is None or previous > now:
        raise ValueError('invalid or future fund attempt timestamp')
    if now - previous < timedelta(minutes=60):
        return False, 'recent_attempt'
    return True, 'evening_market_publication_retry'


if __name__ == '__main__':
    data = json.loads(Path('india_core.json').read_text())
    run, reason = decide(os.environ['ACQUISITION_EVENT'], datetime.now(JST), data)
    print(json.dumps({'run': run, 'reason': reason}))
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f"run={str(run).lower()}\n")
