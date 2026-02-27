"""Headless browser screenshots for dashboards/charts.

Uses Playwright with headless Chromium to capture shared dashboard pages
as PNG or PDF. Designed to run inside the Docker network where nginx is
reachable at INTERNAL_URL.
"""

import os
import logging

from playwright.async_api import async_playwright

logger = logging.getLogger("karta.screenshot")

# Base URL for internal requests (within Docker network)
INTERNAL_URL = os.environ.get("INTERNAL_URL", "http://nginx:80")


async def capture_dashboard(token: str, format: str = "png",
                            width: int = 1280, height: int = 900,
                            wait_ms: int = 3000) -> bytes:
    """Capture a shared dashboard as PNG or PDF.

    Args:
        token: Share link token (the path segment used in /shared/<token>).
        format: "png" or "pdf".
        width: Viewport width in pixels.
        height: Viewport height in pixels.
        wait_ms: Extra wait time (ms) after networkidle for charts to render.

    Returns:
        Screenshot bytes (PNG or PDF).
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page(viewport={"width": width, "height": height})

        try:
            url = f"{INTERNAL_URL}/shared/{token}"
            logger.info("Capturing %s screenshot of %s", format.upper(), url)
            await page.goto(url, wait_until="networkidle", timeout=30000)
            # Extra wait for Plotly charts to finish rendering
            await page.wait_for_timeout(wait_ms)

            if format == "pdf":
                data = await page.pdf(
                    width=f"{width}px",
                    print_background=True,
                    margin={"top": "10px", "right": "10px",
                            "bottom": "10px", "left": "10px"},
                )
            else:
                data = await page.screenshot(full_page=True, type="png")
        finally:
            await browser.close()

        logger.info("Captured %d bytes (%s)", len(data), format.upper())
        return data
