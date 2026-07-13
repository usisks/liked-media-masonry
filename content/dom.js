(() => {
  'use strict';

  const app = globalThis.__LIKED_MEDIA_MASONRY__;
  if (!app) throw new Error('Liked Media Masonry namespace is not initialized.');

  const { extensionApi, state } = app;
  const {
    APP_ID, TEST_MODE, LOAD_COOLDOWN_MS, LOAD_MAX_WAIT_MS, LIGHTBOX_LOAD_AHEAD_COUNT, LIGHTBOX_IMAGE_PRELOAD_COUNT, SCAN_DEBOUNCE_MS, CARD_VIRTUAL_ROOT_MARGIN_PX, CARD_UNLOAD_DELAY_MS, TIMELINE_OBSERVER_RETRY_MS, GRID_GAP_PX, BOARD_END_THRESHOLD_PX, BOARD_END_LOAD_COOLDOWN_MS, USER_SCROLL_INTENT_MS, PROGRAMMATIC_SCROLL_SUPPRESS_MS, ROUTE_FALLBACK_CHECK_MS, ROUTE_CHANGE_DEBOUNCE_MS, AUTO_LOAD_EMPTY_STREAK_THRESHOLD, AUTO_LOAD_BACKOFF_BASE_MS, AUTO_LOAD_BACKOFF_MAX_MS, LIGHTBOX_TRANSITION_MS, REBUILD_SCROLL_WAIT_MS, KEYBOARD_SCROLL_LINE_STEP_PX, KEYBOARD_SCROLL_LINE_SPEED_PX_PER_SEC, KEYBOARD_SCROLL_PAGE_SPEED_PX_PER_SEC, KEYBOARD_HOLD_AUTO_LOAD_LIMIT, KEYBOARD_BOARD_END_THRESHOLD_PX, VIDEO_SOURCE_PROBE_DELAYS_MS, VIDEO_RETAIN_LIMIT, VIDEO_DIRECT_READY_TIMEOUT_MS, VIDEO_BORROW_READY_TIMEOUT_MS, PREVIEW_TRANSPARENCY_DEFAULT, KEYBOARD_LOAD_RETRY_MS, LOAD_QUEUED_REQUEST_DELAY_MS, LOAD_RESULT_DISPLAY_MS, X_LOAD_DRIVER_INTERVAL_MS, X_LOAD_BOUNCE_MIN_PX, X_LOAD_BOUNCE_MAX_PX, TOAST_RESULT_DISPLAY_MS, TOAST_ERROR_DISPLAY_MS
  } = app.config;
  const { clamp, getPageOrigin } = app.helpers;
  const { loadSettings, saveSettings } = app.settingsApi;
  const { sanitizeDiagnosticText, recordError, getDiagnostics } = app.diagnosticsApi;
  app.modules ||= {};
  app.modules.dom ||= {};

  function appendNewItemsToLayout(...args) { return app.modules.board.appendNewItemsToLayout(...args); }
  function clearVideoSourceProbe(...args) { return app.modules.video.clearVideoSourceProbe(...args); }
  function createCard(...args) { return app.modules.board.createCard(...args); }
  function delay(...args) { return app.modules.routing.delay(...args); }
  function extractVideoMediaId(...args) { return app.modules.video.extractVideoMediaId(...args); }
  function getVideoSource(...args) { return app.modules.video.getVideoSource(...args); }
  function isLikelyGif(...args) { return app.modules.video.isLikelyGif(...args); }
  function preserveRemovedVideos(...args) { return app.modules.video.preserveRemovedVideos(...args); }
  function reconcileLightboxAfterItemsChange(...args) { return app.modules.lightbox.reconcileLightboxAfterItemsChange(...args); }
  function refreshLightboxChrome(...args) { return app.modules.lightbox.refreshLightboxChrome(...args); }
  function refreshVideoItemSource(...args) { return app.modules.video.refreshVideoItemSource(...args); }
  function scheduleVideoSourceProbe(...args) { return app.modules.video.scheduleVideoSourceProbe(...args); }
  function updateCount(...args) { return app.modules.board.updateCount(...args); }
  function watchVideoSource(...args) { return app.modules.video.watchVideoSource(...args); }

  function isLikesPage() {
    if (globalThis.__LMM_TEST_MODE__ === true) return true;
    return /^\/[^/]+\/likes\/?$/.test(location.pathname);
  }

  function getRouteKey() {
    const match = location.pathname.match(/^\/([^/]+)\/likes\/?$/);
    return match ? match[1].toLowerCase() : '';
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scheduleScan(delay = SCAN_DEBOUNCE_MS) {
    window.clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(scanTweets, delay);
  }

  function scanTweets(root = state.observerRoot || document) {
    if (!isLikesPage() || state.rebuildFromBeginningInProgress) return 0;

    const articles = [];
    if (root instanceof HTMLElement && root.matches('article[data-testid="tweet"], article')) {
      articles.push(root);
    }
    for (const article of root.querySelectorAll?.('article[data-testid="tweet"], article') || []) {
      if (article instanceof HTMLElement) articles.push(article);
    }
    return processArticles(articles);
  }

  function processArticles(articles) {
    let added = 0;
    for (const article of articles) {
      if (!(article instanceof HTMLElement) || !article.isConnected) continue;
      added += extractItemsFromTweet(article);
    }

    if (added > 0) {
      updateCount();
      appendNewItemsToLayout();
      reconcileLightboxAfterItemsChange();
    } else {
      updateCount();
      refreshLightboxChrome();
    }
    return added;
  }

  function queueArticlesFromMutations(records) {
    if (state.rebuildFromBeginningInProgress) return;

    const queueArticle = (article) => {
      if (article instanceof HTMLElement && article.matches('article[data-testid="tweet"], article')) {
        state.pendingArticles.add(article);
      }
    };

    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.removedNodes) {
          if (node instanceof HTMLElement) preserveRemovedVideos(node);
        }

        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          queueArticle(node);
          queueArticle(node.closest('article[data-testid="tweet"], article'));
          for (const article of node.querySelectorAll('article[data-testid="tweet"], article')) {
            queueArticle(article);
          }
        }
      } else if (record.type === 'attributes') {
        const target = record.target;
        if (target instanceof HTMLElement && target.matches('video, source, img')) {
          queueArticle(target.closest('article[data-testid="tweet"], article'));
        }
      }
    }

    if (!state.pendingArticles.size) return;
    window.clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(() => {
      const articles = Array.from(state.pendingArticles);
      state.pendingArticles.clear();
      processArticles(articles);
    }, SCAN_DEBOUNCE_MS);
  }

  function extractItemsFromTweet(article) {
    const tweetUrl = getTweetUrl(article);
    const tweetStatusId = extractTweetStatusId(tweetUrl);
    if (!tweetUrl || !tweetStatusId) return 0;

    const author = normalizeText(
      article.querySelector('[data-testid="User-Name"]')?.textContent || '',
    );
    const tweetText = normalizeText(
      article.querySelector('[data-testid="tweetText"]')?.textContent || '',
    );
    const timeElement = article.querySelector('time');
    const dateText = timeElement?.getAttribute('datetime') || timeElement?.textContent || '';
    let added = 0;
    const mediaByPath = new Map();

    const addCandidate = (node, src, kind, sourceVideo = null) => {
      const mediaPath = canonicalMediaPath(src);
      if (!mediaPath) return;
      const existing = mediaByPath.get(mediaPath);
      if (existing) {
        if (!existing.sourceVideo && sourceVideo instanceof HTMLVideoElement) {
          existing.sourceVideo = sourceVideo;
          existing.node = sourceVideo;
        }
        return;
      }
      mediaByPath.set(mediaPath, { node, src, kind, sourceVideo, mediaPath });
    };

    for (const image of article.querySelectorAll('img')) {
      const src = pickBestImageSource(image);
      const kind = classifyMediaUrl(src);
      if (kind === 'image') {
        addCandidate(image, src, kind);
      } else if (kind === 'video' && state.settings.includeVideo) {
        const mediaPath = canonicalMediaPath(src);
        const sourceVideo = Array.from(article.querySelectorAll('video')).find((video) => (
          canonicalMediaPath(video.getAttribute('poster') || '') === mediaPath
        )) || null;
        addCandidate(image, src, kind, sourceVideo);
      }
    }

    if (state.settings.includeVideo) {
      for (const video of article.querySelectorAll('video')) {
        const poster = video.getAttribute('poster') || '';
        if (classifyMediaUrl(poster) === 'video') {
          addCandidate(video, poster, 'video', video);
        }
      }
    }

    Array.from(mediaByPath.values()).forEach((media) => {
      const displayUrl = media.kind === 'image'
        ? setXImageQuality(media.src, 'large')
        : media.src;
      const originalUrl = media.kind === 'image'
        ? setXImageQuality(media.src, 'orig')
        : media.src;
      const key = buildMediaKey(tweetStatusId, media.mediaPath);

      const sourceVideo = media.sourceVideo instanceof HTMLVideoElement
        ? media.sourceVideo
        : null;
      const existingItem = state.itemMap.get(key);
      if (existingItem) {
        if (sourceVideo instanceof HTMLVideoElement) {
          refreshVideoItemSource(existingItem, sourceVideo);
          watchVideoSource(existingItem, sourceVideo);
          clearVideoSourceProbe(existingItem.key);
        } else if (existingItem.kind === 'video') {
          scheduleVideoSourceProbe(existingItem);
        }
        return;
      }
      if (state.seen.has(key)) return;

      const ratio = getMediaRatio(media.node, media.kind);
      const item = {
        key,
        kind: media.kind,
        displayUrl,
        originalUrl,
        tweetUrl,
        tweetStatusId,
        mediaPath: media.mediaPath,
        videoMediaId: media.kind === 'video' ? extractVideoMediaId(media.mediaPath) : '',
        author,
        tweetText,
        dateText,
        ratio: clamp(Number(ratio) || (media.kind === 'video' ? 16 / 9 : 1), 0.08, 12),
        videoSrc: sourceVideo ? getVideoSource(sourceVideo) : '',
        isGif: sourceVideo ? isLikelyGif(sourceVideo) : false,
        sourceVideoRef: sourceVideo && typeof WeakRef === 'function'
          ? new WeakRef(sourceVideo)
          : null,
        order: state.items.length,
        card: null,
        hydrated: false,
        measuredHeight: 0,
        measuredWidth: 0,
      };

      if (sourceVideo instanceof HTMLVideoElement) watchVideoSource(item, sourceVideo);
      state.seen.add(key);
      item.card = createCard(item);
      state.items.push(item);
      registerItemIndexes(item);
      if (item.kind === 'video' && !(sourceVideo instanceof HTMLVideoElement)) {
        scheduleVideoSourceProbe(item);
      }
      added += 1;
    });

    return added;
  }

  function getTweetUrl(article) {
    const timeLink = article.querySelector('time')?.closest('a[href*="/status/"]');
    const links = [
      timeLink,
      ...article.querySelectorAll('a[href*="/status/"]'),
    ].filter((link, index, candidates) => link && candidates.indexOf(link) === index);

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      try {
        const url = new URL(href, getPageOrigin());
        const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
        if (match) return `${getPageOrigin()}/${match[1]}/status/${match[2]}`;
      } catch {
        // 不正なURLは無視する。
      }
    }
    return '';
  }


  function extractTweetStatusId(value) {
    const match = String(value || '').match(/\/status\/(\d+)/);
    return match?.[1] || '';
  }

  function buildMediaKey(tweetStatusId, mediaPath) {
    const statusId = String(tweetStatusId || '').trim();
    const canonicalPath = String(mediaPath || '').trim();
    return statusId && canonicalPath ? `${statusId}|${canonicalPath}` : '';
  }

  function registerItemIndexes(item) {
    if (!item?.key) return;
    state.itemMap.set(item.key, item);
    state.itemIndexMap.set(item.key, Number(item.order) || 0);
    if (item.mediaPath) {
      let keys = state.mediaPathIndex.get(item.mediaPath);
      if (!keys) {
        keys = new Set();
        state.mediaPathIndex.set(item.mediaPath, keys);
      }
      keys.add(item.key);
    }
  }

  function unregisterItemIndexes(item) {
    if (!item?.key) return;
    state.itemMap.delete(item.key);
    state.itemIndexMap.delete(item.key);
    if (item.mediaPath) {
      const keys = state.mediaPathIndex.get(item.mediaPath);
      keys?.delete(item.key);
      if (keys && !keys.size) state.mediaPathIndex.delete(item.mediaPath);
    }
  }

  function reindexItemPositions(startIndex = 0) {
    const start = Math.max(0, Number(startIndex) || 0);
    for (let index = start; index < state.items.length; index += 1) {
      const item = state.items[index];
      item.order = index;
      state.itemIndexMap.set(item.key, index);
      if (item.card instanceof HTMLElement) item.card.dataset.order = String(index);
    }
  }

  function getItemIndex(itemKey) {
    const index = state.itemIndexMap.get(itemKey);
    return Number.isInteger(index) ? index : -1;
  }

  function getItemsByMediaPath(mediaPath) {
    const keys = state.mediaPathIndex.get(mediaPath);
    if (!keys) return [];
    return Array.from(keys, (key) => state.itemMap.get(key)).filter(Boolean);
  }

  function pickBestImageSource(image) {
    const srcset = image.getAttribute('srcset');
    if (srcset) {
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return image.currentSrc || image.src || '';
  }

  function classifyMediaUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, getPageOrigin());
      if (url.hostname !== 'pbs.twimg.com') return '';
      if (/^\/media\//.test(url.pathname)) return 'image';
      if (/(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)/.test(url.pathname)) {
        return 'video';
      }
    } catch {
      return '';
    }
    return '';
  }

  function canonicalMediaPath(rawUrl) {
    try {
      const url = new URL(rawUrl, getPageOrigin());
      const format = url.searchParams.get('format') || '';
      return `${url.hostname}${url.pathname}|${format}`;
    } catch {
      return '';
    }
  }

  function setXImageQuality(rawUrl, quality) {
    try {
      const url = new URL(rawUrl, getPageOrigin());
      url.searchParams.set('name', quality);
      return url.href;
    } catch {
      return rawUrl;
    }
  }

  function getMediaRatio(node, kind = 'image') {
    const naturalWidth = Number(node.naturalWidth || node.videoWidth || 0);
    const naturalHeight = Number(node.naturalHeight || node.videoHeight || 0);
    if (naturalWidth > 0 && naturalHeight > 0) return naturalWidth / naturalHeight;

    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect.width / rect.height;
    return kind === 'video' ? 16 / 9 : 1;
  }

  function normalizeText(text) {
    return String(text || '').replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try {
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
    } catch {
      return value;
    }
  }

  Object.assign(app.modules.dom, {
    isLikesPage,
    getRouteKey,
    el,
    scheduleScan,
    scanTweets,
    processArticles,
    queueArticlesFromMutations,
    extractItemsFromTweet,
    getTweetUrl,
    extractTweetStatusId,
    buildMediaKey,
    registerItemIndexes,
    unregisterItemIndexes,
    reindexItemPositions,
    getItemIndex,
    getItemsByMediaPath,
    pickBestImageSource,
    classifyMediaUrl,
    canonicalMediaPath,
    setXImageQuality,
    getMediaRatio,
    normalizeText,
    formatDate,
  });
})();
