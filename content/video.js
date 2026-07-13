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
  app.modules.video ||= {};

  function canonicalMediaPath(...args) { return app.modules.dom.canonicalMediaPath(...args); }
  function buildMediaKey(...args) { return app.modules.dom.buildMediaKey(...args); }
  function extractTweetStatusId(...args) { return app.modules.dom.extractTweetStatusId(...args); }
  function getTweetUrl(...args) { return app.modules.dom.getTweetUrl(...args); }
  function getItemIndex(...args) { return app.modules.dom.getItemIndex(...args); }
  function getItemsByMediaPath(...args) { return app.modules.dom.getItemsByMediaPath(...args); }
  function getViewerItems(...args) { return app.modules.board.getViewerItems(...args); }
  function scanTweets(...args) { return app.modules.dom.scanTweets(...args); }
  function setLightboxImageLink(...args) { return app.modules.lightbox.setLightboxImageLink(...args); }

  function getCurrentVideoDiagnostics() {
    const item = state.itemMap.get(state.lightboxItemKey);
    if (!item || item.kind !== 'video') return null;
    const source = state.retainedVideoElements.get(item.key) || item.sourceVideoRef?.deref?.();
    const lightboxVideo = document.getElementById(`${APP_ID}-lightbox-video`);
    return {
      playbackMode: state.activeVideoPlaybackMode,
      hasConnectedSourceElement: source instanceof HTMLVideoElement && source.isConnected,
      sourceElementUsable: hasUsableVideoSource(source) || hasBorrowableVideoSource(source),
      sourceReadyState: source instanceof HTMLVideoElement ? source.readyState : -1,
      sourceNetworkState: source instanceof HTMLVideoElement ? source.networkState : -1,
      sourceHasUrl: source instanceof HTMLVideoElement ? Boolean(getVideoSource(source)) : false,
      sourceCanBeBorrowed: hasBorrowableVideoSource(source),
      reusableResourceCount: collectLoadedVideoUrls(item, source).length,
      lightboxReadyState: lightboxVideo instanceof HTMLVideoElement ? lightboxVideo.readyState : -1,
      lightboxNetworkState: lightboxVideo instanceof HTMLVideoElement ? lightboxVideo.networkState : -1,
      lightboxDuration: lightboxVideo instanceof HTMLVideoElement && Number.isFinite(lightboxVideo.duration)
        ? lightboxVideo.duration
        : null,
      lightboxMediaErrorCode: lightboxVideo instanceof HTMLVideoElement ? lightboxVideo.error?.code || 0 : 0,
    };
  }

  function ensureVideoVault() {
    if (state.videoVault?.isConnected) return state.videoVault;
    const vault = document.createElement('div');
    vault.id = `${APP_ID}-video-vault`;
    vault.setAttribute('aria-hidden', 'true');
    document.body.appendChild(vault);
    state.videoVault = vault;
    return vault;
  }

  function clearVideoSourceProbe(itemKey) {
    const timer = state.videoProbeTimers.get(itemKey);
    if (timer) window.clearTimeout(timer);
    state.videoProbeTimers.delete(itemKey);
  }

  function clearAllVideoSourceProbes() {
    for (const timer of state.videoProbeTimers.values()) window.clearTimeout(timer);
    state.videoProbeTimers.clear();
  }

  function unwatchVideoSource(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const record = state.videoWatchControllers.get(video);
    if (!record) return;
    record.abortController.abort();
    state.videoWatchAbortControllers.delete(record.abortController);
    state.videoWatchControllers.delete(video);
  }

  function clearAllVideoWatchers() {
    for (const controller of state.videoWatchAbortControllers) controller.abort();
    state.videoWatchAbortControllers.clear();
    state.videoWatchControllers = new WeakMap();
  }

  function releaseRetainedVideoElement(itemKey, expectedVideo = null) {
    const retained = state.retainedVideoElements.get(itemKey);
    if (!(retained instanceof HTMLVideoElement)) return false;
    if (expectedVideo instanceof HTMLVideoElement && retained !== expectedVideo) return false;
    state.retainedVideoElements.delete(itemKey);
    state.videoElementItemKeys.delete(retained);
    if (retained.dataset.xlgVaulted === '1') {
      try { retained.pause(); } catch {}
      retained.removeAttribute('data-xlg-vaulted');
      retained.removeAttribute('data-xlg-lightbox-source');
      retained.srcObject = null;
      retained.removeAttribute('src');
      try { retained.load(); } catch {}
      retained.remove();
    }
    return true;
  }

  function getPreferredVideoRetentionKeys() {
    if (state.lightboxIndex < 0 || !state.lightboxItemKey) return [];
    const items = getViewerItems();
    const indexedPosition = getItemIndex(state.lightboxItemKey);
    const currentIndex = indexedPosition >= 0
      ? indexedPosition
      : items[state.lightboxIndex]?.key === state.lightboxItemKey
        ? state.lightboxIndex
        : -1;
    if (currentIndex < 0) return [];

    const keys = [];
    const addAt = (index) => {
      const item = items[index];
      if (item?.kind === 'video' && !keys.includes(item.key)) keys.push(item.key);
    };
    addAt(currentIndex);
    for (let distance = 1; keys.length < VIDEO_RETAIN_LIMIT && distance < items.length; distance += 1) {
      addAt(currentIndex - distance);
      if (keys.length < VIDEO_RETAIN_LIMIT) addAt(currentIndex + distance);
    }
    return keys.slice(0, VIDEO_RETAIN_LIMIT);
  }

  function trimVideoVault() {
    const vault = state.videoVault;
    if (!(vault instanceof HTMLElement)) return;
    for (const child of Array.from(vault.children)) {
      if (!(child instanceof HTMLVideoElement)) {
        child.remove();
        continue;
      }
      const retainedKey = state.videoElementItemKeys.get(child) || '';
      if (!retainedKey) {
        try { child.pause(); } catch {}
        child.srcObject = null;
        child.removeAttribute('src');
        try { child.load(); } catch {}
        child.remove();
      }
    }
    while (vault.querySelectorAll('video').length > VIDEO_RETAIN_LIMIT) {
      const oldest = vault.querySelector('video');
      if (!(oldest instanceof HTMLVideoElement)) break;
      const retainedKey = state.videoElementItemKeys.get(oldest) || '';
      if (retainedKey) state.retainedVideoElements.delete(retainedKey);
      state.videoElementItemKeys.delete(oldest);
      try { oldest.pause(); } catch {}
      oldest.srcObject = null;
      oldest.removeAttribute('src');
      try { oldest.load(); } catch {}
      oldest.remove();
    }
    if (!vault.children.length) {
      vault.remove();
      state.videoVault = null;
    }
  }

  function refreshVideoRetentionWindow() {
    const preferredKeys = getPreferredVideoRetentionKeys();
    if (preferredKeys.length) {
      const preferred = new Set(preferredKeys);
      for (const key of preferredKeys) {
        if (state.retainedVideoElements.has(key)) continue;
        const item = state.itemMap.get(key);
        const video = item?.sourceVideoRef?.deref?.();
        if (hasBorrowableVideoSource(video)) state.retainedVideoElements.set(key, video);
      }
      for (const [key, video] of Array.from(state.retainedVideoElements.entries())) {
        if (!preferred.has(key) && state.activeVideoSession?.source !== video) {
          releaseRetainedVideoElement(key, video);
        }
      }
    } else {
      while (state.retainedVideoElements.size > VIDEO_RETAIN_LIMIT) {
        const [oldestKey, oldestVideo] = state.retainedVideoElements.entries().next().value || [];
        if (!oldestKey) break;
        releaseRetainedVideoElement(oldestKey, oldestVideo);
      }
    }
    trimVideoVault();
  }

  function clearVideoRetentionState() {
    clearAllVideoWatchers();
    for (const [key, video] of Array.from(state.retainedVideoElements.entries())) {
      releaseRetainedVideoElement(key, video);
    }
    state.retainedVideoElements.clear();
    if (state.videoVault instanceof HTMLElement) {
      for (const video of state.videoVault.querySelectorAll('video')) {
        try { video.pause(); } catch {}
        video.srcObject = null;
        video.removeAttribute('src');
        try { video.load(); } catch {}
      }
      state.videoVault.remove();
    }
    state.videoVault = null;
  }

  function scheduleVideoSourceProbe(item) {
    if (!item || item.kind !== 'video') return;
    const retained = state.retainedVideoElements.get(item.key) || item.sourceVideoRef?.deref?.();
    const hasReusableUrl = Boolean(item.videoSrc && isReusableVideoUrl(item.videoSrc));
    if (hasUsableVideoSource(retained) || hasBorrowableVideoSource(retained) || hasReusableUrl) {
      clearVideoSourceProbe(item.key);
      return;
    }
    clearVideoSourceProbe(item.key);
    let attemptIndex = 0;
    const run = () => {
      state.videoProbeTimers.delete(item.key);
      if (!state.itemMap.has(item.key) || !state.settings.includeVideo) return;
      const source = findSourceVideoForItem(item);
      if (source instanceof HTMLVideoElement) {
        refreshVideoItemSource(item, source);
        watchVideoSource(item, source);
        return;
      }
      if (attemptIndex >= VIDEO_SOURCE_PROBE_DELAYS_MS.length) return;
      const delayMs = VIDEO_SOURCE_PROBE_DELAYS_MS[attemptIndex];
      attemptIndex += 1;
      const timer = window.setTimeout(run, delayMs);
      state.videoProbeTimers.set(item.key, timer);
    };
    run();
  }

  function preserveRemovedVideos(node) {
    if (!state.settings.includeVideo || !(node instanceof HTMLElement)) return;
    const videos = [];
    if (node instanceof HTMLVideoElement) videos.push(node);
    for (const video of node.querySelectorAll?.('video') || []) videos.push(video);
    if (!videos.length) return;

    for (const video of videos) {
      const mediaPath = canonicalMediaPath(video.getAttribute('poster') || '');
      let item = state.itemMap.get(state.videoElementItemKeys.get(video) || '');
      if (!item && mediaPath) {
        const article = video.closest('article[data-testid="tweet"], article');
        const tweetStatusId = extractTweetStatusId(article ? getTweetUrl(article) : '');
        item = state.itemMap.get(buildMediaKey(tweetStatusId, mediaPath));
      }
      if (!item && mediaPath) {
        const candidates = getItemsByMediaPath(mediaPath).filter((candidate) => candidate.kind === 'video');
        if (candidates.length === 1) [item] = candidates;
      }
      if (!item || state.activeVideoSession?.source === video) continue;
      state.videoElementItemKeys.set(video, item.key);
      refreshVideoItemSource(item, video);
      const reusableUrl = resolveReusableVideoUrl(item, video);
      try { video.pause(); } catch {}
      video.removeAttribute('autoplay');
      if (reusableUrl) {
        releaseRetainedVideoElement(item.key, video);
      } else if (hasBorrowableVideoSource(video)) {
        rememberVideoElement(item, video);
      } else {
        releaseRetainedVideoElement(item.key, video);
      }
    }

    refreshVideoRetentionWindow();
  }

  function getVideoSource(video) {
    if (!(video instanceof HTMLVideoElement)) return '';
    const candidates = [
      video.currentSrc,
      video.getAttribute('src') || '',
      ...Array.from(video.querySelectorAll('source[src]')).map((source) => source.src),
    ];
    return candidates.find(Boolean) || '';
  }

  function isLikelyGif(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    return video.loop || video.hasAttribute('loop');
  }

  function extractVideoMediaId(value) {
    const match = String(value || '').match(/(?:amplify_video_thumb|amplify_video|ext_tw_video_thumb|ext_tw_video|tweet_video_thumb|tweet_video)\/([A-Za-z0-9_-]+)/i);
    return match?.[1] || '';
  }

  function isReusableVideoUrl(rawUrl) {
    if (!rawUrl || String(rawUrl).startsWith('blob:')) return false;
    try {
      const url = new URL(rawUrl, getPageOrigin());
      return url.hostname === 'video.twimg.com'
        && (/\.mp4$/i.test(url.pathname) || url.searchParams.get('format') === 'mp4');
    } catch {
      return false;
    }
  }

  function scoreVideoUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, getPageOrigin());
      const sizeMatch = url.pathname.match(/\/(\d+)x(\d+)\//);
      const pixels = sizeMatch ? Number(sizeMatch[1]) * Number(sizeMatch[2]) : 0;
      const bitrateMatch = url.pathname.match(/(?:^|[_/])(\d{3,6})k(?:[._/]|$)/i);
      const bitrate = bitrateMatch ? Number(bitrateMatch[1]) : 0;
      return pixels * 10 + bitrate;
    } catch {
      return 0;
    }
  }

  function refreshVideoResourceCache() {
    try {
      const entries = performance.getEntriesByType('resource');
      let startIndex = state.videoResourceEntryCount;
      if (entries.length < startIndex) {
        state.videoResourceUrlsById.clear();
        startIndex = 0;
      }
      for (let index = startIndex; index < entries.length; index += 1) {
        const value = entries[index]?.name || '';
        if (!isReusableVideoUrl(value)) continue;
        const mediaId = extractVideoMediaId(value);
        if (!mediaId) continue;
        if (!state.videoResourceUrlsById.has(mediaId)) {
          state.videoResourceUrlsById.set(mediaId, new Set());
        }
        state.videoResourceUrlsById.get(mediaId).add(String(value));
      }
      state.videoResourceEntryCount = entries.length;
    } catch {
      // Resource Timingを利用できない環境ではDOM上のソースだけを使う。
    }
  }

  function collectLoadedVideoUrls(item, sourceVideo = null) {
    const mediaId = item?.videoMediaId || extractVideoMediaId(item?.mediaPath);
    const candidates = new Set();
    const add = (value) => {
      if (!isReusableVideoUrl(value)) return;
      if (mediaId && !String(value).includes(mediaId)) return;
      if (item?.failedVideoUrls instanceof Set && item.failedVideoUrls.has(String(value))) return;
      candidates.add(String(value));
    };

    add(item?.videoSrc);
    if (sourceVideo instanceof HTMLVideoElement) add(getVideoSource(sourceVideo));

    for (const video of document.querySelectorAll('video')) {
      const posterId = extractVideoMediaId(video.getAttribute('poster') || '');
      if (mediaId && posterId && posterId !== mediaId) continue;
      if (!mediaId || posterId === mediaId) add(getVideoSource(video));
    }

    if (mediaId) {
      refreshVideoResourceCache();
      for (const value of state.videoResourceUrlsById.get(mediaId) || []) add(value);
    }

    return Array.from(candidates).sort((a, b) => scoreVideoUrl(b) - scoreVideoUrl(a));
  }

  function resolveReusableVideoUrl(item, sourceVideo = null) {
    const [best] = collectLoadedVideoUrls(item, sourceVideo);
    if (best) item.videoSrc = best;
    return best || '';
  }

  function hasVideoSourceData(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    const source = getVideoSource(video);
    return Boolean(video.srcObject)
      || Boolean(source)
      || video.readyState > HTMLMediaElement.HAVE_NOTHING;
  }

  function hasUsableVideoSource(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) return false;
    return hasVideoSourceData(video);
  }

  function hasBorrowableVideoSource(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (video.srcObject) return true;
    const source = getVideoSource(video);
    return Boolean(source && source.startsWith('blob:'));
  }

  function isBorrowableVideoElement(video) {
    return hasBorrowableVideoSource(video);
  }

  function rememberVideoElement(item, video) {
    if (!item?.key || !(video instanceof HTMLVideoElement)) return;
    state.videoElementItemKeys.set(video, item.key);
    if (!hasBorrowableVideoSource(video)) {
      releaseRetainedVideoElement(item.key, video);
      return;
    }
    state.retainedVideoElements.delete(item.key);
    state.retainedVideoElements.set(item.key, video);
    refreshVideoRetentionWindow();
  }

  function preserveDisconnectedRetainedVideos() {
    if (!state.settings.includeVideo) return;
    for (const [key, video] of Array.from(state.retainedVideoElements.entries())) {
      if (!(video instanceof HTMLVideoElement) || !hasBorrowableVideoSource(video)) {
        releaseRetainedVideoElement(key, video);
      }
    }
    refreshVideoRetentionWindow();
  }

  function refreshVideoItemSource(item, video) {
    if (!item || !(video instanceof HTMLVideoElement)) return;
    state.videoElementItemKeys.set(video, item.key);
    item.videoMediaId ||= extractVideoMediaId(item.mediaPath || video.getAttribute('poster') || '');
    const source = getVideoSource(video);
    if (source) item.videoSrc = source;
    const reusableUrl = resolveReusableVideoUrl(item, video);
    if (reusableUrl) item.videoSrc = reusableUrl;
    item.isGif = isLikelyGif(video);
    if (typeof WeakRef === 'function') item.sourceVideoRef = new WeakRef(video);
    if (hasBorrowableVideoSource(video)) rememberVideoElement(item, video);
    else releaseRetainedVideoElement(item.key, video);
    if (hasUsableVideoSource(video) || hasBorrowableVideoSource(video) || reusableUrl) {
      clearVideoSourceProbe(item.key);
    }
  }

  function watchVideoSource(item, video) {
    if (!item || !(video instanceof HTMLVideoElement)) return;
    refreshVideoItemSource(item, video);
    const existing = state.videoWatchControllers.get(video);
    if (existing?.itemKey === item.key && !existing.abortController.signal.aborted) return;
    if (existing) {
      existing.abortController.abort();
      state.videoWatchAbortControllers.delete(existing.abortController);
    }

    const abortController = new AbortController();
    const record = { itemKey: item.key, abortController };
    state.videoWatchControllers.set(video, record);
    state.videoWatchAbortControllers.add(abortController);
    abortController.signal.addEventListener('abort', () => {
      state.videoWatchAbortControllers.delete(abortController);
      if (state.videoWatchControllers.get(video) === record) {
        state.videoWatchControllers.delete(video);
      }
    }, { once: true });

    const refresh = () => {
      if (abortController.signal.aborted) return;
      refreshVideoItemSource(item, video);
    };
    for (const eventName of ['loadedmetadata', 'loadeddata', 'canplay', 'durationchange', 'progress']) {
      video.addEventListener(eventName, refresh, { signal: abortController.signal });
    }
  }

  function findSourceVideoForItem(item) {
    const retained = state.retainedVideoElements.get(item?.key) || item?.sourceVideoRef?.deref?.();
    if (hasUsableVideoSource(retained) || hasBorrowableVideoSource(retained)) return retained;

    const mediaId = item?.videoMediaId || extractVideoMediaId(item?.mediaPath);
    const allVideos = Array.from(document.querySelectorAll('video'));
    const matchingVideo = allVideos.find((video) => {
      if (video.id === `${APP_ID}-lightbox-video`) return false;
      const posterPath = canonicalMediaPath(video.getAttribute('poster') || '');
      const posterId = extractVideoMediaId(video.getAttribute('poster') || '');
      return hasVideoSourceData(video)
        && ((posterPath && posterPath === item.mediaPath) || (mediaId && posterId === mediaId));
    });
    if (matchingVideo instanceof HTMLVideoElement) {
      refreshVideoItemSource(item, matchingVideo);
      watchVideoSource(item, matchingVideo);
      return matchingVideo;
    }

    let targetPath = '';
    try {
      targetPath = new URL(item.tweetUrl, getPageOrigin()).pathname;
    } catch {
      targetPath = '';
    }

    for (const article of document.querySelectorAll('article[data-testid="tweet"], article')) {
      if (!(article instanceof HTMLElement)) continue;
      const matchesTweet = targetPath && Array.from(article.querySelectorAll('a[href*="/status/"]')).some((link) => {
        try {
          return new URL(link.getAttribute('href') || '', getPageOrigin()).pathname.startsWith(targetPath);
        } catch {
          return false;
        }
      });
      if (!matchesTweet) continue;

      const videos = Array.from(article.querySelectorAll('video'));
      const matched = videos.find((video) => (
        hasVideoSourceData(video)
        && canonicalMediaPath(video.getAttribute('poster') || '') === item.mediaPath
      )) || videos.find(hasVideoSourceData);
      if (matched instanceof HTMLVideoElement) {
        refreshVideoItemSource(item, matched);
        watchVideoSource(item, matched);
        return matched;
      }
    }
    return null;
  }

  function resetLightboxVideoElement() {
    const video = document.getElementById(`${APP_ID}-lightbox-video`);
    if (!(video instanceof HTMLVideoElement)) return;
    try { video.pause(); } catch {}
    video.removeAttribute('data-item-key');
    video.style.display = 'none';
    video.loop = false;
    video.muted = false;
    video.srcObject = null;
    video.removeAttribute('src');
    video.removeAttribute('poster');
    try {
      video.load();
    } catch {
      // 破棄済みソースでも次のメディア表示は継続する。
    }
  }

  function isCurrentVideoSession(session) {
    return Boolean(
      session
      && state.activeVideoSession === session
      && !session.abortController.signal.aborted
      && state.lightboxItemKey === session.itemKey
    );
  }

  function scheduleVideoSessionTimeout(session, callback, delayMs) {
    if (!isCurrentVideoSession(session)) return 0;
    const timer = window.setTimeout(() => {
      session.timers.delete(timer);
      if (isCurrentVideoSession(session)) callback();
    }, delayMs);
    session.timers.add(timer);
    return timer;
  }

  function waitForVideoSession(session, delayMs) {
    return new Promise((resolve) => {
      if (!isCurrentVideoSession(session)) {
        resolve(false);
        return;
      }
      const timer = window.setTimeout(() => {
        session.timers.delete(timer);
        resolve(isCurrentVideoSession(session));
      }, delayMs);
      session.timers.add(timer);
      session.abortController.signal.addEventListener('abort', () => {
        window.clearTimeout(timer);
        session.timers.delete(timer);
        resolve(false);
      }, { once: true });
    });
  }

  function beginVideoSession(kind, itemKey, extra = {}) {
    cleanupActiveVideoSession();
    const abortController = new AbortController();
    const session = {
      kind,
      itemKey,
      abortController,
      timers: new Set(),
      ...extra,
    };
    state.activeVideoSession = session;
    state.activeVideoPlaybackMode = kind;
    return session;
  }

  function cleanupActiveVideoSession() {
    const session = state.activeVideoSession;
    state.activeVideoSession = null;
    if (session) {
      session.abortController.abort();
      for (const timer of session.timers) window.clearTimeout(timer);
      session.timers.clear();
    }
    resetLightboxVideoElement();
    state.activeVideoPlaybackMode = 'none';

    if (!session?.source) {
      refreshVideoRetentionWindow();
      return;
    }

    const source = session.source;
    try { source.pause(); } catch {}
    source.removeAttribute('data-xlg-lightbox-source');
    source.controls = session.controls;
    source.muted = session.muted;
    source.loop = session.loop;
    source.autoplay = session.autoplay;
    source.playsInline = session.playsInline;
    source.volume = session.volume;
    source.playbackRate = session.playbackRate;

    try {
      if (Number.isFinite(session.currentTime)) source.currentTime = session.currentTime;
    } catch {
      // ライブ状況などでシークできない場合は現在位置を維持する。
    }

    const replacementVideo = session.originalParent instanceof Element
      ? Array.from(session.originalParent.querySelectorAll('video')).find((video) => (
        video !== source
        && canonicalMediaPath(video.getAttribute('poster') || '')
          === canonicalMediaPath(source.getAttribute('poster') || '')
      ))
      : null;
    const sessionItem = state.itemMap.get(session.itemKey);
    let restored = false;

    if (replacementVideo instanceof HTMLVideoElement) {
      session.placeholder?.remove();
      if (sessionItem) {
        refreshVideoItemSource(sessionItem, replacementVideo);
        watchVideoSource(sessionItem, replacementVideo);
      }
      source.remove();
      restored = true;
    } else if (session.placeholder?.parentNode) {
      try {
        session.placeholder.parentNode.replaceChild(source, session.placeholder);
        restored = true;
      } catch {}
    }

    if (!restored && session.originalParent) {
      try {
        const before = session.originalNextSibling?.parentNode === session.originalParent
          ? session.originalNextSibling
          : null;
        session.originalParent.insertBefore(source, before);
        restored = true;
      } catch {}
    }

    if (!restored && sessionItem && state.settings.includeVideo && hasBorrowableVideoSource(source)) {
      const vault = ensureVideoVault();
      vault.appendChild(source);
      source.dataset.xlgVaulted = '1';
      rememberVideoElement(sessionItem, source);
      restored = true;
    }

    if (!restored) source.remove();
    if (restored && source.dataset.xlgVaulted !== '1') source.removeAttribute('data-xlg-vaulted');
    if (sessionItem && source.isConnected) refreshVideoItemSource(sessionItem, source);

    if (!session.wasPaused && source.isConnected && source.dataset.xlgVaulted !== '1') {
      source.play().catch(() => {});
    }
    refreshVideoRetentionWindow();
  }

  function showLightboxVideoFallback(item, message) {
    cleanupActiveVideoSession();
    const image = document.getElementById(`${APP_ID}-lightbox-image`);
    const panel = document.getElementById(`${APP_ID}-lightbox-video-error`);
    const text = document.getElementById(`${APP_ID}-lightbox-video-error-text`);
    const link = document.getElementById(`${APP_ID}-lightbox-video-open-x`);
    if (image instanceof HTMLImageElement) {
      image.dataset.itemKey = item.key;
      image.alt = item.tweetText || '動画/GIFのサムネイル';
      image.src = item.displayUrl;
      image.style.display = 'block';
    }
    setLightboxImageLink(item, true);
    if (text instanceof HTMLElement) text.textContent = message;
    if (link instanceof HTMLAnchorElement) link.href = item.tweetUrl || '#';
    if (panel instanceof HTMLElement) panel.classList.add(`${APP_ID}-show`);
    state.activeVideoPlaybackMode = 'fallback-thumbnail';
  }

  function hideLightboxVideoFallback() {
    const panel = document.getElementById(`${APP_ID}-lightbox-video-error`);
    const text = document.getElementById(`${APP_ID}-lightbox-video-error-text`);
    const link = document.getElementById(`${APP_ID}-lightbox-video-open-x`);
    if (text instanceof HTMLElement) text.textContent = '';
    if (link instanceof HTMLAnchorElement) link.removeAttribute('href');
    if (panel instanceof HTMLElement) panel.classList.remove(`${APP_ID}-show`);
  }

  function mountBorrowedVideo(item, source) {
    if (!(source instanceof HTMLVideoElement) || !hasBorrowableVideoSource(source)) return false;

    hideLightboxVideoFallback();
    const stage = document.getElementById(`${APP_ID}-lightbox-current`);
    const image = document.getElementById(`${APP_ID}-lightbox-image`);
    if (!(stage instanceof HTMLElement)) return false;
    if (image instanceof HTMLImageElement) image.style.display = 'none';
    setLightboxImageLink(item, false);

    const placeholder = document.createComment('liked-media-masonry-video-placeholder');
    const originalParent = source.parentNode;
    const originalNextSibling = source.nextSibling;
    if (originalParent) originalParent.insertBefore(placeholder, source);

    const session = beginVideoSession('borrowed-x-video', item.key, {
      source,
      placeholder,
      originalParent,
      originalNextSibling,
      controls: source.controls,
      muted: source.muted,
      loop: source.loop,
      autoplay: source.autoplay,
      playsInline: source.playsInline,
      volume: source.volume,
      playbackRate: source.playbackRate,
      currentTime: Number(source.currentTime),
      wasPaused: source.paused,
    });

    source.setAttribute('data-xlg-lightbox-source', '1');
    source.controls = true;
    source.playsInline = true;
    source.autoplay = false;
    if (item.isGif) {
      source.muted = true;
      source.loop = true;
    }
    stage.appendChild(source);
    rememberVideoElement(item, source);

    try {
      if (Number.isFinite(source.duration) && source.duration > 0) source.currentTime = 0;
    } catch {}

    const recoverBorrowedSource = (reason) => {
      if (!isCurrentVideoSession(session)) return;
      const sourceUrl = resolveReusableVideoUrl(item, source);
      if (sourceUrl) {
        playDirectVideoUrl(item, sourceUrl, source);
        return;
      }
      recordError('borrowed-video-not-ready', reason, {
        readyState: source.readyState,
        networkState: source.networkState,
        duration: Number.isFinite(source.duration) ? source.duration : null,
        hasSource: Boolean(getVideoSource(source)),
      });
      showLightboxVideoFallback(
        item,
        '動画の再生情報を取得できませんでした。元のX投稿で再生してください。',
      );
    };

    const startPlayback = () => {
      if (!isCurrentVideoSession(session)) return;
      source.play().catch((error) => {
        if (!isCurrentVideoSession(session)) return;
        recordError('source-video-play-failed', error, {
          readyState: source.readyState,
          networkState: source.networkState,
          hasSource: Boolean(getVideoSource(source)),
        });
      });
    };
    if (source.readyState > HTMLMediaElement.HAVE_NOTHING) startPlayback();
    else {
      source.addEventListener('loadedmetadata', startPlayback, { once: true, signal: session.abortController.signal });
      source.addEventListener('canplay', startPlayback, { once: true, signal: session.abortController.signal });
      scheduleVideoSessionTimeout(session, startPlayback, TEST_MODE ? 70 : 900);
    }
    source.addEventListener('error', () => {
      recoverBorrowedSource(source.error?.message || `MediaError ${source.error?.code || 0}`);
    }, { once: true, signal: session.abortController.signal });
    scheduleVideoSessionTimeout(session, () => {
      const durationReady = (Number.isFinite(source.duration) && source.duration > 0)
        || source.duration === Infinity;
      if (source.readyState > HTMLMediaElement.HAVE_NOTHING && durationReady) return;
      recoverBorrowedSource('借用したX動画要素が0:00のまま準備完了しませんでした。');
    }, VIDEO_BORROW_READY_TIMEOUT_MS);
    return true;
  }

  async function recoverMissingVideoSource(item, session) {
    const image = document.getElementById(`${APP_ID}-lightbox-image`);
    if (image instanceof HTMLImageElement) {
      image.dataset.itemKey = item.key;
      image.alt = '動画/GIFのサムネイル';
      image.src = item.displayUrl;
      image.style.display = 'block';
    }
    setLightboxImageLink(item, true);

    for (const delayMs of [180, 520, 1100]) {
      if (!await waitForVideoSession(session, TEST_MODE ? Math.min(delayMs, 80) : delayMs)) return;
      scanTweets(state.observerRoot || document);
      const source = findSourceVideoForItem(item);
      const sourceUrl = resolveReusableVideoUrl(item, source);
      if (sourceUrl) {
        playDirectVideoUrl(item, sourceUrl, source);
        return;
      }
      if (hasBorrowableVideoSource(source)) {
        mountBorrowedVideo(item, source);
        return;
      }
    }

    if (!isCurrentVideoSession(session)) return;
    recordError('video-source-missing', '動画URLと借用可能な動画要素の両方が見つかりませんでした。', {
      itemOrder: item.order,
      hasRetainedUrl: Boolean(item.videoSrc),
      retainedVideoCount: state.retainedVideoElements.size,
    });
    showLightboxVideoFallback(
      item,
      'この動画は拡張機能内で再生できません。元のX投稿で再生してください。',
    );
  }

  function startVideoRecovery(item) {
    hideLightboxVideoFallback();
    const session = beginVideoSession('recovering-source', item.key);
    void recoverMissingVideoSource(item, session);
    return true;
  }

  function handleVideoPlaybackFailure(item, failedUrl, reason, fallbackSource = null) {
    const activeSession = state.activeVideoSession;
    if (!activeSession || activeSession.itemKey !== item.key || state.lightboxItemKey !== item.key) return;
    if (failedUrl) {
      item.failedVideoUrls ||= new Set();
      item.failedVideoUrls.add(failedUrl);
    }
    const source = hasVideoSourceData(fallbackSource)
      ? fallbackSource
      : findSourceVideoForItem(item);
    const alternativeUrl = resolveReusableVideoUrl(item, source);
    if (alternativeUrl && alternativeUrl !== failedUrl) {
      playDirectVideoUrl(item, alternativeUrl, source);
      return;
    }
    if (hasBorrowableVideoSource(source)) {
      mountBorrowedVideo(item, source);
      return;
    }
    recordError('direct-video-fallback-failed', reason || '動画URLを読み込めませんでした。', {
      playbackMode: state.activeVideoPlaybackMode,
      resourceCandidateCount: collectLoadedVideoUrls(item).length,
    });
    startVideoRecovery(item);
  }

  function playDirectVideoUrl(item, sourceUrl, fallbackSource = null) {
    if (!isReusableVideoUrl(sourceUrl)) return false;
    const image = document.getElementById(`${APP_ID}-lightbox-image`);
    const video = document.getElementById(`${APP_ID}-lightbox-video`);
    if (!(video instanceof HTMLVideoElement)) return false;

    hideLightboxVideoFallback();
    if (image instanceof HTMLImageElement) image.style.display = 'none';
    setLightboxImageLink(item, false);
    const session = beginVideoSession('direct-video-url', item.key, { fallbackSource, sourceUrl });
    video.dataset.itemKey = item.key;
    video.poster = item.displayUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = item.isGif;
    video.muted = item.isGif;
    video.style.display = 'block';
    video.src = sourceUrl;
    video.load();

    const markDirectSourceReady = () => {
      if (!isCurrentVideoSession(session)) return;
      item.failedVideoUrls?.delete?.(sourceUrl);
    };
    video.addEventListener('loadedmetadata', markDirectSourceReady, {
      once: true,
      signal: session.abortController.signal,
    });
    video.addEventListener('canplay', markDirectSourceReady, {
      once: true,
      signal: session.abortController.signal,
    });

    video.play().catch((error) => {
      if (!isCurrentVideoSession(session)) return;
      recordError('lightbox-video-play-failed', error, {
        sourceType: 'direct-url',
        readyState: video.readyState,
        networkState: video.networkState,
      });
      if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        handleVideoPlaybackFailure(item, sourceUrl, error, fallbackSource);
      }
    });

    scheduleVideoSessionTimeout(session, () => {
      const durationReady = Number.isFinite(video.duration) && video.duration > 0;
      if (video.readyState > HTMLMediaElement.HAVE_NOTHING && durationReady) return;
      handleVideoPlaybackFailure(
        item,
        sourceUrl,
        '動画URLを読み込みましたが、再生時間を取得できませんでした。',
        fallbackSource,
      );
    }, VIDEO_DIRECT_READY_TIMEOUT_MS);
    return true;
  }

  function playVideoInLightbox(item) {
    cleanupActiveVideoSession();
    hideLightboxVideoFallback();
    refreshVideoRetentionWindow();

    const sourceVideo = findSourceVideoForItem(item);
    if (sourceVideo instanceof HTMLVideoElement) {
      item.isGif = isLikelyGif(sourceVideo);
      refreshVideoItemSource(item, sourceVideo);
    }

    const sourceUrl = resolveReusableVideoUrl(item, sourceVideo);
    if (sourceUrl && playDirectVideoUrl(item, sourceUrl, sourceVideo)) return;
    if (hasBorrowableVideoSource(sourceVideo) && mountBorrowedVideo(item, sourceVideo)) return;
    startVideoRecovery(item);
  }

  function onLightboxVideoError(event) {
    const video = event.currentTarget;
    if (!(video instanceof HTMLVideoElement)) return;
    const item = state.itemMap.get(video.dataset.itemKey || '');
    const session = state.activeVideoSession;
    if (!item || state.lightboxItemKey !== item.key || session?.itemKey !== item.key) return;
    const message = video.error?.message || `MediaError ${video.error?.code || 0}`;
    recordError('lightbox-video-element-error', message, {
      readyState: video.readyState,
      networkState: video.networkState,
    });
    handleVideoPlaybackFailure(item, getVideoSource(video), message, session.fallbackSource || null);
  }

  Object.assign(app.modules.video, {
    getCurrentVideoDiagnostics,
    ensureVideoVault,
    clearVideoSourceProbe,
    clearAllVideoSourceProbes,
    unwatchVideoSource,
    clearAllVideoWatchers,
    releaseRetainedVideoElement,
    getPreferredVideoRetentionKeys,
    trimVideoVault,
    refreshVideoRetentionWindow,
    clearVideoRetentionState,
    scheduleVideoSourceProbe,
    preserveRemovedVideos,
    getVideoSource,
    isLikelyGif,
    extractVideoMediaId,
    isReusableVideoUrl,
    scoreVideoUrl,
    refreshVideoResourceCache,
    collectLoadedVideoUrls,
    resolveReusableVideoUrl,
    hasVideoSourceData,
    hasUsableVideoSource,
    hasBorrowableVideoSource,
    isBorrowableVideoElement,
    rememberVideoElement,
    preserveDisconnectedRetainedVideos,
    refreshVideoItemSource,
    watchVideoSource,
    findSourceVideoForItem,
    resetLightboxVideoElement,
    isCurrentVideoSession,
    scheduleVideoSessionTimeout,
    waitForVideoSession,
    beginVideoSession,
    cleanupActiveVideoSession,
    showLightboxVideoFallback,
    hideLightboxVideoFallback,
    mountBorrowedVideo,
    recoverMissingVideoSource,
    startVideoRecovery,
    handleVideoPlaybackFailure,
    playDirectVideoUrl,
    playVideoInLightbox,
    onLightboxVideoError,
  });
})();
