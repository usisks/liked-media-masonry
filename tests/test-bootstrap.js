(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const caseName = params.get('case') || 'normal-image';
  const fixtureByCase = {
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
  };

  const currentKey = 'liked-media-masonry-settings-v2';
  const legacyKey = 'x-likes-pinterest-viewer-settings-v1';
  const storageData = {};

  if (['video-thumbnail', 'video-late-insertion', 'video-stale-event', 'video-retention-limit', 'video-retention-window', 'video-watch-once', 'video-direct-priority', 'video-borrow-policy', 'video-session-abort', 'video-session-stale-event', 'video-fallback-link', 'video-borrow-restore'].includes(caseName)) {
    storageData[currentKey] = {
      cardWidth: 300,
      includeVideo: true,
      closePositionBehavior: 'keep_scrolled_position',
      previewTransparency: 0,
    };
  } else if (caseName === 'settings-migration') {
    storageData[legacyKey] = {
      cardWidth: 420,
      includeVideo: true,
      lightboxCloseBehavior: 'restore',
      previewTransparency: 35,
      obsoleteFilterSetting: true,
      hideNavigationArrows: true,
    };
  }

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
      getManifest: () => ({ version: '0.14.4' }),
      onMessage: { addListener: () => {} },
    },
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  (async () => {
    const fixtureName = fixtureByCase[caseName];
    if (!fixtureName) throw new Error(`Unknown test case: ${caseName}`);
    const fixtureHtml = await fetch(new URL(`fixtures/${fixtureName}.html`, location.href)).then((response) => response.text());
    document.getElementById('fixture-root').innerHTML = fixtureHtml;

    if (caseName === 'vertical-image') {
      const image = document.getElementById('vertical-fixture-image');
      Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 800 });
      Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1600 });
    }

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('../content.css', location.href).href;
    document.head.appendChild(stylesheet);

    for (const relativePath of [
      '../content/namespace.js',
      '../content/settings.js',
      '../content/diagnostics.js',
      '../content/dom.js',
      '../content/video.js',
      '../content/board.js',
      '../content/lightbox.js',
      '../content/loading.js',
      '../content/routing.js',
      '../content/main.js',
    ]) {
      await loadScript(new URL(relativePath, location.href).href);
    }
    await loadScript(new URL('browser-tests.js', location.href).href);
  })().catch((error) => {
    const result = document.getElementById('test-result');
    result.dataset.status = 'failed';
    result.textContent = error?.stack || String(error);
  });
})();
