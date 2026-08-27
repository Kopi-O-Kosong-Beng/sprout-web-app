# Running Sprout

Two ways to run it. Pick one — you do not need both.

|  | **Option A — the hosted link** | **Option B — Docker on a laptop** |
|---|---|---|
| Setup | None | Docker Desktop, one command |
| Needs internet | Yes | Only to build it the first time |
| AI-generated creature art | Yes | No — placeholder art |
| First load | ~12s, then instant | Instant |
| Best for | Showing it to people quickly | A venue with unreliable wifi, or a fixed demo machine |

---

## Option A — the hosted link

**<https://sprout-web-app-jet.vercel.app>**

Nothing to install. Create an account with any email address, or sign in with
Google.

Two things to know:

- **The first request takes about 12 seconds.** The server sleeps when it is
  idle and has to wake up. It is not frozen. Once awake it responds in under a
  tenth of a second. **Open the link a minute before any demo** and it will be
  warm.
- **Scanning a plant calls four paid AI services** on our team's accounts.
  Normal demo use is fine. If you plan to run it continuously at a booth for a
  day, tell us first so we can check the quota.

This is the full product, exactly as it was presented.

---

## Option B — Docker on a laptop

Runs the entire application on one machine: the website, the server, and the
database. No API keys, no accounts, no configuration. After the first build it
needs no internet at all.

### You need

- **Docker Desktop** — <https://www.docker.com/products/docker-desktop/>
  (free; you will need permission to install it on a managed laptop)
- **Git** — <https://git-scm.com/downloads>
- About 3 GB of disk space

### Run it

```bash
git clone https://github.com/Kopi-O-Kosong-Beng/sprout-web-app.git
cd sprout-web-app
docker compose -f docker-compose.demo.yml up --build
```

The first run takes roughly five minutes while it builds. Later runs start in
under a minute.

When it settles, open **<http://localhost:5173>**.

### Sign in

| Email | Password |
|---|---|
| `test@sprout.com` | anything at all |

The password is not checked — there is no account behind it. This shortcut only
exists in this local build; it does nothing against the hosted site.

That account is also an administrator, so the admin dashboard and the pipeline
studio are open to it.

### Stop it

Press `Ctrl+C`, then:

```bash
docker compose -f docker-compose.demo.yml down
```

Your data is kept. Start it again and the accounts, creatures and leaderboard
are exactly as you left them.

### Is any of our account data inside it?

No. There are no API keys, no passwords and no Firebase service account in the
Docker images or anywhere in this repository.

It does not need them, because **the database in Option B is not our database.**
It is a Firebase emulator running on the laptop, which requires no
authentication at all. The application talks to it exactly as it would talk to
the real Firestore, but the address points at `localhost` instead of Google, and
the emulator lets anyone in because everything it holds is already on that
machine.

The same is true of accounts and creature images: a local Auth emulator and a
local Storage emulator, both empty until you use them. Nothing in Option B ever
contacts Google, our Firebase project, or the four AI services.

That is also why the creature art is a placeholder — the services that draw it
are the ones that need paid keys, and those keys are not here.

### Where the data is stored

All of it — accounts, discovered creatures, battle history, the leaderboard and
the creature images — is stored **on the laptop itself**, in a Docker volume
named `sprout-demo_emulator-data`. Nothing is sent to us, nothing touches our
Firebase account, and nothing leaves the machine.

To see it:

```bash
docker volume ls
```

**To wipe everything and start clean:**

```bash
docker compose -f docker-compose.demo.yml down -v
```

The `-v` is what erases it. Without it, your data stays.

Two things worth knowing:

- **Back it up by copying the volume** if you spend real time building an
  archive you want to keep. Docker volumes survive restarts and updates, but
  they do not survive someone running `docker system prune --volumes`.
- **This data is separate from the hosted site.** An account you create here
  does not exist at sprout-web-app-jet.vercel.app, and vice versa.

### What is different from the hosted version

**Creature artwork is a placeholder, not AI-generated.** Everything else is
real — scanning, the archive, battles, the leaderboard, the 200-species almanac,
accounts and admin tools all work exactly as they do online. The four AI
services that draw the creatures need paid API keys, and this version
deliberately ships without any keys so that it runs anywhere, offline, with
nothing to configure or expire.

If you need the real generated art, use Option A.

Two smaller differences: your archive starts empty, which is intended — scanning
a plant to fill it is the demo. And emails (verification, password reset) are
printed into the Docker log window instead of being sent.

### If something goes wrong

**Nothing loads at localhost:5173** — wait for the build to finish. It is done
when the log stops scrolling and shows `sprout-demo-web`.

**"port is already allocated"** — something else on the laptop is using port
5173, 3001, 8080, 9099 or 9199. Close it, or run
`docker compose -f docker-compose.demo.yml down` and try again.

**A scan fails, or a creature has no picture** — check the server is healthy at
<http://localhost:3001/api/health/ready>. It should return `200` with both
checks passing. If it does not, restart the stack.

**Start completely fresh:**

```bash
docker compose -f docker-compose.demo.yml down -v
docker compose -f docker-compose.demo.yml up --build
```

---

## About a local AI model

We were asked whether a laptop with a GPU would be needed to run the
classification and generation model locally.

It would not help. There is no local model in this project — species
identification and creature generation are calls to four external services
(Plant.id, Google Gemini, NVIDIA, withoutBG) over the internet. Building a
version that runs those models on the laptop itself would be a new piece of
work rather than a repackaging of what exists, so no GPU specification would be
meaningful.

What the AI features actually depend on is API credit, not hardware. Option A
uses our team's accounts. If SUTD would rather not depend on those, the same
Docker stack in Option B can be pointed at SUTD's own API keys — ask us and we
will show you where they go.

---

## Repository

<https://github.com/Kopi-O-Kosong-Beng/sprout-web-app> — public, no access
request needed.

Engineering detail lives in [`md/CONTAINERIZATION.md`](md/CONTAINERIZATION.md)
and [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). The published API image is at
`ghcr.io/kopi-o-kosong-beng/sprout-web-app-server:latest`, though Option B
builds what it needs and you should not have to pull it.
