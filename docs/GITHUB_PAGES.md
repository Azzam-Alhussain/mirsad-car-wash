# GitHub Pages setup

The Pages deployment is intentionally the **standalone interactive demo**, not the MySQL-backed production service. It makes no API requests and does not connect to cameras. Settings last for the current browser session only.

## Enable Pages

1. Open the repository on GitHub.
2. Select **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Open **Actions**, select **Build and deploy GitHub Pages demo**, and allow the workflow to run.
5. If it has not run automatically, select **Run workflow** on the `main` branch.
6. After deployment, open:

   `https://azzam-alhussain.github.io/mirsad-car-wash/`

The workflow sets `VITE_FRONTEND_DEMO=true` and the project-page base path `/mirsad-car-wash/`. It runs TypeScript and regression tests before deployment.

## Full-stack deployment

GitHub Pages cannot run Hono, MySQL, or the Python camera worker. Follow [../DEPLOYMENT.md](../DEPLOYMENT.md) for the production backend and camera service. The repository remains the single source for both variants.
