#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
TEST_CASES = [
    'normal-image',
    'multiple-images',
    'vertical-image',
    'quote-post',
    'video-thumbnail',
    'video-late-insertion',
    'duplicate-prevention',
    'settings-migration',
    'load-input',
    'keyboard-load-limit',
    'load-queue-handoff',
    'load-cancel-restore',
    'load-cancel-page-leave',
    'video-stale-event',
    'video-retention-limit',
    'video-retention-window',
    'video-watch-once',
    'video-direct-priority',
    'video-borrow-policy',
    'video-session-abort',
    'video-session-stale-event',
    'video-fallback-link',
    'video-borrow-restore',
    'ui-accessibility',
    'diagnostics-privacy',
    'diagnostics-runtime-filter',
    'media-key-index',
    'card-unload-batch',
    'architecture-modules',
]


def run(command: list[str], *, cwd: Path = ROOT, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        text=True,
        encoding='utf-8',
        errors='replace',
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def static_checks() -> list[str]:
    failures: list[str] = []
    manifest_path = ROOT / 'manifest.json'
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except Exception as error:
        return [f'manifest.json parse failed: {error}']

    if manifest.get('manifest_version') != 3:
        failures.append('manifest_version must be 3')
    if manifest.get('permissions') != ['storage']:
        failures.append(f'unexpected permissions: {manifest.get("permissions")}')
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    firefox_manifest = json.loads((ROOT / 'manifests/firefox.json').read_text(encoding='utf-8'))
    if manifest.get('version') != package.get('version'):
        failures.append('Chrome manifest and package versions differ')
    if firefox_manifest.get('version') != manifest.get('version'):
        failures.append('Chrome and Firefox manifest versions differ')
    gecko = firefox_manifest.get('browser_specific_settings', {}).get('gecko', {})
    if gecko.get('id') != '{6c4bffd1-76c7-4c99-ba48-367642193e15}':
        failures.append('unexpected Firefox Gecko ID')
    if gecko.get('update_url') != 'https://usisks.github.io/liked-media-masonry/firefox/updates.json':
        failures.append('unexpected Firefox update URL')
    if gecko.get('data_collection_permissions', {}).get('required') != ['none']:
        failures.append('Firefox data collection declaration must be ["none"]')

    referenced = []
    content_script_files = []
    content_style_files = []
    for script in manifest.get('content_scripts', []):
        content_script_files.extend(script.get('js', []))
        content_style_files.extend(script.get('css', []))
    referenced.extend(content_script_files)
    referenced.extend(content_style_files)
    action = manifest.get('action', {})
    if action.get('default_popup'):
        referenced.append(action['default_popup'])
    for icon_map in (manifest.get('icons', {}), action.get('default_icon', {})):
        referenced.extend(icon_map.values())
    for relative in referenced:
        if not (ROOT / relative).is_file():
            failures.append(f'manifest reference missing: {relative}')

    js_files = [*(ROOT / relative for relative in content_script_files), ROOT / 'popup.js', ROOT / 'tests/test-bootstrap.js', ROOT / 'tests/browser-tests.js']
    for path in js_files:
        result = run(['node', '--check', str(path)])
        if result.returncode != 0:
            failures.append(f'JavaScript syntax failed for {path.name}: {result.stderr.strip()}')

    production_files = [*content_script_files, *content_style_files, 'popup.js', 'popup.html', 'popup.css', 'manifest.json', 'README.md', 'PRIVACY.md']
    production_text = '\n'.join((ROOT / name).read_text(encoding='utf-8') for name in production_files)
    expected_setting_controls = {
        'card-width',
        'preview-transparency',
        'include-video',
        'close-position',
        'include-video-help',
        'rebuild-warning',
    }
    popup_html = (ROOT / 'popup.html').read_text(encoding='utf-8')
    actual_setting_controls = set(re.findall(
        r'id="([^"]+)"',
        popup_html[popup_html.find('<section class="settings"'):popup_html.find('</section>', popup_html.find('<section class="settings"'))],
    ))
    actual_setting_controls -= {'settings-title', 'card-width-value', 'preview-transparency-value', 'preview-transparency-help'}
    if actual_setting_controls != expected_setting_controls:
        failures.append(f'unexpected popup setting controls: {sorted(actual_setting_controls)}')

    production_js = '\n'.join((ROOT / name).read_text(encoding='utf-8') for name in [*content_script_files, 'popup.js'])
    if re.search(r'localStorage', production_js):
        failures.append('localStorage reference found in production JavaScript')
    for pattern in [r'\bfetch\s*\(', r'XMLHttpRequest', r'WebSocket', r'sendBeacon\s*\(']:
        if re.search(pattern, production_js):
            failures.append(f'external communication API found: {pattern}')

    content_text = '\n'.join((ROOT / name).read_text(encoding='utf-8') for name in content_script_files)
    for phase in ['idle', 'requesting', 'waiting_for_x', 'collecting', 'cooldown', 'failed']:
        if f"'{phase}'" not in content_text:
            failures.append(f'LoadController phase missing: {phase}')
    for required in ['createLoadController', 'new AbortController()', "getLoadController()?.cancel('board-closed')", 'restoreXPageScrollPosition']:
        if required not in content_text:
            failures.append(f'LoadController requirement missing: {required}')
    for obsolete in [
        'state.isLoadingMore',
        'state.loadTimer',
        'state.xLoadDriverTimer',
        'state.keyboardQueuedLoad',
        'scheduleQueuedKeyboardLoad',
        'clearXLoadDriver',
    ]:
        if obsolete in content_text:
            failures.append(f'obsolete loading state remains: {obsolete}')


    for required in [
        'VIDEO_RETAIN_LIMIT = 3',
        'videoWatchControllers: new WeakMap()',
        'new AbortController()',
        'isBorrowableVideoElement',
        'showLightboxVideoFallback',
        '${APP_ID}-lightbox-video-open-x',
    ]:
        if required not in content_text:
            failures.append(f'video stabilization requirement missing: {required}')
    for obsolete in ['videoPlaybackToken', 'while (state.retainedVideoElements.size > 24)', 'while (vault.children.length > 24)']:
        if obsolete in content_text:
            failures.append(f'obsolete video stabilization code remains: {obsolete}')

    for required in [
        '${APP_ID}-toast',
        'Xの表示に戻る',
        '${APP_ID}-lightbox-image-link',
        'aria-describedby',
        'restoreLightboxFocus',
    ]:
        if required not in content_text:
            failures.append(f'UI/accessibility requirement missing: {required}')
    if "setAttribute('aria-modal', 'true')" in content_text:
        failures.append('lightbox still claims modal semantics while background remains operable')
    for required in ['data-card-width="240"', 'data-card-width="300"', 'data-card-width="380"', 'rebuild-warning']:
        if required not in popup_html:
            failures.append(f'popup UI requirement missing: {required}')

    expected_content_scripts = [
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
    if content_script_files != expected_content_scripts:
        failures.append(f'unexpected content script order: {content_script_files}')
    if content_style_files != ['content.css']:
        failures.append(f'unexpected content stylesheet list: {content_style_files}')
    if (ROOT / 'content.js').exists():
        failures.append('legacy monolithic content.js remains')
    namespace_text = (ROOT / 'content/namespace.js').read_text(encoding='utf-8')
    main_text = (ROOT / 'content/main.js').read_text(encoding='utf-8')
    if "globalThis[NAMESPACE] =" not in namespace_text:
        failures.append('single shared namespace was not initialized')
    if 'style.textContent = `' in main_text:
        failures.append('injected CSS remains embedded in content/main.js')
    if 'html.xlg-hide-page-scrollbar' not in (ROOT / 'content.css').read_text(encoding='utf-8'):
        failures.append('content.css does not contain board styles')

    required_modules = ['dom', 'video', 'board', 'lightbox', 'loading', 'routing', 'main']
    for module_name in required_modules:
        if not (ROOT / f'content/{module_name}.js').is_file():
            failures.append(f'content module missing: {module_name}')
    if 'cardUnloadTimers' in content_text:
        failures.append('per-card unload timers remain')
    if 'cardUnloadQueue: new Map()' not in content_text or 'cardUnloadSweepTimer: 0' not in content_text:
        failures.append('batched card unload state missing')
    if re.search(r'\b(?:state\.items|items|mediaItems)\.find(?:Index)?\s*\(', content_text):
        failures.append('linear item lookup remains in content scripts')
    if 'buildMediaKey(tweetStatusId, mediaPath)' not in content_text:
        failures.append('unified media identity helper missing')
    content_css = (ROOT / 'content.css').read_text(encoding='utf-8')
    if 'placeholder-shimmer' in content_css or 'animation: xlg-placeholder' in content_css:
        failures.append('offscreen placeholder shimmer remains')
    if not (ROOT / 'docs/VIRTUAL_SCROLL_DESIGN.md').is_file():
        failures.append('virtual scroll design document missing')

    diagnostics_text = (ROOT / 'content/diagnostics.js').read_text(encoding='utf-8')
    routing_text = (ROOT / 'content/routing.js').read_text(encoding='utf-8')
    popup_js = (ROOT / 'popup.js').read_text(encoding='utf-8')
    for required in ['ERROR_DEFINITIONS', 'buildErrorContext', 'getMinimalEnvironment', 'recordRuntimeErrorEvent']:
        if required not in diagnostics_text:
            failures.append(f'diagnostics allowlist requirement missing: {required}')
    if 'browser: navigator.userAgent' in diagnostics_text or 'platform: navigator.platform' in diagnostics_text:
        failures.append('full browser or platform strings remain in content diagnostics')
    if 'browser: navigator.userAgent' in popup_js:
        failures.append('full browser string remains in popup fallback diagnostics')
    if "addEventListener('unhandledrejection'" in routing_text:
        failures.append('page-wide unhandledrejection listener remains')
    if "window.addEventListener('error', recordRuntimeErrorEvent)" not in routing_text:
        failures.append('runtime error listener is not restricted through diagnostics filter')
    privacy_text = (ROOT / 'PRIVACY.md').read_text(encoding='utf-8')
    if 'プライバシーポリシー草案' in privacy_text or 'この草案' in privacy_text:
        failures.append('privacy policy is still marked as a draft')
    if '完全なUser-Agent文字列' not in privacy_text or '自動送信は行いません' not in privacy_text:
        failures.append('published privacy policy does not describe diagnostic limits')

    release_docs = [
        'CHANGELOG.md',
        'CONTRIBUTING.md',
        'LICENSE',
        'SECURITY.md',
        'SUPPORT.md',
        'docs/CHROME_WEB_STORE_LISTING_JA.md',
        'docs/INSTALL.md',
        'docs/USAGE.md',
        'docs/ARCHITECTURE.md',
        'docs/DEVELOPMENT_HISTORY.md',
        'docs/TESTING.md',
        'docs/AUTOMATED_TEST_REPORT.md',
        'docs/KNOWN_LIMITATIONS.md',
        'docs/PERMISSIONS.md',
        'docs/RELEASE_PROCESS.md',
        'docs/RELEASE_CHECKLIST.md',
        'docs/MANUAL_X_TEST_MATRIX.md',
        'docs/PRIVACY_DISCLOSURE_GUIDE.md',
        'docs/STRESS_TEST_REPORT.md',
        'docs/FIREFOX_DISTRIBUTION.md',
        'docs/RELEASE_NOTES-v0.16.0.md',
    ]
    for relative in release_docs:
        if not (ROOT / relative).is_file():
            failures.append(f'release document missing: {relative}')
    for relative in ['tools/release_audit.py', 'tools/build_release.py', 'tools/update_manifest.py', 'tests/run_stress_tests.py']:
        path = ROOT / relative
        if not path.is_file():
            failures.append(f'release tool missing: {relative}')
        else:
            result = run([sys.executable, '-m', 'py_compile', str(path)])
            if result.returncode != 0:
                failures.append(f'Python syntax failed for {relative}: {result.stderr.strip()}')

    try:
        package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
        expected_scripts = {
            'test': 'python tests/run_tests.py',
            'test:stress': 'python tests/run_stress_tests.py',
            'test:all': 'npm test && npm run test:stress',
            'audit:release': 'python tools/release_audit.py --source .',
            'build': 'python tools/build_release.py --source . --browser all',
            'build:release': 'npm run build',
            'build:chrome': 'python tools/build_release.py --source . --browser chrome',
            'build:firefox': 'python tools/build_release.py --source . --browser firefox',
            'lint:firefox': 'web-ext lint --source-dir dist/firefox --self-hosted',
        }
        if package.get('version') != manifest.get('version'):
            failures.append('package version does not match manifest version')
        if package.get('scripts') != expected_scripts:
            failures.append(f'unexpected package scripts: {package.get("scripts")}')
    except Exception as error:
        failures.append(f'package.json parse failed: {error}')

    readme_text = (ROOT / 'README.md').read_text(encoding='utf-8')
    for required in [
        'XまたはPinterestの公式製品ではなく',
        'docs/INSTALL.md',
        'docs/USAGE.md',
        'docs/PERMISSIONS.md',
        'PRIVACY.md',
        'SECURITY.md',
    ]:
        if required not in readme_text:
            failures.append(f'release readiness README text missing: {required}')

    audit_result = run([sys.executable, 'tools/release_audit.py', '--source', '.'], timeout=60)
    if audit_result.returncode != 0:
        failures.append(f'release audit failed: {(audit_result.stdout + audit_result.stderr).strip()}')

    return failures


class TestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        pass

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == '/tester/likes':
            self.path = '/tests/test-page.html'
        super().do_GET()


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


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
    cache_root = Path.home() / '.cache/ms-playwright'
    for pattern in ('chromium-*/chrome-linux*/chrome', 'chromium-*/chrome-win*/chrome.exe'):
        for candidate in sorted(cache_root.glob(pattern), reverse=True):
            if candidate.is_file():
                return str(candidate)
    return None


def browser_checks() -> list[str]:
    chromium = find_chromium()
    if not chromium:
        return ['Chromium executable not found']

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return ['Python Playwright is required for browser fixture tests']

    fixture_by_case = {
        'normal-image': 'normal-image',
        'multiple-images': 'multiple-images',
        'vertical-image': 'vertical-image',
        'quote-post': 'quote-post',
        'video-thumbnail': 'video-thumbnail',
        'video-late-insertion': 'video-late-insertion',
        'duplicate-prevention': 'normal-image',
        'settings-migration': 'empty',
        'load-input': 'normal-image',
        'keyboard-load-limit': 'normal-image',
        'load-queue-handoff': 'normal-image',
        'load-cancel-restore': 'normal-image',
        'load-cancel-page-leave': 'normal-image',
        'video-stale-event': 'empty',
        'video-retention-limit': 'empty',
        'video-retention-window': 'empty',
        'video-watch-once': 'empty',
        'video-direct-priority': 'empty',
        'video-borrow-policy': 'empty',
        'video-session-abort': 'empty',
        'video-session-stale-event': 'empty',
        'video-fallback-link': 'empty',
        'video-borrow-restore': 'empty',
        'ui-accessibility': 'normal-image',
        'diagnostics-privacy': 'normal-image',
        'diagnostics-runtime-filter': 'normal-image',
        'media-key-index': 'normal-image',
        'card-unload-batch': 'multiple-images',
        'architecture-modules': 'normal-image',
    }

    failures: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chromium,
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
        )
        try:
            for case_name in TEST_CASES:
                page = browser.new_page()
                page.route(re.compile(r'https://(?:pbs|video)\.twimg\.com/.*'), lambda route: route.abort())
                try:
                    fixture_name = fixture_by_case[case_name]
                    fixture_html = (ROOT / 'tests/fixtures' / f'{fixture_name}.html').read_text(encoding='utf-8')
                    page.set_content(
                        f'<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>'
                        f'<div id="fixture-root">{fixture_html}</div>'
                        f'<pre id="test-result" data-status="running">running</pre>'
                        f'</body></html>',
                        wait_until='domcontentloaded',
                    )

                    current_key = 'liked-media-masonry-settings-v2'
                    legacy_key = 'x-likes-pinterest-viewer-settings-v1'
                    storage_data: dict[str, object] = {}
                    if case_name in {'video-thumbnail', 'video-late-insertion', 'video-stale-event', 'video-retention-limit', 'video-retention-window', 'video-watch-once', 'video-direct-priority', 'video-borrow-policy', 'video-session-abort', 'video-session-stale-event', 'video-fallback-link', 'video-borrow-restore'}:
                        storage_data[current_key] = {
                            'cardWidth': 300,
                            'includeVideo': True,
                            'closePositionBehavior': 'keep_scrolled_position',
                            'previewTransparency': 0,
                        }
                    elif case_name == 'settings-migration':
                        storage_data[legacy_key] = {
                            'cardWidth': 420,
                            'includeVideo': True,
                            'lightboxCloseBehavior': 'restore',
                            'previewTransparency': 35,
                            'obsoleteFilterSetting': True,
                            'hideNavigationArrows': True,
                        }

                    page.evaluate(
                        """({ caseName, storageData }) => {
                          const clone = (value) => JSON.parse(JSON.stringify(value));
                          const getStorageResult = (keys) => {
                            if (keys == null) return clone(storageData);
                            const list = Array.isArray(keys) ? keys : [keys];
                            return Object.fromEntries(list.filter((key) => key in storageData).map((key) => [key, clone(storageData[key])]));
                          };
                          globalThis.__LMM_TEST_MODE__ = true;
                          globalThis.__LMM_TEST_ORIGIN__ = 'https://x.com';
                          globalThis.__LMM_TEST_CASE__ = caseName;
                          globalThis.__mockStorage = storageData;
                          globalThis.chrome = {
                            storage: {
                              local: {
                                get: async (keys) => getStorageResult(keys),
                                set: async (values) => {
                                  for (const [key, value] of Object.entries(values || {})) storageData[key] = clone(value);
                                },
                                remove: async (keys) => {
                                  for (const key of Array.isArray(keys) ? keys : [keys]) delete storageData[key];
                                },
                              },
                            },
                            runtime: {
                              id: 'lmm-test-extension',
                              getManifest: () => ({ version: '0.16.0' }),
                              onMessage: { addListener: () => {} },
                            },
                          };
                        }""",
                        {'caseName': case_name, 'storageData': storage_data},
                    )

                    if case_name == 'vertical-image':
                        page.evaluate(
                            """() => {
                              const image = document.getElementById('vertical-fixture-image');
                              Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 800 });
                              Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1600 });
                            }"""
                        )

                    page.add_style_tag(path=str(ROOT / 'content.css'))
                    for relative in [
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
                    ]:
                        page.add_script_tag(path=str(ROOT / relative))
                    page.add_script_tag(path=str(ROOT / 'tests/browser-tests.js'))
                    page.wait_for_function(
                        "document.getElementById('test-result')?.dataset.status !== 'running'",
                        timeout=5000,
                    )
                    status = page.locator('#test-result').get_attribute('data-status')
                    detail = page.locator('#test-result').inner_text()
                    if status != 'passed':
                        failures.append(f'{case_name}: {detail[:800]}')
                    else:
                        print(f'PASS browser: {case_name}')
                except Exception as error:
                    detail = ''
                    try:
                        detail = page.locator('#test-result').inner_text(timeout=500)
                    except Exception:
                        pass
                    failures.append(f'{case_name}: {detail or error}')
                finally:
                    page.close()
        finally:
            browser.close()
    return failures


def popup_ui_checks() -> list[str]:
    chromium = find_chromium()
    if not chromium:
        return ['Chromium executable not found']
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return ['Python Playwright is required for popup UI tests']

    failures: list[str] = []
    popup_html = (ROOT / 'popup.html').read_text(encoding='utf-8')
    body_match = re.search(r'<body>(.*)</body>', popup_html, re.S)
    if not body_match:
        return ['popup.html body not found']
    popup_body = re.sub(r'<script[^>]*src="popup\.js"[^>]*></script>', '', body_match.group(1))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chromium,
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
        )
        page = browser.new_page()
        try:
            page.set_content(
                f'<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>{popup_body}</body></html>',
                wait_until='domcontentloaded',
            )
            page.evaluate(
                """() => {
                  const storage = {
                    'liked-media-masonry-settings-v2': {
                      cardWidth: 300,
                      includeVideo: false,
                      closePositionBehavior: 'keep_scrolled_position',
                      previewTransparency: 0,
                    },
                  };
                  globalThis.__popupMessages = [];
                  const clone = (value) => JSON.parse(JSON.stringify(value));
                  globalThis.chrome = {
                    storage: {
                      local: {
                        get: async (key) => ({ [key]: clone(storage[key]) }),
                        set: async (values) => Object.assign(storage, clone(values)),
                      },
                    },
                    tabs: {
                      query: async () => [{ id: 1 }],
                      sendMessage: async (_tabId, message) => {
                        globalThis.__popupMessages.push(clone(message));
                        if (message.type === 'get-state') {
                          return { ok: true, isLikesPage: true, boardOpen: false, itemCount: 3, settings: clone(storage['liked-media-masonry-settings-v2']) };
                        }
                        if (message.type === 'apply-settings') {
                          storage['liked-media-masonry-settings-v2'] = clone(message.settings);
                          return { ok: true, isLikesPage: true, boardOpen: false, itemCount: 3, settings: clone(message.settings) };
                        }
                        return { ok: true, isLikesPage: true, boardOpen: false, itemCount: 3, settings: clone(storage['liked-media-masonry-settings-v2']) };
                      },
                    },
                    runtime: { getManifest: () => ({ version: '0.16.0' }) },
                  };
                }"""
            )
            page.add_script_tag(path=str(ROOT / 'popup.js'))
            page.wait_for_function("document.querySelector('[data-card-width=\"300\"]')?.getAttribute('aria-pressed') === 'true'", timeout=3000)
            warning = page.locator('#rebuild-warning').inner_text()
            if '現在' not in warning or '作り直' not in warning:
                failures.append('popup rebuild warning does not explain that current results will be rebuilt')
            page.locator('[data-card-width="240"]').click()
            page.wait_for_function("document.querySelector('[data-card-width=\"240\"]')?.getAttribute('aria-pressed') === 'true'", timeout=3000)
            width_value = page.locator('#card-width').input_value()
            if width_value != '240':
                failures.append(f'card width preset did not update detailed slider: {width_value}')
            applied = page.evaluate("globalThis.__popupMessages.filter((entry) => entry.type === 'apply-settings').at(-1)")
            if not applied or applied.get('settings', {}).get('cardWidth') != 240:
                failures.append(f'card width preset did not send 240px setting: {applied}')
            if not failures:
                print('PASS browser: popup-card-width-presets')
        except Exception as error:
            failures.append(f'popup-card-width-presets: {error}')
        finally:
            page.close()
            browser.close()
    return failures


def main() -> int:
    failures = static_checks()
    if failures:
        print('Static checks failed:')
        for failure in failures:
            print(f'- {failure}')
        return 1
    print('PASS static checks')

    failures = browser_checks()
    if failures:
        print('Browser fixture tests failed:')
        for failure in failures:
            print(f'- {failure}')
        return 1

    failures = popup_ui_checks()
    if failures:
        print('Popup UI tests failed:')
        for failure in failures:
            print(f'- {failure}')
        return 1

    print(f'PASS all tests: {len(TEST_CASES)} content cases + 1 popup case')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
