# Firebase emulators as a container.
#
# Build from the REPOSITORY ROOT, not from this directory:
#     docker build -f docker/firestore-emulator/Dockerfile -t sprout-emulator .
# The context is the repository root so the image can copy the project's real
# firestore.rules and storage.rules. Vendoring copies of them in here instead
# would give the rules two sources of truth, and the copy nobody edits is the
# one the demo would silently run on.
#
# There is no official Google image for the Firebase emulators: they ship inside
# firebase-tools (Node) and the emulators themselves are Java programs. So the
# image is assembled here.
#
# ── Why this is worth its own image ──────────────────────────────────────────
# The integration suite needs these emulators, which means every teammate has to
# install a JRE by hand — Temurin 21 — and keep the right version. That is a
# real onboarding step that has cost the team time, and it is invisible in the
# repository: nothing in package.json tells you a Java runtime is a build
# dependency. Packaging it makes the requirement explicit and one-command.

FROM node:22-bookworm-slim

# default-jre-headless: the emulators are JVM programs and need no GUI toolkit.
# --no-install-recommends keeps the docs and X11 pulls out of the layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Pinned rather than @latest: an emulator that silently changes version between
# two developers' machines reintroduces exactly the drift this image removes.
RUN npm install -g firebase-tools@13.29.1

WORKDIR /srv

# Binds the emulators to 0.0.0.0 and declares all three. `emulators:start` has
# no --host flag; this file is the supported way to override the default
# 127.0.0.1 bind, which inside a container means the container itself and is
# unreachable from the api service on the compose network.
COPY docker/firestore-emulator/firebase.json /srv/firebase.json

# The storage emulator refuses to start without a rules file declared in
# firebase.json, so both rules files are part of the image rather than optional
# extras. Firestore's are loaded too, for one source of truth — the Admin SDK
# bypasses rules entirely, so neither file changes how the API behaves here.
COPY firestore.rules storage.rules /srv/

# 8080 Firestore, 9099 Auth, 9199 Storage, 4400 the emulator hub. The UI is
# disabled in firebase.json — it is a convenience the compose stacks do not need
# and it pulls extra work into a container that exists to answer a protocol.
EXPOSE 8080 9099 9199 4400

# Firestore only by default, which is what docker-compose.yml expects: that
# stack runs with no auth and no sprite storage on purpose. The demo stack
# overrides this command to start all three — see docker-compose.demo.yml.
CMD ["firebase", "emulators:start", "--only", "firestore", "--project", "sprout-local"]
