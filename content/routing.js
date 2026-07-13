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
  const { sanitizeDiagnosticText, recordError, recordRuntimeErrorEvent, getDiagnostics } = app.diagnosticsApi;
  app.modules ||= {};
  app.modules.routing ||= {};

  function applyPreviewTransparencySetting(...args) { return app.modules.board.applyPreviewTransparencySetting(...args); }
  function captureXPageScrollPosition(...args) { return app.modules.loading.captureXPageScrollPosition(...args); }
  function cleanupActiveVideoSession(...args) { return app.modules.video.cleanupActiveVideoSession(...args); }
  function clearAllVideoSourceProbes(...args) { return app.modules.video.clearAllVideoSourceProbes(...args); }
  function clearCardUnloadQueue(...args) { return app.modules.board.clearCardUnloadQueue(...args); }
  function clearPendingBoardRestore(...args) { return app.modules.board.clearPendingBoardRestore(...args); }
  function clearVideoRetentionState(...args) { return app.modules.video.clearVideoRetentionState(...args); }
  function closeLightbox(...args) { return app.modules.lightbox.closeLightbox(...args); }
  function closeOverlay(...args) { return app.modules.board.closeOverlay(...args); }
  function createLauncher(...args) { return app.modules.board.createLauncher(...args); }
  function ensureCardObserver(...args) { return app.modules.board.ensureCardObserver(...args); }
  function getRouteKey(...args) { return app.modules.dom.getRouteKey(...args); }
  function getLoadController() { return app.modules.loading.getLoadController(); }
  function hideToast(...args) { return app.modules.board.hideToast(...args); }
  function isLightboxOpen(...args) { return app.modules.lightbox.isLightboxOpen(...args); }
  function isLikesPage(...args) { return app.modules.dom.isLikesPage(...args); }
  function isLoadActive(...args) { return app.modules.loading.isLoadActive(...args); }
  function markProgrammaticBoardScroll(...args) { return app.modules.board.markProgrammaticBoardScroll(...args); }
  function markUserBoardScrollIntent(...args) { return app.modules.board.markUserBoardScrollIntent(...args); }
  function maybeRequestMoreAtBoardEnd(...args) { return app.modules.loading.maybeRequestMoreAtBoardEnd(...args); }
  function moveLightbox(...args) { return app.modules.lightbox.moveLightbox(...args); }
  function openOverlay(...args) { return app.modules.board.openOverlay(...args); }
  function preserveRemovedVideos(...args) { return app.modules.video.preserveRemovedVideos(...args); }
  function queueArticlesFromMutations(...args) { return app.modules.dom.queueArticlesFromMutations(...args); }
  function queueKeyboardLoadAfterCurrent(...args) { return app.modules.loading.queueKeyboardLoadAfterCurrent(...args); }
  function removeVideoItems(...args) { return app.modules.board.removeVideoItems(...args); }
  function requestMoreFromX(...args) { return app.modules.loading.requestMoreFromX(...args); }
  function scanTweets(...args) { return app.modules.dom.scanTweets(...args); }
  function scheduleRelayout(...args) { return app.modules.board.scheduleRelayout(...args); }
  function scheduleScan(...args) { return app.modules.dom.scheduleScan(...args); }
  function setStatus(...args) { return app.modules.board.setStatus(...args); }
  function updateCount(...args) { return app.modules.board.updateCount(...args); }
  function updateLoadZone(...args) { return app.modules.board.updateLoadZone(...args); }

  function clearCollectedMedia() {
    cleanupActiveVideoSession();
    closeLightbox();
    clearPendingBoardRestore();
    window.clearTimeout(state.scanTimer);
    window.clearTimeout(state.relayoutTimer);
    getLoadController().cancel('media-reset', { clearResult: true, resetPolicy: true });
    window.clearTimeout(state.gridSyncTimer);
    window.clearTimeout(state.gridHighlightTimer);
    window.clearTimeout(state.layoutHeightTimer);
    window.clearTimeout(state.lightboxTransitionTimer);
    state.scanTimer = 0;
    state.relayoutTimer = 0;
    state.gridSyncTimer = 0;
    state.gridHighlightTimer = 0;
    state.layoutHeightTimer = 0;
    state.lightboxTransitionTimer = 0;
    clearCardUnloadQueue();
    state.cardObserver?.disconnect();
    clearAllVideoSourceProbes();
    stopKeyboardBoardScroll(true);
    clearVideoRetentionState();
    state.items = [];
    state.seen.clear();
    state.itemMap.clear();
    state.itemIndexMap.clear();
    state.mediaPathIndex.clear();
    state.videoElementItemKeys = new WeakMap();
    state.pendingArticles.clear();
    state.lightboxIndex = -1;
    state.lightboxItemKey = '';
    state.lightboxReturnFocusElement = null;
    state.preloadCache.clear();
    state.videoResourceUrlsById.clear();
    state.videoResourceEntryCount = 0;
    state.layoutColumns = [];
    state.layoutHeights = [];
    state.layoutColumnCount = 0;
    state.laidOutCount = 0;
    state.currentGridCardKey = '';
    const grid = document.getElementById(`${APP_ID}-grid`);
    if (grid) grid.replaceChildren();
    updateCount();
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function rebuildBoardFromBeginning(reason = 'settings') {
    if (!isLikesPage() || state.rebuildFromBeginningInProgress) return false;

    state.rebuildFromBeginningInProgress = true;
    state.observer?.disconnect();
    state.observer = null;
    state.observerRoot = null;
    window.clearTimeout(state.observerRetryTimer);
    state.observerRetryTimer = 0;
    clearCollectedMedia();
    setStatus(reason === 'video-enabled'
      ? '動画/GIFを含め、いいね欄の先頭から更新中…'
      : 'いいね欄の先頭から更新中…');
    updateLoadZone('Xのいいね欄を先頭へ戻し、ボードを作り直しています…');

    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (overlay instanceof HTMLElement) {
      markProgrammaticBoardScroll();
      overlay.scrollTop = 0;
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    scrollingElement.scrollTo({ top: 0, behavior: 'smooth' });
    window.dispatchEvent(new Event('scroll'));

    const startedAt = Date.now();
    while (
      Date.now() - startedAt < REBUILD_SCROLL_WAIT_MS
      && Number(scrollingElement.scrollTop) > 8
    ) {
      await delay(50);
    }
    await delay(280);

    if (!isLikesPage()) {
      state.rebuildFromBeginningInProgress = false;
      return false;
    }

    state.rebuildFromBeginningInProgress = false;
    installObserver();
    const added = scanTweets(state.observerRoot || document);
    scheduleScan(350);
    scheduleRelayout(0);
    ensureCardObserver();
    setStatus(added > 0
      ? `先頭から${added}件取得しました`
      : '先頭からの更新を開始しました');
    updateLoadZone('先頭から更新しました。最下部までスクロールすると続きを読み込みます。');
    window.setTimeout(() => {
      setStatus('');
      updateLoadZone();
    }, 2200);
    return true;
  }

  function normalizeIncomingSettings(raw = {}) {
    return {
      cardWidth: clamp(Number(raw.cardWidth) || state.settings.cardWidth || 300, 180, 640),
      includeVideo: Boolean(raw.includeVideo),
      closePositionBehavior: raw.closePositionBehavior === 'restore_open_position'
        ? 'restore_open_position'
        : 'keep_scrolled_position',
      previewTransparency: clamp(
        Number.isFinite(Number(raw.previewTransparency))
          ? Number(raw.previewTransparency)
          : state.settings.previewTransparency ?? PREVIEW_TRANSPARENCY_DEFAULT,
        0,
        90,
      ),
    };
  }

  async function applySettings(rawSettings = {}) {
    const previous = { ...state.settings };
    const next = normalizeIncomingSettings({ ...state.settings, ...rawSettings });
    state.settings = next;
    await saveSettings();

    if (previous.cardWidth !== next.cardWidth) scheduleRelayout(30);
    if (previous.previewTransparency !== next.previewTransparency) applyPreviewTransparencySetting();

    const videoEnabled = !previous.includeVideo && next.includeVideo;

    if (videoEnabled) {
      await rebuildBoardFromBeginning('video-enabled');
    } else if (previous.includeVideo && !next.includeVideo) {
      const currentItem = state.itemMap.get(state.lightboxItemKey);
      if (currentItem?.kind === 'video') closeLightbox();
      removeVideoItems();
      scheduleScan(0);
    }

    return getPopupState();
  }

  function getPopupState() {
    return {
      ok: true,
      isLikesPage: isLikesPage(),
      boardOpen: state.active,
      itemCount: state.items.length,
      isLoadingMore: isLoadActive(),
      loadState: getLoadController().getPhase(),
      isRebuilding: state.rebuildFromBeginningInProgress,
      statusMessage: state.statusMessage,
      settingsStorage: 'extension.storage.local',
      settings: { ...state.settings },
    };
  }

  async function handlePopupMessage(message) {
    if (!message || message.namespace !== 'liked-media-masonry') return null;

    switch (message.type) {
      case 'get-state':
        return getPopupState();
      case 'open-board':
        openOverlay();
        return getPopupState();
      case 'close-board':
        closeOverlay();
        return getPopupState();
      case 'rescan': {
        if (!isLikesPage()) return { ...getPopupState(), ok: false, error: 'Xのいいね欄で実行してください。' };
        setStatus('画面内を再走査中…');
        const added = scanTweets();
        setStatus(added > 0 ? `${added}件追加` : '画面内の再走査が完了しました');
        window.setTimeout(() => setStatus(''), 1200);
        return getPopupState();
      }
      case 'load-more':
        if (!isLikesPage()) return { ...getPopupState(), ok: false, error: 'Xのいいね欄で実行してください。' };
        requestMoreFromX({ source: 'popup-button' });
        return getPopupState();
      case 'scroll-board-top': {
        const overlay = document.getElementById(`${APP_ID}-overlay`);
        if (overlay instanceof HTMLElement) {
          markProgrammaticBoardScroll();
          overlay.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return getPopupState();
      }
      case 'apply-settings':
        return applySettings(message.settings || {});
      case 'get-diagnostics':
        return { ...getPopupState(), diagnostics: getDiagnostics() };
      default:
        return { ...getPopupState(), ok: false, error: '未対応の操作です。' };
    }
  }

  function installRuntimeMessaging() {
    const runtime = extensionApi?.runtime;
    if (!runtime?.onMessage?.addListener) return;
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.namespace !== 'liked-media-masonry') return undefined;
      Promise.resolve(handlePopupMessage(message))
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.warn('[Liked Media Masonry] メニュー操作に失敗しました。', error);
          sendResponse({ ...getPopupState(), ok: false, error: String(error?.message || error) });
        });
      return true;
    });
  }

  function resetForRoute(routeKey) {
    cleanupActiveVideoSession();
    clearVideoRetentionState();
    clearAllVideoSourceProbes();
    stopKeyboardBoardScroll(true);
    getLoadController().cancel('route-reset', { clearResult: true, resetPolicy: true });
    state.routeKey = routeKey;
    state.xPageScrollTopOnBoardOpen = null;
    state.rebuildFromBeginningInProgress = false;
    window.clearTimeout(state.lightboxTransitionTimer);
    state.lightboxTransitionTimer = 0;
    clearCardUnloadQueue();
    state.cardObserver?.disconnect();
    state.items = [];
    state.seen.clear();
    state.itemMap.clear();
    state.itemIndexMap.clear();
    state.mediaPathIndex.clear();
    state.videoElementItemKeys = new WeakMap();
    state.pendingArticles.clear();
    state.lightboxIndex = -1;
    state.lightboxItemKey = '';
    state.lightboxReturnFocusElement = null;
    state.preloadCache.clear();
    state.videoResourceUrlsById.clear();
    state.videoResourceEntryCount = 0;
    state.layoutColumns = [];
    state.layoutHeights = [];
    state.layoutColumnCount = 0;
    state.laidOutCount = 0;
    window.clearTimeout(state.gridSyncTimer);
    window.clearTimeout(state.gridHighlightTimer);
    window.clearTimeout(state.layoutHeightTimer);
    state.currentGridCardKey = '';
    state.lightboxOpenScrollTop = 0;
    state.lightboxManualBoardScroll = false;
    state.lastUserBoardScrollAt = 0;
    state.suppressBottomLoadUntil = 0;
    clearPendingBoardRestore();
    hideToast();

    const grid = document.getElementById(`${APP_ID}-grid`);
    if (grid) grid.replaceChildren();
    updateCount();
    if (state.active) captureXPageScrollPosition();
  }

  function scheduleRouteCheck(delay = ROUTE_CHANGE_DEBOUNCE_MS) {
    window.clearTimeout(state.routeCheckTimer);
    state.routeCheckTimer = window.setTimeout(() => {
      state.routeCheckTimer = 0;
      const hrefChanged = location.href !== state.lastLocation;
      if (hrefChanged) state.lastLocation = location.href;
      handleRouteChange();
    }, delay);
  }

  function suspendLikesPageWork() {
    state.observer?.disconnect();
    state.observer = null;
    state.observerRoot = null;
    state.pendingArticles.clear();
    state.cardObserver?.disconnect();
    clearAllVideoSourceProbes();
    stopKeyboardBoardScroll(true);
    clearVideoRetentionState();
    state.videoResourceUrlsById.clear();
    state.videoResourceEntryCount = 0;
    for (const item of state.items) {
      if (item.kind !== 'video') continue;
      item.sourceVideoRef = null;
      if (item.videoSrc?.startsWith('blob:')) item.videoSrc = '';
    }
    clearCardUnloadQueue();
    window.clearTimeout(state.observerRetryTimer);
    window.clearTimeout(state.scanTimer);
    window.clearTimeout(state.relayoutTimer);
    getLoadController().cancel('page-left', { clearResult: true, resetPolicy: true });
    window.clearTimeout(state.gridSyncTimer);
    window.clearTimeout(state.gridHighlightTimer);
    window.clearTimeout(state.layoutHeightTimer);
    state.observerRetryTimer = 0;
    state.scanTimer = 0;
    state.relayoutTimer = 0;
    state.gridSyncTimer = 0;
    state.gridHighlightTimer = 0;
    state.layoutHeightTimer = 0;
    clearPendingBoardRestore();
  }

  function handleRouteChange() {
    const likes = isLikesPage();
    const launcher = createLauncher();
    launcher.classList.toggle(`${APP_ID}-visible`, likes);

    if (!likes) {
      closeOverlay({ restoreXScroll: false });
      suspendLikesPageWork();
      return;
    }

    const routeKey = getRouteKey();
    if (routeKey && routeKey !== state.routeKey) resetForRoute(routeKey);
    installObserver();
    scheduleScan(250);
  }

  function findTimelineRoot() {
    const firstTweet = document.querySelector('article[data-testid="tweet"]');
    if (firstTweet instanceof HTMLElement) {
      return firstTweet.closest('section')
        || firstTweet.closest('[data-testid="primaryColumn"]')
        || firstTweet.closest('main');
    }

    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (primary instanceof HTMLElement) {
      return primary.querySelector('section') || primary;
    }
    return null;
  }

  function installObserver() {
    window.clearTimeout(state.observerRetryTimer);
    if (!isLikesPage()) return;

    const root = findTimelineRoot();
    if (!(root instanceof HTMLElement)) {
      state.observerRetryTimer = window.setTimeout(installObserver, TIMELINE_OBSERVER_RETRY_MS);
      return;
    }

    if (state.observerRoot === root && state.observer) return;
    const previousRoot = state.observerRoot;
    state.observer?.disconnect();
    if (previousRoot instanceof HTMLElement && previousRoot !== root && !previousRoot.isConnected) {
      preserveRemovedVideos(previousRoot);
    }
    state.observerRoot = root;
    state.observer = new MutationObserver((records) => {
      if (isLikesPage()) queueArticlesFromMutations(records);
    });
    state.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'poster'],
    });
    scanTweets(root);
  }

  function stopKeyboardBoardScroll(resetHold = false) {
    window.clearTimeout(state.keyboardLoadContinuationTimer);
    state.keyboardLoadContinuationTimer = 0;
    state.keyboardScrollHeldKey = '';
    state.keyboardScrollDirection = 0;
    state.keyboardScrollLastFrameAt = 0;
    if (state.keyboardScrollRaf) window.cancelAnimationFrame(state.keyboardScrollRaf);
    state.keyboardScrollRaf = 0;
    if (resetHold) {
      getLoadController().clearQueuedRequest('keyboard-board-end');
      state.keyboardAutoLoadsThisHold = 0;
      state.keyboardAutoLoadLimitNotified = false;
    }
  }

  function runKeyboardBoardScroll(frameTime) {
    state.keyboardScrollRaf = 0;
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement) || !isLightboxOpen()) {
      stopKeyboardBoardScroll(true);
      return;
    }

    const previousFrame = state.keyboardScrollLastFrameAt || frameTime;
    const elapsedMs = Math.min(50, Math.max(0, frameTime - previousFrame));
    state.keyboardScrollLastFrameAt = frameTime;
    const maxTop = Math.max(0, overlay.scrollHeight - overlay.clientHeight);

    if (state.keyboardScrollDirection !== 0) {
      const speed = state.keyboardScrollMode === 'page'
        ? KEYBOARD_SCROLL_PAGE_SPEED_PX_PER_SEC
        : KEYBOARD_SCROLL_LINE_SPEED_PX_PER_SEC;
      state.keyboardScrollTargetTop += state.keyboardScrollDirection * speed * (elapsedMs / 1000);
    }
    state.keyboardScrollTargetTop = clamp(state.keyboardScrollTargetTop, 0, maxTop);

    const difference = state.keyboardScrollTargetTop - overlay.scrollTop;
    if (Math.abs(difference) > 0.35) {
      const easing = Math.min(1, Math.max(.16, elapsedMs / 72));
      overlay.scrollTop = clamp(overlay.scrollTop + difference * easing, 0, maxTop);
      state.lightboxManualBoardScroll = true;
      state.lastUserBoardScrollAt = Date.now();
    } else {
      overlay.scrollTop = state.keyboardScrollTargetTop;
    }

    if (state.keyboardScrollDirection > 0 || difference > 0) {
      state.lastUserBoardScrollAt = Date.now();
      maybeRequestMoreAtBoardEnd('keyboard-board-end');
    }

    const stillMoving = state.keyboardScrollDirection !== 0
      || Math.abs(state.keyboardScrollTargetTop - overlay.scrollTop) > 0.35;
    if (stillMoving) state.keyboardScrollRaf = window.requestAnimationFrame(runKeyboardBoardScroll);
    else state.keyboardScrollLastFrameAt = 0;
  }

  function activateVisibleLightboxLoadMore() {
    const button = document.getElementById(`${APP_ID}-lightbox-loadmore`);
    if (
      !(button instanceof HTMLButtonElement)
      || !button.classList.contains(`${APP_ID}-show`)
    ) return false;

    stopKeyboardBoardScroll(false);
    if (button.disabled) {
      if (isLoadActive()) {
        queueKeyboardLoadAfterCurrent();
      }
      return true;
    }

    button.click();
    return true;
  }

  function startKeyboardBoardScroll(key) {
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return;
    const direction = ['ArrowUp', 'PageUp'].includes(key) ? -1 : 1;
    const mode = ['PageUp', 'PageDown', ' '].includes(key) ? 'page' : 'line';
    const newHold = state.keyboardScrollHeldKey !== key || state.keyboardScrollDirection !== direction;

    if (newHold) {
      state.keyboardScrollHeldKey = key;
      state.keyboardScrollDirection = direction;
      state.keyboardScrollMode = mode;
      state.keyboardScrollLastFrameAt = 0;
      if (direction > 0) {
        state.keyboardAutoLoadsThisHold = 0;
        state.keyboardAutoLoadLimitNotified = false;
      }
    }

    const minimumStep = mode === 'page'
      ? Math.max(180, overlay.clientHeight * .72)
      : KEYBOARD_SCROLL_LINE_STEP_PX;
    const maxTop = Math.max(0, overlay.scrollHeight - overlay.clientHeight);
    const baseTarget = state.keyboardScrollRaf
      ? state.keyboardScrollTargetTop
      : overlay.scrollTop;
    state.keyboardScrollTargetTop = clamp(
      direction > 0
        ? Math.max(baseTarget, overlay.scrollTop + minimumStep)
        : Math.min(baseTarget, overlay.scrollTop - minimumStep),
      0,
      maxTop,
    );
    state.lightboxManualBoardScroll = true;
    markUserBoardScrollIntent();
    if (direction > 0) maybeRequestMoreAtBoardEnd('keyboard-board-end', { queueIfLoading: true });
    if (!state.keyboardScrollRaf) {
      state.keyboardScrollRaf = window.requestAnimationFrame(runKeyboardBoardScroll);
    }
  }

  function releaseKeyboardBoardScroll(key) {
    if (state.keyboardScrollHeldKey !== key) return;
    window.clearTimeout(state.keyboardLoadContinuationTimer);
    state.keyboardLoadContinuationTimer = 0;
    state.keyboardScrollHeldKey = '';
    state.keyboardScrollDirection = 0;
    state.keyboardScrollLastFrameAt = 0;
    if (!state.keyboardScrollRaf && !getLoadController().getQueuedRequest() && !isLoadActive()) {
      state.keyboardAutoLoadsThisHold = 0;
      state.keyboardAutoLoadLimitNotified = false;
    }
  }

  function isEditableKeyboardTarget(target) {
    return target instanceof HTMLElement && (
      target.isContentEditable
      || target.matches('input, textarea, select, button, [role="textbox"]')
    );
  }

  function installGlobalEvents() {
    document.addEventListener('keydown', (event) => {
      if (
        state.active
        && state.pendingBoardRestoreTop !== null
        && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
      ) {
        clearPendingBoardRestore();
      }

      if (isLightboxOpen()) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeLightbox();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveLightbox(-1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveLightbox(1);
        } else if (
          event.key === 'ArrowDown'
          && !event.ctrlKey
          && !event.metaKey
          && !event.altKey
          && activateVisibleLightboxLoadMore()
        ) {
          event.preventDefault();
        } else if (
          !event.ctrlKey
          && !event.metaKey
          && !event.altKey
          && !isEditableKeyboardTarget(event.target)
          && !(event.key === ' ' && event.target instanceof HTMLVideoElement)
          && ['ArrowDown', 'PageDown', ' ', 'ArrowUp', 'PageUp'].includes(event.key)
        ) {
          event.preventDefault();
          startKeyboardBoardScroll(event.key);
        }
        return;
      }

      if (event.key === 'Escape' && state.active) closeOverlay();
    });

    document.addEventListener('keyup', (event) => {
      if (['ArrowDown', 'PageDown', ' ', 'ArrowUp', 'PageUp'].includes(event.key)) {
        releaseKeyboardBoardScroll(event.key);
      }
    });
    window.addEventListener('blur', () => stopKeyboardBoardScroll(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopKeyboardBoardScroll(true);
    });

    // ページ全体のPromise拒否はX本体由来と区別できないため収集しない。
    // JavaScriptエラーも、拡張機能自身のcontent script URLと確認できた場合だけ記録する。
    window.addEventListener('error', recordRuntimeErrorEvent);
    window.addEventListener('resize', () => scheduleRelayout(120), { passive: true });
    window.addEventListener('popstate', () => scheduleRouteCheck(0), { passive: true });
    window.addEventListener('hashchange', () => scheduleRouteCheck(0), { passive: true });
    window.addEventListener('pageshow', () => scheduleRouteCheck(0), { passive: true });

    if (globalThis.navigation?.addEventListener) {
      globalThis.navigation.addEventListener('navigate', () => scheduleRouteCheck(0));
      globalThis.navigation.addEventListener('currententrychange', () => scheduleRouteCheck(0));
    }

    // XのDOM更新はNavigation APIを通らない場合があるため、低頻度の健全性確認だけを残す。
    state.routeFallbackTimer = window.setInterval(() => {
      if (location.href !== state.lastLocation) {
        scheduleRouteCheck(0);
        return;
      }

      if (!isLikesPage()) return;
      const currentRoot = findTimelineRoot();
      if (!state.observerRoot?.isConnected || (currentRoot && currentRoot !== state.observerRoot)) {
        installObserver();
      }
    }, ROUTE_FALLBACK_CHECK_MS);
  }

  Object.assign(app.modules.routing, {
    clearCollectedMedia,
    delay,
    rebuildBoardFromBeginning,
    normalizeIncomingSettings,
    applySettings,
    getPopupState,
    handlePopupMessage,
    installRuntimeMessaging,
    resetForRoute,
    scheduleRouteCheck,
    suspendLikesPageWork,
    handleRouteChange,
    findTimelineRoot,
    installObserver,
    stopKeyboardBoardScroll,
    runKeyboardBoardScroll,
    activateVisibleLightboxLoadMore,
    startKeyboardBoardScroll,
    releaseKeyboardBoardScroll,
    isEditableKeyboardTarget,
    installGlobalEvents,
  });
})();
