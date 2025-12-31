#!/usr/bin/env uv
# /// script
# dependencies = [
#   "flask==3.0.0",
#   "playwright==1.45.0",
# ]
# ///

import asyncio
import json
import os
import time
from urllib.parse import urlparse, parse_qs
from flask import Flask, request, jsonify, Response
from playwright.async_api import async_playwright
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

async def get_browser_and_context():
    """Launch browser and create context with proper settings"""
    playwright = await async_playwright().start()

    # Launch browser (no need for minimal chromium since this runs elsewhere)
    browser = await playwright.chromium.launch(
        headless=True,
        args=[
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--enable-font-antialiasing',
        ]
    )

    # Create context with proper viewport
    context = await browser.new_context(
        viewport={
            'width': 1400,
            'height': 2200
        },
        device_scale_factor=2
    )

    return playwright, browser, context

async def capture_snapshot(render_url: str):
    """Capture screenshot of rendered snapshot"""
    playwright = None
    browser = None

    try:
        logger.info(f"🚀 Starting capture for render URL: {render_url}")

        # Launch browser
        browser_start_time = time.time()
        playwright, browser, context = await get_browser_and_context()
        logger.info(f"✅ Browser launched in {(time.time() - browser_start_time) * 1000:.0f}ms")

        # Create page
        page = await context.new_page()

        # Set up event listeners
        page.on('console', lambda msg: logger.info(f"🖥️ Browser console: {msg.type} {msg.text}"))
        page.on('pageerror', lambda err: logger.error(f"❌ Page error: {err}"))
        page.on('requestfailed', lambda req: logger.error(f"🚫 Request failed: {req.url} - {req.failure}"))

        logger.info(f"🔗 Navigating to: {render_url}")

        # Navigate to render page
        nav_start_time = time.time()
        await page.goto(
            render_url,
            wait_until='networkidle',
            timeout=5000
        )
        logger.info(f"✅ Navigation completed in {(time.time() - nav_start_time) * 1000:.0f}ms")

        # Check page title
        title = await page.title()
        logger.info(f"📋 Page title: {title}")

        # Wait for rendering to complete
        logger.info("⏳ Waiting for rendering to complete...")
        render_start_time = time.time()

        try:
            await page.wait_for_function(
                "() => window.renderComplete === true",
                timeout=45000
            )
            logger.info(f"✅ Rendering completed in {(time.time() - render_start_time) * 1000:.0f}ms")
        except Exception as timeout_error:
            logger.error("⏰ Rendering timeout after 45s")

            # Get page state for debugging
            render_status = await page.evaluate("""() => ({
                renderComplete: window.renderComplete,
                canvasPresent: !!document.querySelector('canvas'),
                fabricLoaded: !!window.fabric,
                anyErrors: window.lastError,
                readyState: document.readyState
            })""")
            logger.error(f"🔍 Current page state: {render_status}")

            raise Exception(f"Rendering timeout: {render_status}")

        # Take screenshot of canvas
        logger.info("📸 Taking canvas screenshot...")
        screenshot_start_time = time.time()

        canvas_element = await page.query_selector('canvas')
        if not canvas_element:
            page_content = await page.evaluate("""() => ({
                bodyHTML: document.body.innerHTML.substring(0, 500),
                canvasCount: document.querySelectorAll('canvas').length,
                hasRenderStatus: !!document.querySelector('#render-status')
            })""")
            logger.error(f"❌ Canvas element not found. Page content: {page_content}")
            raise Exception("Canvas element not found")

        image_buffer = await canvas_element.screenshot(type='png')

        logger.info(f"✅ Screenshot taken in {(time.time() - screenshot_start_time) * 1000:.0f}ms, size: {len(image_buffer)} bytes")

        return image_buffer

    finally:
        # Cleanup
        if browser:
            logger.info("🔒 Closing browser...")
            await browser.close()
        if playwright:
            await playwright.stop()

@app.route('/export-image', methods=['POST'])
def export_image():
    """Export image endpoint - matches the TypeScript API"""
    try:
        # Get render URL from request
        data = request.get_json()
        if not data or 'renderUrl' not in data:
            logger.error('❌ No render URL provided')
            return jsonify({'error': 'Render URL is required'}), 400

        render_url = data['renderUrl']

        # Run async capture function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            image_buffer = loop.run_until_complete(capture_snapshot(render_url))
        finally:
            loop.close()

        # Create filename - extract snapshot ID from URL if possible, or use timestamp
        try:
            parsed_url = urlparse(render_url)
            query_params = parse_qs(parsed_url.query)
            snapshot_id = query_params.get('snapshotId', [None])[0]
            if snapshot_id:
                sanitized_name = f"snapshot-{snapshot_id}"
            else:
                sanitized_name = f"snapshot-{int(time.time())}"
        except Exception:
            sanitized_name = f"snapshot-{int(time.time())}"

        logger.info("🎉 Export completed successfully!")

        # Return image response
        return Response(
            image_buffer,
            mimetype='image/png',
            headers={
                'Content-Disposition': f'attachment; filename="maimai-profile-{sanitized_name}.png"',
                'Content-Length': str(len(image_buffer))
            }
        )

    except Exception as error:
        logger.error(f"💥 Failed to generate image: {error}")
        logger.error(f"📍 Error details: {str(error)}")

        return jsonify({
            'error': 'Failed to generate image',
            'details': str(error)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'maimai-render-server'})

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with service info"""
    return jsonify({
        'service': 'MaiMai Render Server',
        'version': '1.0.0',
        'endpoints': {
            'export': '/export-image (POST)',
            'health': '/health (GET)'
        }
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 23740))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'

    logger.info(f"🚀 Starting MaiMai Render Server on port {port}")
    logger.info(f"🔧 Debug mode: {debug}")

    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )
