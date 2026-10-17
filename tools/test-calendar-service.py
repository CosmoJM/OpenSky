#!/usr/bin/env python3
"""Integration test for services/calendar-service against a real (throwaway) CalDAV server: Radicale.
Needs a Python venv with the service requirements + radicale (see docs/development/testing.md).
Run: <venv>/bin/python tools/test-calendar-service.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

import caldav

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE = os.path.join(HERE, "..", "services", "calendar-service", "calendar_service.py")
RAD_PORT, SVC_PORT = 5232, 5059
passed = failed = 0


def ok(name, cond, info=""):
    global passed, failed
    passed, failed = passed + bool(cond), failed + (not cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name} {info}")


def call(path, body=None, host=None):
    req = urllib.request.Request(f"http://127.0.0.1:{SVC_PORT}{path}", data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Host": host} if host else {})}, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def wait_port(port):
    for _ in range(50):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
            return
        except urllib.error.HTTPError:
            return
        except Exception:
            time.sleep(0.2)


tmp = tempfile.mkdtemp(prefix="opensky-caldav-")
procs = []
try:
    # 1. Radicale with one user
    with open(os.path.join(tmp, "users"), "w") as f:
        f.write("tester:test-password\n")
    procs.append(subprocess.Popen([sys.executable, "-m", "radicale", "--server-hosts", f"127.0.0.1:{RAD_PORT}",
        "--storage-filesystem-folder", os.path.join(tmp, "collections"), "--auth-type", "htpasswd",
        "--auth-htpasswd-filename", os.path.join(tmp, "users"), "--auth-htpasswd-encryption", "plain"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    wait_port(RAD_PORT)
    client = caldav.DAVClient(url=f"http://127.0.0.1:{RAD_PORT}/", username="tester", password="test-password")
    cal = client.principal().make_calendar(name="Testers Family")
    cal.save_event("BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\nBEGIN:VEVENT\nUID:weekly@test\nDTSTAMP:20260101T000000Z\n"
                   "DTSTART:20260105T220000Z\nDTEND:20260105T230000Z\nRRULE:FREQ=WEEKLY\nSUMMARY:Weekly chores\nEND:VEVENT\nEND:VCALENDAR\n")
    # 2. the OpenSky service, with the account in a test secrets.json
    secrets = os.path.join(tmp, "secrets.json")
    with open(secrets, "w") as f:
        json.dump({"calendar": {"caldav": {"Family": {"url": f"http://127.0.0.1:{RAD_PORT}/", "username": "tester",
                                                      "password": "test-password", "calendar": "Testers Family"},
                                           "Broken": {"url": f"http://127.0.0.1:{RAD_PORT}/", "username": "tester", "password": "wrong"}}}}, f)
    env = {**os.environ, "OPENSKY_SECRETS": secrets, "OPENSKY_CALENDAR_CACHE": os.path.join(tmp, "cache"), "OPENSKY_CALENDAR_PORT": str(SVC_PORT), "TZ": "America/New_York"}
    procs.append(subprocess.Popen([sys.executable, SERVICE], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    wait_port(SVC_PORT)

    st, body = call("/health")
    ok("1 health lists the accounts (no passwords)", st == 200 and "Family" in body and "test-password" not in body, body)
    st, body = call("/Family/calendar.ics")
    ok("2 feed has the server's events", st == 200 and "Weekly chores" in body)
    st, body = call("/Family/create-event", {"title": "Dentist", "startDate": "2026-10-20T13:00:00.000Z", "endDate": "2026-10-20T14:00:00.000Z"})
    ok("3 create a timed event", st == 200, body)
    st, body = call("/Family/create-event", {"title": "Camping", "allDay": True, "startDate": "2026-10-23", "endDate": "2026-10-25"})
    ok("4 create an all-day event", st == 200, body)
    names = [str(c.get("summary")) for e in cal.events() for c in __import__("icalendar").Calendar.from_ical(e.data).walk("VEVENT")]
    ok("5 both are really on the CalDAV server", "Dentist" in names and "Camping" in names, names)
    st, body = call("/Family/update-event", {"originalTitle": "Dentist", "originalStart": "2026-10-20T13:00:00.000Z", "title": "Dentist (moved)",
                                            "startDate": "2026-10-21T13:00:00.000Z", "endDate": "2026-10-21T14:00:00.000Z"})
    ok("6 update by title + start", st == 200 and "Dentist (moved)" in call("/Family/calendar.ics")[1], body)
    st, body = call("/Family/delete-event", {"originalTitle": "Camping", "originalStart": "2026-10-23T04:00:00.000Z"})
    ok("7 delete an all-day event (local date match)", st == 200 and "Camping" not in call("/Family/calendar.ics")[1], body)
    st, body = call("/Family/update-event", {"originalTitle": "Weekly chores", "originalStart": "2026-01-05T22:00:00.000Z", "title": "x",
                                            "startDate": "2026-01-05T22:00:00.000Z", "endDate": "2026-01-05T23:00:00.000Z"})
    ok("8 repeating events are refused (409, friendly)", st == 409 and "calendar app" in body, body)
    st, body = call("/Family/create-event", {"title": "", "startDate": "2026-10-20T13:00:00Z", "endDate": "2026-10-20T14:00:00Z"})
    ok("9 validation: empty title (400)", st == 400 and "title" in body, body)
    st, body = call("/Nobody/calendar.ics")
    ok("10 unknown calendar name → 404 with the secrets.json hint", st == 404 and "secrets.json" in body, body)
    st, body = call("/Broken/create-event", {"title": "x", "startDate": "2026-10-20T13:00:00Z", "endDate": "2026-10-20T14:00:00Z"})
    ok("11 wrong password → says what to check (401)", st == 401 and "app-specific" in body, f"{st} {body[:100]}")
    # 12. one occurrence of a repeating event moved in the calendar app (kept with the series as a RECURRENCE-ID copy):
    # deleting it on the screen must not delete the whole series
    cal.save_event("BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\nBEGIN:VEVENT\nUID:soccer@test\nDTSTAMP:20260101T000000Z\n"
                   "DTSTART:20261006T210000Z\nDTEND:20261006T220000Z\nRRULE:FREQ=WEEKLY;COUNT=10\nSUMMARY:Soccer practice\nEND:VEVENT\n"
                   "BEGIN:VEVENT\nUID:soccer@test\nDTSTAMP:20260101T000000Z\nRECURRENCE-ID:20261013T210000Z\n"
                   "DTSTART:20261014T210000Z\nDTEND:20261014T220000Z\nSUMMARY:Soccer practice\nEND:VEVENT\nEND:VCALENDAR\n")
    st, body = call("/Family/delete-event", {"originalTitle": "Soccer practice", "originalStart": "2026-10-14T21:00:00.000Z"})
    left = [str(c.get("summary")) for e in cal.events() for c in __import__("icalendar").Calendar.from_ical(e.data).walk("VEVENT")]
    ok("12 a moved occurrence of a repeating event: delete refused (409), the series is still there",
       st == 409 and "Soccer practice" in left, f"{st} {body[:80]}")
    # 13. a web page that made its own name point at 127.0.0.1 (DNS rebinding) gets nothing
    st, body = call("/Family/calendar.ics", host=f"rebind.example:{SVC_PORT}")
    st2, _ = call("/Family/delete-event", {"originalTitle": "Dentist (moved)", "originalStart": "2026-10-21T13:00:00.000Z"}, host="rebind.example")
    ok("13 a request for another name → 421, no calendar, nothing deleted", st == 421 and "Dentist" not in body and st2 == 421 and "Dentist (moved)" in call("/Family/calendar.ics")[1], st)
    # 14. server down → the last good copy is served
    procs[0].terminate(); procs[0].wait(timeout=10)
    st, body = call("/Family/calendar.ics")
    ok("14 CalDAV server down → last good copy of the feed", st == 200 and "Dentist (moved)" in body)
finally:
    for p in procs:
        if p.poll() is None:
            p.terminate()
    shutil.rmtree(tmp, ignore_errors=True)
print(f"SUMMARY pass={passed} fail={failed}")
