#!/usr/bin/env python3
"""OpenSky input watcher: prints "input" (at most once a second) whenever any touchscreen, mouse or keyboard is used.

Started by the Settings module while the screen is really off (signal off, power save, TV standby…), when the page
itself can't see touches: the first touch wakes the screen. Reads /dev/input/event* directly, so the user must be in
the "input" group (the default user on Raspberry Pi OS is). Picks up devices plugged in later.
"""
import os
import select
import sys
import time

IGNORED = ("vc4-hdmi", "pwr_button")   # HDMI CEC/jack and the power button aren't people


def devices():
    found, name = {}, ""
    try:
        with open("/proc/bus/input/devices") as f:
            for line in f:
                if line.startswith("N: Name="):
                    name = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("H: Handlers="):
                    for h in line.split("=", 1)[1].split():
                        if h.startswith("event") and not name.startswith(IGNORED):
                            found["/dev/input/" + h] = name
    except OSError:
        pass
    return found


def main():
    fds, last_scan, last_print = {}, 0.0, 0.0
    while True:
        now = time.time()
        if now - last_scan > 30:
            last_scan = now
            wanted = devices()
            for fd, p in list(fds.items()):
                if p not in wanted:
                    os.close(fd)
                    del fds[fd]
            for p in wanted:
                if p not in fds.values():
                    try:
                        fds[os.open(p, os.O_RDONLY | os.O_NONBLOCK)] = p
                    except OSError:
                        pass
            if not fds:
                print("no-devices", flush=True)
        if not fds:
            time.sleep(5)
            continue
        ready, _, _ = select.select(list(fds), [], [], 5)
        for fd in ready:
            try:
                os.read(fd, 4096)
            except OSError:
                os.close(fd)
                del fds[fd]
        if ready and time.time() - last_print > 1:
            last_print = time.time()
            print("input", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
