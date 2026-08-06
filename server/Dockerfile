# Sprout API — production image.
#
# Build from the REPOSITORY ROOT, not from server/:
#     docker build -f server/Dockerfile -t sprout-server .
# The root package.json declares the npm workspaces, so an install run from
# server/ alone cannot resolve the workspace graph.
#
# ── Why this image exists ─────────────────────────────────────────────────────
# `sharp` (libvips) and `bcrypt` are native modules: they ship a compiled binary
# per platform, and npm silently downloads a *different* one on each machine.
# The team develops on Windows and macOS and deploys to Linux, so "the tests
# passed locally" has never been evidence about the binary production runs.
# Installing once, inside Linux, at build time makes the Linux build the only
# build — and freezes the Node patch version and the OS libraries underneath it
# at the same time.
#
# ── Why Debian slim and not Alpine ────────────────────────────────────────────
# Alpine is musl-libc. The prebuilt binaries npm fetches for sharp and bcrypt
# target glibc, so an Alpine base falls back to compiling from source or fails
# outright. Debian slim keeps the prebuilds usable; the image still lands around
# 200 MB rather than the ~1 GB a full node:22 base would cost.
#
# ── Why three stages ──────────────────────────────────────────────────────────
# `deps` resolves production dependencies only. `builder` takes the full tree
# (TypeScript, types, dev tooling) and compiles. `runtime` starts clean and
# copies one artefact from each. Nothing that compiles code reaches the
# published image — that is both dead weight and attack surface. Splitting deps
# from builder also lets the two run in parallel and cache independently.

# =============================================================================
# Stage 1 — production dependencies
# =============================================================================
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Manifests only. Docker caches per instruction, so keeping sources out of this
# layer means editing a .ts file reuses the cached install instead of
# redownloading every dependency. All three manifests are copied even though
# only `server` is installed: `npm ci` verifies the lockfile against every
# workspace manifest and errors if one is missing.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/

# `npm ci`, not `npm install` — it installs exactly what the lockfile pins and
# fails when the lockfile and manifests disagree. That failure mode is the
# point: a build that quietly resolves a different tree is not reproducible.
RUN npm ci --omit=dev --workspace server --include-workspace-root

# npm hoists to the root node_modules, but a version conflict can leave a nested
# server/node_modules as well. Docker COPY errors on a missing source and has no
# conditional form, so guarantee the path exists rather than gambling on it.
RUN mkdir -p server/node_modules

# =============================================================================
# Stage 2 — build
# =============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/

# Full tree here: tsc and the type packages live in devDependencies.
RUN npm ci --workspace server --include-workspace-root

COPY server/ server/

# tsc → server/dist (outDir in server/tsconfig.json)
RUN npm run build -w server

# =============================================================================
# Stage 3 — runtime
# =============================================================================
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
# Mirrors the default in server.ts. Render and Compose both override it;
# declaring it means a bare `docker run` still works.
ENV PORT=3001

WORKDIR /app

# The `node` user (uid 1000) ships with the official image. Running as root
# would mean a compromised process starts as root inside the container — a
# materially worse position for anything that then escapes.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=deps --chown=node:node /app/server/package.json ./server/
COPY --from=deps --chown=node:node /app/package.json ./

USER node

# Documentation only — EXPOSE publishes nothing. `-p` at run time, or `ports:`
# in compose, is what actually maps it.
EXPOSE 3001

# Liveness on purpose: /api/health touches no dependency, so a Firestore outage
# cannot make Docker restart an otherwise healthy container. The dependency
# question lives at /api/health/ready, which nothing restarts on. See
# server/services/readiness.service.ts for why that split matters.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, no shell. A shell wrapper would sit at PID 1 and swallow SIGTERM,
# so the graceful drain in server/lifecycle.ts would never run and every
# redeploy would end in SIGKILL with requests still in flight.
CMD ["node", "server/dist/server.js"]
