# Mirsad — Deployment and Camera Integration Guide

## 1. What is included

- React/TypeScript website with Arabic RTL and English LTR interfaces.
- Dark and light themes, desktop/mobile layouts, capture review, searchable records, CSV export, price/cost settings, and daily/monthly/annual financial reports.
- Hono/tRPC backend with Drizzle ORM and MySQL persistence.
- Authenticated `POST /api/vision/events` entry/exit ingestion.
- Python vision worker with RTSP camera input, YOLO detection, ByteTrack tracking, normalized bay zones, size calibration, JPEG captures, retries, and a local network-outage spool.

**Important:** the website’s initial vehicle scenes are simulations, and seeded historical records are demonstration data. The vision worker is real integration code, but detection quality and camera compatibility must be validated on the actual site. Annual figures are projections, not realized annual profit.

## 2. Deployment architecture

Use three components:

1. **MySQL 8+**: stores settings and wash events.
2. **Mirsad web service**: serves the website and API on port `3000`.
3. **Vision service**: runs near the cameras, reads RTSP streams, and sends HTTPS events to the web service.

The vision machine needs network access to both the cameras and the Mirsad API. Camera passwords and `VISION_API_KEY` must never be placed in frontend code.

## 3. Prerequisites

- Ubuntu 22.04/24.04 or a similar Linux server.
- Node.js 22 and npm for a direct Node deployment.
- MySQL 8+.
- Docker and Docker Buildx if using the supplied Dockerfiles.
- Python 3.11 if running the vision worker without Docker.
- A fixed camera installation, RTSP URL, camera username/password, and a public HTTPS domain for production.
- Sufficient GPU/CPU capacity for the selected YOLO model and number of camera streams. Start with one camera and the default small model, then measure actual load.

## 4. Create and configure the database

Create an empty database and a dedicated MySQL user. Example, run as a MySQL administrator:

```sql
CREATE DATABASE mirsad CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mirsad'@'%' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON mirsad.* TO 'mirsad'@'%';
FLUSH PRIVILEGES;
```

For a local-only database, use `'mirsad'@'localhost'` instead and adjust the grants accordingly.

In the project root:

```bash
cp .env.example .env
```

Generate secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Edit `.env`:

```dotenv
APP_ID=mirsad
APP_SECRET=PASTE_THE_FIRST_RANDOM_VALUE
DATABASE_URL=mysql://mirsad:URL_ENCODED_DATABASE_PASSWORD@DATABASE_HOST:3306/mirsad
VISION_API_KEY=PASTE_THE_SECOND_RANDOM_VALUE
SEED_DEMO_DATA=false
```

Use `SEED_DEMO_DATA=false` **before the first production run**. Set it to `true` only for a demonstration environment. URL-encode special characters in the database password.

Apply the schema:

```bash
npm ci
npm run db:push
```

## 5. Option A — run the website directly with Node.js

From the project root:

```bash
npm ci
npm run check
npm run test
npm run lint
npm run build
NODE_ENV=production PORT=3000 npm start
```

Open `http://SERVER_IP:3000` only during private setup. For production, bind the app behind HTTPS as described below.

To run as a systemd service, create `/etc/systemd/system/mirsad.service`:

```ini
[Unit]
Description=Mirsad web service
After=network-online.target mysql.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/mirsad
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/mirsad/.env
ExecStart=/usr/bin/node /opt/mirsad/dist/boot.js
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

Adjust the project path and Node binary if different, then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mirsad
sudo systemctl status mirsad
```

## 6. Option B — run the website with Docker

The web Dockerfile builds from source and does not copy `.env` into the runtime image.

Apply the database schema first using step 4, then:

```bash
docker build -t mirsad-web .
docker run -d \
  --name mirsad-web \
  --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:3000:3000 \
  mirsad-web
```

Check it:

```bash
docker logs --tail 100 mirsad-web
curl -I http://127.0.0.1:3000/
```

## 7. Configure HTTPS with Nginx

Point the DNS record for the chosen domain to the server, install Nginx and Certbot, then create an Nginx site:

```nginx
server {
    listen 80;
    server_name mirsad.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and obtain a certificate:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d mirsad.example.com
```

Replace the example domain with the real domain. Use the HTTPS URL everywhere after this step. The application does not include staff accounts; place the dashboard behind organization access controls or an authenticated reverse proxy before exposing it to untrusted users.

## 8. Configure cameras and bay zones

In `vision-service`:

```bash
cp cameras.example.yaml cameras.yaml
```

For each camera, set:

- `id`: a unique camera ID such as `CAM-01`.
- `rtsp_url`: preferably supplied through an environment variable.
- `zones`: one non-overlapping polygon for each wash bay visible to that camera.

Polygon points are normalized to `[0,1]`:

```text
x = pixel_x / frame_width
y = pixel_y / frame_height
```

The worker uses the vehicle bounding box’s bottom-center point. Mark the actual vehicle position on the wash floor, not the roof alone. Keep zones separate and avoid overlapping lanes, queue areas, and adjacent bays.

Recommended starting values:

```yaml
entry_frames: 3
exit_frames: 8
frame_skip: 2
confidence: 0.45
```

Increase entry/exit frame counts if brief false detections create events. Reduce them only if real events are being delayed or missed. Keep camera clocks and the server synchronized with NTP.

## 9. Calibrate vehicle size classification

The worker uses YOLO’s vehicle class plus normalized bounding-box area:

- `bus` and `truck` start as `large`.
- Other vehicles use `size.medium_area` and `size.large_area`.

The supplied thresholds are starting values, not validated accuracy claims. At each camera position:

1. Record representative small, medium, and large vehicles.
2. Compare the assigned class with the correct wash category.
3. Adjust `medium_area` and `large_area` while keeping `0 <= medium_area < large_area < 1`.
4. Repeat the test in day/night lighting and with partially occluded vehicles.
5. Use the website’s size dropdown to correct errors; the corrected price, cost, and confidence are saved to MySQL.

For higher accuracy, train/fine-tune a model on labeled site footage and validate it on a separate test set before changing the production model.

## 10. Configure image storage

JPEG captures are always written to the local `captures_dir` when storage is available.

- With no `public_base_url` or S3 configuration, the event is still stored, but the website honestly shows that the capture image is unavailable.
- `public_base_url` must point to durable HTTPS hosting for the capture files.
- With S3-compatible storage, set `s3_bucket`, `s3_prefix`, optional `s3_endpoint_url`, `s3_region`, and a permanent `public_base_url` that maps to the stored object keys.
- Supply S3 credentials through the standard `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables or the machine’s AWS credential provider.

Do not use short-lived presigned URLs for historical records. Define a capture-retention policy appropriate for the site and local privacy requirements.

## 11. Run the vision service

### Direct Python run

```bash
cd vision-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export MIRSAD_API_URL=https://mirsad.example.com
export VISION_API_KEY='THE_SAME_KEY_AS_THE_WEB_SERVER'
export CAM01_RTSP_URL='rtsp://USER:PASSWORD@CAMERA_IP:554/STREAM_PATH'
python -m unittest discover -s tests -v
python -m vision_service.worker --config cameras.yaml
```

The default `yolo11n.pt` model may be downloaded automatically on first run. If the machine is offline, download it in advance and set `service.model` to its local path.

### Docker run

```bash
cd vision-service
docker build -t mirsad-vision .
export MIRSAD_API_URL=https://mirsad.example.com
export VISION_API_KEY='THE_SAME_KEY_AS_THE_WEB_SERVER'
export CAM01_RTSP_URL='rtsp://USER:PASSWORD@CAMERA_IP:554/STREAM_PATH'

docker run -d \
  --name mirsad-vision \
  --restart unless-stopped \
  -e MIRSAD_API_URL \
  -e VISION_API_KEY \
  -e CAM01_RTSP_URL \
  -v "$PWD/cameras.yaml:/config/cameras.yaml:ro" \
  -v mirsad-captures:/data \
  -v mirsad-yolo-cache:/root/.cache \
  mirsad-vision
```

Use `--network host` on Linux only if camera addressing requires it. Check logs with `docker logs -f mirsad-vision`.

## 12. Camera event API

Endpoint:

```text
POST /api/vision/events
Header: x-api-key: VISION_API_KEY
Content-Type: application/json
```

Entry example:

```json
{
  "phase": "entry",
  "trackingId": "CAM-01-17-UNIQUE_OPERATION_SUFFIX",
  "cameraId": "CAM-01",
  "timestamp": "2026-11-07T10:15:00Z",
  "size": "medium",
  "confidence": 0.96,
  "bay": 1,
  "imageUrl": "https://captures.example.com/entry.jpg"
}
```

Exit example:

```json
{
  "phase": "exit",
  "trackingId": "CAM-01-17-UNIQUE_OPERATION_SUFFIX",
  "cameraId": "CAM-01",
  "timestamp": "2026-11-07T10:39:00Z",
  "bay": 1,
  "imageUrl": "https://captures.example.com/exit.jpg"
}
```

The entry and exit `trackingId` must match exactly. The supplied worker creates a unique suffix so reused ByteTrack IDs do not merge two vehicles. Revenue is recognized only after exit. Duration is calculated from the entry and exit timestamps.

Expected responses:

- `201`: entry accepted.
- `200`: exit accepted.
- `400`: invalid event payload.
- `401`: missing or wrong API key.
- `404`: exit has no matching entry.
- `503`: the web server has no `VISION_API_KEY` configured.

## 13. First end-to-end camera test

1. Confirm the web service, MySQL, and vision service are running.
2. Confirm the worker log shows `Connected to camera ...`.
3. Drive one known vehicle completely into one bay and wait beyond `entry_frames`.
4. Confirm an entry event appears with the correct camera, bay, size, and entry time.
5. Leave the bay and wait beyond `exit_frames`.
6. Confirm the same operation becomes completed and its duration matches the observed interval.
7. Reload the website and confirm the operation remains.
8. Check entry/exit images if image hosting is configured.
9. Verify daily/monthly revenue changes only after exit and uses the price/cost stored on the operation.
10. Test a temporary API network outage; events should enter the local spool and retry in order after reconnection.

## 14. Daily operation and financial rules

- Use **Vehicle records** to search, inspect captures, filter low-confidence classifications, correct sizes, and export CSV.
- Use **Prices & costs** for small/medium/large prices, variable costs, fixed daily expense, and labor.
- Daily and monthly reports use completed operations and actual stored transaction prices/costs.
- Daily net profit = revenue − variable costs − fixed daily expense − labor.
- Monthly fixed costs use elapsed calendar days in the current month.
- Annual values project the recent daily average across 365 days and are labeled as projections.
- Language and theme preferences are stored only in the user’s browser; wash events and settings are stored in MySQL.
- Back up MySQL and capture storage regularly and test restoration.

## 15. Production go-live checklist

- `SEED_DEMO_DATA=false` was set before initializing an empty production database.
- HTTPS is active and HTTP is redirected to HTTPS.
- `VISION_API_KEY`, database credentials, RTSP credentials, and application secret are unique and not committed to source control.
- Dashboard access is restricted to authorized staff.
- Camera positions and zones are fixed; cameras and server use synchronized time.
- Vehicle classes and size thresholds have been field-tested in actual lighting conditions.
- Entry/exit, capture loading, duration, correction persistence, reports, and CSV have passed an on-site test.
- Database backups, capture retention, disk-space monitoring, and service restart policies are configured.
- Staff know how to review low-confidence events and orphaned active washes after a prolonged camera outage.

## 16. Troubleshooting

- **`401 Unauthorized`**: the worker and web server keys differ, or the `x-api-key` header is missing.
- **`503 Vision ingestion is not configured`**: set `VISION_API_KEY` on the web service and restart it.
- **`404 No entry event found`**: the entry failed, the ID changed, or the exit arrived before a successful entry. Check worker logs and spool files.
- **Camera will not open**: verify RTSP credentials/path, network routing, firewall rules, and camera codec. Test the URL with FFmpeg/VLC on the vision machine.
- **No detections**: verify the model loaded, the selected COCO class IDs, confidence threshold, image quality, and camera view.
- **False entry/exit events**: adjust polygons and increase consecutive-frame thresholds; check camera shake and occlusion.
- **Wrong vehicle sizes**: recalibrate area thresholds for that camera and review labeled examples before changing the model.
- **Missing images**: local capture does not automatically create a public URL. Configure HTTPS static hosting or S3-compatible storage.
- **Events stop during an outage**: inspect `captures_dir`’s sibling `spool` directory, disk space, API logs, and worker logs. The spool retries in order when connectivity returns.
- **Database errors**: verify `DATABASE_URL`, MySQL permissions, schema migration, and server reachability.

## 17. Verification commands and source layout

```bash
# Website
npm run check
npm run lint
npm run test
npm run build

# Camera logic, without a physical camera
cd vision-service
PYTHONPATH=. python -m unittest discover -s tests -v
```

Key directories:

```text
src/                  React website and financial calculations
api/                  Hono/tRPC API and database queries
contracts/vision.ts   Shared camera-event validation
db/schema.ts          MySQL tables
vision-service/       RTSP/YOLO/ByteTrack worker and tests
Dockerfile            Self-contained web image build
```
