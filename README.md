# Mirsad — Car-Wash Monitoring and Profitability

Mirsad is a bilingual car-wash operations dashboard that connects vehicle entry/exit events, wash duration, vehicle size, captures, prices, costs, and financial reports in one record.

## Interactive demo

**GitHub Pages:** [Open the Mirsad demo](https://azzam-alhussain.github.io/mirsad-car-wash/)

The Pages site is a standalone simulation with demo data. It does not connect to MySQL or physical cameras. See [GitHub Pages setup](docs/GITHUB_PAGES.md) if the site has not been enabled yet.

## Features

- Arabic RTL and English LTR interfaces.
- Dark and light themes with persistent browser preferences.
- Three simulated wash bays, vehicle queue, automatic entry/exit, and stay-duration tracking.
- Small, medium, and large vehicle classifications with confidence review and operator correction.
- Entry/exit capture review with an explicit unavailable-image state when no URL exists.
- Searchable records, filters, correction controls, and UTF-8 CSV export.
- Daily and monthly actual reports plus clearly labeled annual projections.
- Per-operation stored price and cost so later setting changes do not rewrite history.
- MySQL-persisted settings and camera events.
- Authenticated camera ingestion with request validation and body-size limits.
- RTSP/YOLO/ByteTrack vision worker with bay zones, JPEG captures, retries, and offline event spooling.
- Responsive desktop/mobile layouts and reduced-motion support.

## Repository contents

```text
src/                       React/TypeScript frontend
api/                       Hono/tRPC API and persistence logic
contracts/vision.ts        Shared camera-event schema
db/schema.ts               MySQL wash-event and settings tables
vision-service/            Python RTSP/YOLO/ByteTrack worker
Dockerfile                 Full-stack web image
vision-service/Dockerfile  Camera-worker image
DEPLOYMENT.md              Complete production deployment guide
TECHNICAL.md               Architecture, API, data, and calculation details
docs/GITHUB_PAGES.md       Static demo publication instructions
```

## Run the standalone demo locally

Requires Node.js 22.

```bash
npm ci
VITE_FRONTEND_DEMO=true npm run dev
```

Open the local URL printed by Vite. The demo makes no backend requests. Camera submission is disabled and settings are session-only.

To build the static site:

```bash
VITE_FRONTEND_DEMO=true VITE_BASE_PATH=/ npm run build
```

The static entry point is `dist/index.html`.

## Run the full-stack application

Requirements: Node.js 22 and MySQL 8+.

```bash
cp .env.example .env
# Edit DATABASE_URL, APP_SECRET, VISION_API_KEY, and SEED_DEMO_DATA=false.
npm ci
npm run db:push
npm run check
npm run test
npm run build
NODE_ENV=production PORT=3000 npm start
```

For Docker, HTTPS, systemd, database privileges, backups, and go-live checks, follow **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Run the camera integration worker

Requirements: Python 3.11, an RTSP camera, and a reachable Mirsad API.

```bash
cd vision-service
cp cameras.example.yaml cameras.yaml
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export MIRSAD_API_URL=https://YOUR_MIRSAD_DOMAIN
export VISION_API_KEY=YOUR_SHARED_INGESTION_KEY
export CAM01_RTSP_URL=rtsp://USER:PASSWORD@CAMERA_IP/STREAM_PATH
python -m vision_service.worker --config cameras.yaml
```

Calibrate bay polygons and size thresholds on actual site footage before production use. See [TECHNICAL.md](TECHNICAL.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Verification

```bash
npm run check
npm run lint
npm run test
npm run build

cd vision-service
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

## Security and data boundaries

- Never commit `.env`, `vision-service/cameras.yaml`, RTSP credentials, database passwords, or capture data.
- Use a long random `VISION_API_KEY` and HTTPS for public ingestion.
- GitHub Pages hosts only the static demo; deploy Hono/MySQL and the vision worker separately.
- The application does not include staff accounts. Restrict production dashboard access through organization authentication or an authenticated reverse proxy.
- `SEED_DEMO_DATA=false` prevents demonstration history from entering a new production database.
- Annual financial values are projections. Simulated scenes and seeded records are not real camera output.

## Documentation

- [Technical architecture and calculations](TECHNICAL.md)
- [Deployment and camera operations](DEPLOYMENT.md)
- [GitHub Pages setup](docs/GITHUB_PAGES.md)
