# Firestore emulator as a container.
#
# There is no official Google image for the Firestore emulator: it ships inside
# firebase-tools (Node) and the emulator itself is a Java program. So the image
# is assembled here.
#
# ── Why this is worth its own image ──────────────────────────────────────────
# The integration suite needs this emulator, which means every teammate has to
# install a JRE by hand — Temurin 21 — and keep the right version. That is a
# real onboarding step that has cost the team time, and it is invisible in the
# repository: nothing in package.json tells you a Java runtime is a build
# dependency. Packaging it makes the requirement explicit and one-command.

FROM node:22-bookworm-slim

# default-jre-headless: the emulator is a JVM program and needs no GUI toolkit.
# --no-install-recommends keeps the docs and X11 pulls out of the layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Pinned rather than @latest: an emulator that silently changes version between
# two developers' machines reintroduces exactly the drift this image removes.
RUN npm install -g firebase-tools@13.29.1

WORKDIR /srv

# Binds the emulator to 0.0.0.0. `emulators:start` has no --host flag; this
# file is the supported way to override the default 127.0.0.1 bind, which
# inside a container means the container itself and is unreachable from the api
# service on the compose network.
COPY firebase.json /srv/firebase.json

# 8080 Firestore, 4400 the emulator hub. The UI is disabled in firebase.json —
# it is a convenience the compose stack does not need and it pulls extra work
# into a container that exists to answer one protocol.
EXPOSE 8080 4400

CMD ["firebase", "emulators:start", "--only", "firestore", "--project", "sprout-local"]
