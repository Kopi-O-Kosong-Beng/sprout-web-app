#!/bin/sh
# Start the emulators, optionally keeping their data across restarts.
#
# Persistence is off by default and switched on with EMULATOR_PERSIST=true, so
# docker-compose.yml keeps the behaviour it has always had (a clean database on
# every run) while docker-compose.demo.yml — the stack someone actually demos
# from — keeps what they put in it.
#
# The emulators hold everything in memory. Without --export-on-exit the accounts,
# creatures, battles and sprite images a demo builds up are gone the moment the
# container stops, which is a bad surprise for someone who spent an evening
# scanning plants to fill an archive before an event.
set -eu

# The --only list, e.g. "firestore" or "firestore,auth,storage".
ONLY="${1:-firestore}"
PROJECT="${FIREBASE_PROJECT:-sprout-local}"
DATA_ROOT="${EMULATOR_DATA_DIR:-/srv/data}"

# A subdirectory, NOT the volume mount point itself. The export clears its
# target before writing, and rmdir on a mount point fails with EBUSY — so
# exporting straight to the mount fails every single time, after the emulators
# have already begun shutting down:
#
#   emulators: Export failed: EBUSY: resource busy or locked, rmdir '/srv/data'
#
# One level down is an ordinary directory on the volume, which it can remove and
# recreate freely.
EXPORT_DIR="$DATA_ROOT/export"

set -- emulators:start --only "$ONLY" --project "$PROJECT"

if [ "${EMULATOR_PERSIST:-false}" = "true" ]; then
  mkdir -p "$DATA_ROOT"
  set -- "$@" --export-on-exit "$EXPORT_DIR"

  # --import only once there is something to import. Pointing it at an empty
  # directory fails the start outright, which would make the very first run of a
  # fresh install the one run that does not work.
  if [ -f "$EXPORT_DIR/firebase-export-metadata.json" ]; then
    set -- "$@" --import "$EXPORT_DIR"
    echo "[emulators] importing saved data from ${EXPORT_DIR}"
  else
    echo "[emulators] no saved data yet — starting empty, will export to ${EXPORT_DIR} on exit"
  fi
fi

# exec so the CLI is PID 1 and receives the stop signal itself. A shell sitting
# in front of it would swallow the signal and the export would never run.
exec firebase "$@"
