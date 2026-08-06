# Sprout frontend — production image.
#
# Build from the REPOSITORY ROOT:
#     docker build -f client/Dockerfile -t sprout-client .
#
# ── Why the API image is not enough ───────────────────────────────────────────
# Kenny's brief asks for the *product* containerised. Vercel serves client/dist
# as static files today, which is correct and fast, but it means half the
# product has no image. This is that half — and it doubles as the offline demo
# path when the network at a venue is not to be trusted.
#
# ── Why VITE_* are build ARGs and not runtime env ─────────────────────────────
# Vite substitutes import.meta.env at BUILD time and writes the values into the
# emitted JavaScript. There is no runtime environment for a static bundle: by
# the time nginx serves it the values are already literals. So every VITE_*
# arrives as a build argument, and a different configuration means a different
# image — which is the honest model, not a limitation being worked around.
#
# These are all publishable values. Firebase web config is designed to ship to
# browsers; access is enforced by Firebase security rules and the server's own
# token verification, not by hiding the API key. No server secret
# (FIREBASE_SERVICE_ACCOUNT_JSON, SMTP_PASS, RESEND_API_KEY) belongs in this
# image, and none is referenced here.

# =============================================================================
# Stage 1 — build the bundle
# =============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --workspace client --include-workspace-root

COPY client/ client/

ARG VITE_API_URL=http://localhost:3001
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_DATABASE_ID
# Demo tooling stays off unless a build explicitly asks for it. A default of
# "true" would ship demo affordances to production the first time someone
# forgot the flag.
ARG VITE_ENABLE_DEMO_TOOLS=false

ENV VITE_API_URL=$VITE_API_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_DATABASE_ID=$VITE_FIREBASE_DATABASE_ID \
    VITE_ENABLE_DEMO_TOOLS=$VITE_ENABLE_DEMO_TOOLS

# `tsc -b && vite build` — the typecheck is part of the build script, so a type
# error fails the image rather than shipping.
RUN npm run build -w client

# =============================================================================
# Stage 2 — serve
# =============================================================================
FROM nginx:1.27-alpine AS runtime

# Alpine is fine here, unlike the API image: nginx has no native Node modules to
# resolve, and the smaller base is worth having.

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80

# nginx's own image already runs the master process correctly for containers and
# forwards logs to stdout/stderr, so there is no CMD to override.

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
