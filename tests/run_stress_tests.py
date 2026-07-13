#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_SCRIPTS = [
    'content/namespace.js',
    'content/settings.js',
    'content/diagnostics.js',
    'content/dom.js',
    'content/video.js',
    'content/board.js',
    'content/lightbox.js',
    'content/loading.js',
    'content/routing.js',
    'content/main.js',
]


def find_chromium() -> str | None:
    for command in ['chromium', 'google-chrome', 'chromium-browser', 'chrome', 'msedge']:
        found = shutil.which(command)
        if found:
            return found
    candidates = [
        Path(os.environ.get('PROGRAMFILES', '')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('PROGRAMFILES(X86)', '')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('LOCALAPPDATA', '')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('PROGRAMFILES', '')) / 'Microsoft/Edge/Application/msedge.exe',
        Path(os.environ.get('PROGRAMFILES(X86)', '')) / 'Microsoft/Edge/Application/msedge.exe',
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def metric_map(client) -> dict[str, float]:
    raw = client.send('Performance.getMetrics').get('metrics', [])
    return {entry['name']: entry['value'] for entry in raw}


def install_extension(page, version: str) -> None:
    page.evaluate(
        """(version) => {
          const storageData = {};
          const clone = (value) => JSON.parse(JSON.stringify(value));
          globalThis.__LMM_TEST_MODE__ = true;
          globalThis.__LMM_TEST_ORIGIN__ = 'https://x.com';
          globalThis.__LMM_TEST_CASE__ = 'stress';
          globalThis.chrome = {
            storage: {
              local: {
                get: async (keys) => {
                  if (keys == null) return clone(storageData);
                  const list = Array.isArray(keys) ? keys : [keys];
                  return Object.fromEntries(list.filter((key) => key in storageData).map((key) => [key, clone(storageData[key])]));
                },
                set: async (values) => {
                  for (const [key, value] of Object.entries(values || {})) storageData[key] = clone(value);
                },
                remove: async (keys) => {
                  for (const key of Array.isArray(keys) ? keys : [keys]) delete storageData[key];
                },
              },
            },
            runtime: {
              id: 'lmm-stress-extension',
              getManifest: () => ({ version }),
              onMessage: { addListener: () => {} },
            },
          };
        }""",
        version,
    )
    page.add_style_tag(path=str(ROOT / 'content.css'))
    for relative in CONTENT_SCRIPTS:
        page.add_script_tag(path=str(ROOT / relative))
    page.wait_for_function('globalThis.__LMM_TEST_HOOKS__ && globalThis.__LIKED_MEDIA_MASONRY__')


def create_articles(page, container_selector: str, start: int, count: int, *, video_every: int = 0) -> None:
    page.evaluate(
        """({ selector, start, count, videoEvery }) => {
          const container = document.querySelector(selector);
          if (!container) throw new Error(`Missing article container: ${selector}`);
          const fragment = document.createDocumentFragment();
          for (let offset = 0; offset < count; offset += 1) {
            const index = start + offset;
            const article = document.createElement('article');
            article.dataset.testid = 'tweet';
            const media = videoEvery > 0 && index % videoEvery === 0
              ? `<img src="https://pbs.twimg.com/ext_tw_video_thumb/VID${index}/pu/img/thumb.jpg"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/VID${index}/pu/img/thumb.jpg" src="blob:https://x.com/video-${index}"></video>`
              : `<img src="https://pbs.twimg.com/media/IMG${index}?format=jpg&name=small">`;
            article.innerHTML = `
              <div data-testid="User-Name">Synthetic User ${index} @synthetic${index}</div>
              <div data-testid="tweetText">Synthetic fixture ${index}</div>
              <a href="/synthetic${index}/status/${1000000 + index}">
                <time datetime="2026-07-13T00:00:00Z">2026-07-13</time>
              </a>
              ${media}
            `;
            fragment.appendChild(article);
          }
          container.appendChild(fragment);
        }""",
        {'selector': container_selector, 'start': start, 'count': count, 'videoEvery': video_every},
    )


def assert_condition(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def run_progressive_scenario(browser, version: str) -> dict:
    page_errors: list[str] = []
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.route('https://pbs.twimg.com/**', lambda route: route.abort())
    page.route('https://video.twimg.com/**', lambda route: route.abort())
    page.set_content(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>'
        '<main data-testid="primaryColumn"><section id="timeline-a"></section></main>'
        '</body></html>',
        wait_until='domcontentloaded',
    )
    create_articles(page, '#timeline-a', 0, 600)
    install_extension(page, version)
    client = page.context.new_cdp_session(page)
    client.send('Performance.enable')

    result = page.evaluate(
        """async () => {
          const hooks = globalThis.__LMM_TEST_HOOKS__;
          hooks.clearCollectedMedia();
          const scanStarted = performance.now();
          const initialAdded = hooks.scanTweets(document);
          const initialScanMs = performance.now() - scanStarted;
          hooks.openOverlay();
          await new Promise((resolve) => setTimeout(resolve, 700));
          const overlay = document.getElementById('xlg-overlay');
          const middleItem = hooks.state.items[299];
          hooks.openLightbox(middleItem);
          const lightboxKeyBefore = hooks.state.lightboxItemKey;

          const batchTimes = [];
          for (let batch = 0; batch < 5; batch += 1) {
            const holder = document.createElement('section');
            holder.id = `incremental-${batch}`;
            document.querySelector('[data-testid="primaryColumn"]').appendChild(holder);
            const fragment = document.createDocumentFragment();
            for (let offset = 0; offset < 100; offset += 1) {
              const index = 600 + batch * 100 + offset;
              const article = document.createElement('article');
              article.dataset.testid = 'tweet';
              article.innerHTML = `<div data-testid="User-Name">Batch ${index}</div><a href="/batch/status/${1000000 + index}"><time datetime="2026-07-13T00:00:00Z">date</time></a><img src="https://pbs.twimg.com/media/BATCH${index}?format=jpg&name=small">`;
              fragment.appendChild(article);
            }
            holder.appendChild(fragment);
            const started = performance.now();
            const added = hooks.scanTweets(holder);
            batchTimes.push({ added, elapsedMs: performance.now() - started });
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
          const lightboxKeyAfter = hooks.state.lightboxItemKey;
          const duplicateStarted = performance.now();
          const duplicateAdded = hooks.scanTweets(document);
          const duplicateScanMs = performance.now() - duplicateStarted;

          hooks.closeLightbox();
          for (let cycle = 0; cycle < 20; cycle += 1) {
            overlay.scrollTop = cycle % 2 === 0 ? Math.max(0, overlay.scrollHeight - overlay.clientHeight) : 0;
            overlay.dispatchEvent(new Event('scroll'));
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          await new Promise((resolve) => setTimeout(resolve, 1100));

          for (let cycle = 0; cycle < 40; cycle += 1) {
            hooks.openLightbox(hooks.state.items[cycle % hooks.state.items.length]);
            hooks.closeLightbox();
          }

          const primary = document.querySelector('[data-testid="primaryColumn"]');
          primary.replaceChildren();
          const replacement = document.createElement('section');
          replacement.id = 'timeline-b';
          primary.appendChild(replacement);
          for (let index = 1100; index < 1150; index += 1) {
            const article = document.createElement('article');
            article.dataset.testid = 'tweet';
            article.innerHTML = `<a href="/spa/status/${1000000 + index}"><time datetime="2026-07-13T00:00:00Z">date</time></a><img src="https://pbs.twimg.com/media/SPA${index}?format=jpg&name=small">`;
            replacement.appendChild(article);
          }
          globalThis.__LIKED_MEDIA_MASONRY__.modules.routing.installObserver();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const observerRootIsReplacement = hooks.state.observerRoot === replacement;

          const mutationFragment = document.createDocumentFragment();
          for (let index = 1150; index < 1175; index += 1) {
            const article = document.createElement('article');
            article.dataset.testid = 'tweet';
            article.innerHTML = `<a href="/mutation/status/${1000000 + index}"><time datetime="2026-07-13T00:00:00Z">date</time></a><img src="https://pbs.twimg.com/media/MUT${index}?format=jpg&name=small">`;
            mutationFragment.appendChild(article);
          }
          replacement.appendChild(mutationFragment);
          await new Promise((resolve) => setTimeout(resolve, 1200));

          for (let index = 0; index < 80; index += 1) {
            const item = {
              key: `stress-video-${index}`,
              kind: 'video',
              mediaPath: `pbs.twimg.com/ext_tw_video_thumb/STRESS${index}/pu/img/thumb.jpg|`,
              videoSrc: '',
              isGif: false,
              order: index,
            };
            const video = document.createElement('video');
            video.setAttribute('src', `blob:https://x.com/stress-${index}`);
            document.body.appendChild(video);
            hooks.watchVideoSource(item, video);
            if (index % 2 === 0) video.remove();
          }

          const current = {
            initialAdded,
            initialScanMs,
            batchTimes,
            duplicateAdded,
            duplicateScanMs,
            lightboxKeyPreserved: lightboxKeyBefore === lightboxKeyAfter,
            itemCount: hooks.state.items.length,
            itemMapSize: hooks.state.itemMap.size,
            itemIndexSize: hooks.state.itemIndexMap.size,
            mediaPathIndexSize: hooks.state.mediaPathIndex.size,
            cardCount: document.querySelectorAll('.xlg-card').length,
            hydratedCardCount: document.querySelectorAll('.xlg-card:not(.xlg-virtual-placeholder)').length,
            placeholderCount: document.querySelectorAll('.xlg-virtual-placeholder').length,
            domNodeCount: document.getElementsByTagName('*').length,
            overlayCount: document.querySelectorAll('#xlg-overlay').length,
            launcherCount: document.querySelectorAll('#xlg-launcher').length,
            lightboxCount: document.querySelectorAll('#xlg-lightbox').length,
            observerRootIsReplacement,
            unloadQueueSize: hooks.state.cardUnloadQueue.size,
            retainedVideoCount: hooks.state.retainedVideoElements.size,
            vaultedVideoCount: hooks.state.videoVault?.querySelectorAll('video').length || 0,
            loadPhaseBeforeSuspend: hooks.loadController.getPhase(),
          };
          hooks.suspendLikesPageWork();
          current.afterSuspend = {
            observerCleared: hooks.state.observer === null && hooks.state.observerRoot === null,
            unloadQueueSize: hooks.state.cardUnloadQueue.size,
            retainedVideoCount: hooks.state.retainedVideoElements.size,
            loadPhase: hooks.loadController.getPhase(),
          };
          return current;
        }"""
    )
    cdp_metrics = metric_map(client)
    result['jsHeapUsedBytes'] = int(cdp_metrics.get('JSHeapUsedSize', 0))
    result['jsHeapTotalBytes'] = int(cdp_metrics.get('JSHeapTotalSize', 0))
    result['pageErrors'] = page_errors

    failures: list[str] = []
    assert_condition(result['initialAdded'] == 600, f"initial scan added {result['initialAdded']} instead of 600", failures)
    assert_condition(result['initialScanMs'] < 3000, f"initial 600-item scan took {result['initialScanMs']:.1f}ms", failures)
    assert_condition(all(batch['added'] == 100 for batch in result['batchTimes']), 'one or more incremental batches did not add exactly 100 items', failures)
    assert_condition(all(batch['elapsedMs'] < 1500 for batch in result['batchTimes']), 'one or more 100-item incremental scans exceeded 1500ms', failures)
    assert_condition(result['duplicateAdded'] == 0, f"duplicate rescan added {result['duplicateAdded']} items", failures)
    assert_condition(result['duplicateScanMs'] < 3000, f"duplicate rescan took {result['duplicateScanMs']:.1f}ms", failures)
    assert_condition(result['lightboxKeyPreserved'], 'lightbox current item changed during incremental collection', failures)
    assert_condition(result['itemCount'] == 1175, f"final item count is {result['itemCount']} instead of 1175", failures)
    assert_condition(result['itemMapSize'] == 1175 and result['itemIndexSize'] == 1175 and result['mediaPathIndexSize'] == 1175, 'item indexes diverged from item count', failures)
    assert_condition(result['cardCount'] == 1175, f"card count is {result['cardCount']} instead of 1175", failures)
    assert_condition(result['hydratedCardCount'] <= 120, f"too many cards remained hydrated: {result['hydratedCardCount']}", failures)
    assert_condition(result['domNodeCount'] < 20000, f"DOM node count exceeded stress ceiling: {result['domNodeCount']}", failures)
    assert_condition(result['overlayCount'] == result['launcherCount'] == result['lightboxCount'] == 1, 'duplicate extension UI roots were created', failures)
    assert_condition(result['observerRootIsReplacement'], 'timeline observer did not reconnect to the replacement root', failures)
    assert_condition(result['unloadQueueSize'] == 0, f"card unload queue did not drain: {result['unloadQueueSize']}", failures)
    assert_condition(result['retainedVideoCount'] <= 3, f"retained video count exceeded 3: {result['retainedVideoCount']}", failures)
    assert_condition(result['vaultedVideoCount'] <= 1, f"hidden video vault grew unexpectedly: {result['vaultedVideoCount']}", failures)
    assert_condition(result['afterSuspend']['observerCleared'], 'observer was not cleared on suspend', failures)
    assert_condition(result['afterSuspend']['unloadQueueSize'] == 0, 'unload queue remained after suspend', failures)
    assert_condition(result['afterSuspend']['retainedVideoCount'] == 0, 'retained videos remained after suspend', failures)
    assert_condition(result['afterSuspend']['loadPhase'] == 'idle', f"load controller phase after suspend is {result['afterSuspend']['loadPhase']}", failures)
    assert_condition(result['jsHeapUsedBytes'] < 256 * 1024 * 1024, f"JS heap exceeded 256MiB: {result['jsHeapUsedBytes']}", failures)
    assert_condition(not page_errors, f"page errors occurred: {page_errors[:3]}", failures)
    result['failures'] = failures
    page.close()
    return result


def run_scale_scenario(browser, version: str) -> dict:
    page_errors: list[str] = []
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.route('https://pbs.twimg.com/**', lambda route: route.abort())
    page.set_content(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>'
        '<main data-testid="primaryColumn"><section id="scale-timeline"></section></main>'
        '</body></html>',
        wait_until='domcontentloaded',
    )
    create_articles(page, '#scale-timeline', 0, 5000)
    install_extension(page, version)
    client = page.context.new_cdp_session(page)
    client.send('Performance.enable')
    result = page.evaluate(
        """async () => {
          const hooks = globalThis.__LMM_TEST_HOOKS__;
          hooks.clearCollectedMedia();
          const started = performance.now();
          const added = hooks.scanTweets(document);
          const scanMs = performance.now() - started;
          document.getElementById('scale-timeline').remove();
          hooks.openOverlay();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const duplicateStarted = performance.now();
          const duplicateAdded = hooks.scanTweets(document);
          const duplicateScanMs = performance.now() - duplicateStarted;
          const overlay = document.getElementById('xlg-overlay');
          overlay.scrollTop = Math.max(0, overlay.scrollHeight - overlay.clientHeight);
          overlay.dispatchEvent(new Event('scroll'));
          await new Promise((resolve) => setTimeout(resolve, 1100));
          return {
            added,
            scanMs,
            duplicateAdded,
            duplicateScanMs,
            itemCount: hooks.state.items.length,
            itemMapSize: hooks.state.itemMap.size,
            itemIndexSize: hooks.state.itemIndexMap.size,
            mediaPathIndexSize: hooks.state.mediaPathIndex.size,
            cardCount: document.querySelectorAll('.xlg-card').length,
            hydratedCardCount: document.querySelectorAll('.xlg-card:not(.xlg-virtual-placeholder)').length,
            placeholderCount: document.querySelectorAll('.xlg-virtual-placeholder').length,
            domNodeCount: document.getElementsByTagName('*').length,
            unloadQueueSize: hooks.state.cardUnloadQueue.size,
            retainedVideoCount: hooks.state.retainedVideoElements.size,
            overlayScrollHeight: overlay.scrollHeight,
            overlayClientHeight: overlay.clientHeight,
          };
        }"""
    )
    cdp_metrics = metric_map(client)
    result['jsHeapUsedBytes'] = int(cdp_metrics.get('JSHeapUsedSize', 0))
    result['jsHeapTotalBytes'] = int(cdp_metrics.get('JSHeapTotalSize', 0))
    result['pageErrors'] = page_errors

    failures: list[str] = []
    assert_condition(result['added'] == 5000, f"5,000-item scan added {result['added']}", failures)
    assert_condition(result['scanMs'] < 8000, f"5,000-item scan took {result['scanMs']:.1f}ms", failures)
    assert_condition(result['duplicateAdded'] == 0, f"5,000-item duplicate rescan added {result['duplicateAdded']}", failures)
    assert_condition(result['duplicateScanMs'] < 3000, f"post-removal duplicate scan took {result['duplicateScanMs']:.1f}ms", failures)
    assert_condition(result['itemCount'] == result['itemMapSize'] == result['itemIndexSize'] == result['mediaPathIndexSize'] == 5000, '5,000-item indexes diverged', failures)
    assert_condition(result['cardCount'] == 5000, f"5,000-item card count is {result['cardCount']}", failures)
    assert_condition(result['hydratedCardCount'] <= 120, f"5,000-item hydrated count is {result['hydratedCardCount']}", failures)
    assert_condition(result['unloadQueueSize'] == 0, f"5,000-item unload queue did not drain: {result['unloadQueueSize']}", failures)
    assert_condition(result['retainedVideoCount'] <= 3, f"5,000-item retained videos exceeded 3: {result['retainedVideoCount']}", failures)
    assert_condition(result['domNodeCount'] < 15000, f"5,000-item DOM node count exceeded 15,000: {result['domNodeCount']}", failures)
    assert_condition(result['jsHeapUsedBytes'] < 256 * 1024 * 1024, f"5,000-item JS heap exceeded 256MiB: {result['jsHeapUsedBytes']}", failures)
    assert_condition(result['overlayScrollHeight'] > result['overlayClientHeight'], '5,000-item board did not become scrollable', failures)
    assert_condition(not page_errors, f"page errors occurred: {page_errors[:3]}", failures)
    result['failures'] = failures
    page.close()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description='Run simulated high-volume regression tests for Liked Media Masonry')
    parser.add_argument('--json-output', type=Path)
    args = parser.parse_args()

    chromium = find_chromium()
    if not chromium:
        print('FAIL Chromium executable not found')
        return 1
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('FAIL Python Playwright is required')
        return 1

    version = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
    started = time.perf_counter()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chromium,
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-background-networking',
                '--js-flags=--expose-gc',
            ],
        )
        try:
            progressive = run_progressive_scenario(browser, version)
            scale = run_scale_scenario(browser, version)
        finally:
            browser.close()

    report = {
        'version': version,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'elapsedSeconds': round(time.perf_counter() - started, 3),
        'environment': {
            'chromium': chromium,
            'mode': 'headless synthetic DOM; not connected to X',
        },
        'progressiveScenario': progressive,
        'scaleScenario': scale,
    }
    failures = [
        *(f"progressive: {message}" for message in progressive['failures']),
        *(f"scale: {message}" for message in scale['failures']),
    ]
    report['passed'] = not failures
    report['failures'] = failures

    if args.json_output:
        output = args.json_output
        if not output.is_absolute():
            output = ROOT / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if failures:
        for failure in failures:
            print(f'FAIL {failure}', file=sys.stderr)
        return 1
    print('PASS simulated progressive stress scenario')
    print('PASS simulated 5,000-item scale scenario')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
