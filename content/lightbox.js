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
  app.modules.lightbox ||= {};

  function cleanupActiveVideoSession(...args) { return app.modules.video.cleanupActiveVideoSession(...args); }
  function clearPendingBoardRestore(...args) { return app.modules.board.clearPendingBoardRestore(...args); }
  function delay(...args) { return app.modules.routing.delay(...args); }
  function getViewerItems(...args) { return app.modules.board.getViewerItems(...args); }
  function getItemIndex(...args) { return app.modules.dom.getItemIndex(...args); }
  function hideLightboxVideoFallback(...args) { return app.modules.video.hideLightboxVideoFallback(...args); }
  function highlightGridCard(...args) { return app.modules.board.highlightGridCard(...args); }
  function isLoadActive(...args) { return app.modules.loading.isLoadActive(...args); }
  function markUserBoardScrollIntent(...args) { return app.modules.board.markUserBoardScrollIntent(...args); }
  function maybeRequestMoreAtBoardEnd(...args) { return app.modules.loading.maybeRequestMoreAtBoardEnd(...args); }
  function playVideoInLightbox(...args) { return app.modules.video.playVideoInLightbox(...args); }
  function refreshVideoRetentionWindow(...args) { return app.modules.video.refreshVideoRetentionWindow(...args); }
  function restoreBoardScrollPosition(...args) { return app.modules.board.restoreBoardScrollPosition(...args); }
  function stopKeyboardBoardScroll(...args) { return app.modules.routing.stopKeyboardBoardScroll(...args); }
  function syncGridToLightboxItem(...args) { return app.modules.board.syncGridToLightboxItem(...args); }

  function setLightboxImageLink(item, visible = true) {
    const link = document.getElementById(`${APP_ID}-lightbox-image-link`);
    if (!(link instanceof HTMLAnchorElement)) return;
    if (item?.tweetUrl) link.href = item.tweetUrl;
    else link.removeAttribute('href');
    link.style.display = visible ? 'block' : 'none';
    link.setAttribute('aria-label', item?.kind === 'video'
      ? '動画の元投稿をXで開く'
      : '画像の元投稿をXで開く');
  }

  function restoreLightboxFocus(itemKey, preferredTarget = null) {
    const preferred = preferredTarget instanceof HTMLElement ? preferredTarget : null;
    const fallback = state.itemMap.get(itemKey)?.card?.querySelector?.(`.${APP_ID}-media-wrap`);
    const target = preferred?.isConnected ? preferred : fallback;
    if (!(target instanceof HTMLElement)) return;
    window.requestAnimationFrame(() => {
      if (!target.isConnected) return;
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    });
  }

  function openLightbox(item) {
    const mediaItems = getViewerItems();
    const index = mediaItems.indexOf(item);
    if (index < 0) return;

    state.lightboxIndex = index;
    state.lightboxItemKey = item.key;
    state.lightboxReturnFocusElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : item.card?.querySelector?.(`.${APP_ID}-media-wrap`) || null;
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    clearPendingBoardRestore();
    state.lightboxOpenScrollTop = overlay instanceof HTMLElement ? overlay.scrollTop : 0;
    state.lightboxManualBoardScroll = false;
    const lightbox = document.getElementById(`${APP_ID}-lightbox`);
    if (!lightbox) return;

    updateLightbox(true, 0);
    lightbox.classList.add(`${APP_ID}-lightbox-open`);
    window.requestAnimationFrame(() => {
      const closeButton = document.getElementById(`${APP_ID}-lightbox-close`);
      if (!(closeButton instanceof HTMLButtonElement)) return;
      try { closeButton.focus({ preventScroll: true }); } catch { closeButton.focus(); }
    });
    scheduleGridSync(0);
  }

  function scheduleGridSync(delay = 0, options = {}) {
    if (isLightboxOpen() && state.lightboxManualBoardScroll && !options.force) return;
    window.clearTimeout(state.gridSyncTimer);
    state.gridSyncTimer = window.setTimeout(() => {
      if (isLightboxOpen() && state.lightboxManualBoardScroll && !options.force) return;
      syncGridToLightboxItem(state.lightboxItemKey, options);
    }, delay);
  }

  function closeLightbox() {
    stopKeyboardBoardScroll(true);
    if (!isLightboxOpen() && state.lightboxIndex < 0) return;
    const currentKey = state.lightboxItemKey;
    const returnFocusElement = state.lightboxReturnFocusElement;
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    const restoreOpeningPosition = state.settings.closePositionBehavior === 'restore_open_position';
    const openingScrollTop = state.lightboxOpenScrollTop;

    cleanupActiveVideoSession();
    hideLightboxVideoFallback();
    const lightbox = document.getElementById(`${APP_ID}-lightbox`);
    if (lightbox) lightbox.classList.remove(`${APP_ID}-lightbox-open`);
    state.lightboxIndex = -1;
    state.lightboxItemKey = '';
    state.lightboxReturnFocusElement = null;

    const image = document.getElementById(`${APP_ID}-lightbox-image`);
    setLightboxImageLink(null, false);
    if (image instanceof HTMLImageElement) {
      image.removeAttribute('src');
      image.style.display = 'block';
      delete image.dataset.fallbackUsed;
      delete image.dataset.fallbackUrl;
      delete image.dataset.itemKey;
    }
    const stage = document.getElementById(`${APP_ID}-lightbox-stage`);
    if (stage instanceof HTMLElement) delete stage.dataset.itemKey;
    renderLightboxPreview('prev', null);
    renderLightboxPreview('next', null);

    window.clearTimeout(state.gridSyncTimer);
    window.clearTimeout(state.lightboxTransitionTimer);
    state.lightboxTransitionTimer = 0;
    if (restoreOpeningPosition && overlay instanceof HTMLElement) {
      restoreBoardScrollPosition(openingScrollTop);
    } else {
      clearPendingBoardRestore();
    }
    if (currentKey) highlightGridCard(currentKey, 1400);

    state.lightboxManualBoardScroll = false;
    state.lightboxOpenScrollTop = 0;
    restoreLightboxFocus(currentKey, returnFocusElement);
    refreshVideoRetentionWindow();
  }

  function isLightboxOpen() {
    return document
      .getElementById(`${APP_ID}-lightbox`)
      ?.classList.contains(`${APP_ID}-lightbox-open`) || false;
  }

  function moveLightbox(direction) {
    const mediaItems = getViewerItems();
    if (!mediaItems.length || state.lightboxIndex < 0) return;

    const targetIndex = state.lightboxIndex + direction;
    if (targetIndex < 0) {
      state.lightboxIndex = 0;
      refreshLightboxChrome();
      return;
    }

    if (targetIndex >= mediaItems.length) {
      refreshLightboxChrome();
      pulseLoadMoreButton();
      return;
    }

    state.lightboxIndex = targetIndex;
    state.lightboxItemKey = mediaItems[targetIndex].key;
    updateLightbox(true, direction);
    scheduleGridSync(0);
  }

  function renderLightboxPreview(side, item) {
    const preview = document.getElementById(`${APP_ID}-lightbox-preview-${side}`);
    const image = document.getElementById(`${APP_ID}-lightbox-preview-${side}-image`);
    if (!(preview instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

    if (!item) {
      preview.hidden = true;
      preview.removeAttribute('data-item-key');
      image.removeAttribute('src');
      image.removeAttribute('title');
      image.alt = '';
      return;
    }

    const isPrevious = side === 'prev';
    preview.hidden = false;
    image.alt = isPrevious ? '前のメディアを表示' : '次のメディアを表示';
    image.title = image.alt;
    if (preview.dataset.itemKey !== item.key) {
      preview.dataset.itemKey = item.key;
      image.src = item.displayUrl;
    }
  }

  function refreshLightboxPreviews() {
    const mediaItems = getViewerItems();
    renderLightboxPreview('prev', mediaItems[state.lightboxIndex - 1] || null);
    renderLightboxPreview('next', mediaItems[state.lightboxIndex + 1] || null);
  }

  function animateLightboxTransition(direction = 0) {
    const current = document.getElementById(`${APP_ID}-lightbox-current`);
    if (!(current instanceof HTMLElement)) return;

    const animationClasses = [
      `${APP_ID}-enter-next`,
      `${APP_ID}-enter-prev`,
      `${APP_ID}-enter-fade`,
    ];
    current.classList.remove(...animationClasses);
    void current.offsetWidth;

    current.classList.add(direction > 0
      ? `${APP_ID}-enter-next`
      : direction < 0
        ? `${APP_ID}-enter-prev`
        : `${APP_ID}-enter-fade`);

    window.clearTimeout(state.lightboxTransitionTimer);
    state.lightboxTransitionTimer = window.setTimeout(() => {
      current.classList.remove(...animationClasses);
      document.getElementById(`${APP_ID}-lightbox-preview-prev`)
        ?.classList.remove(`${APP_ID}-preview-refresh`);
      document.getElementById(`${APP_ID}-lightbox-preview-next`)
        ?.classList.remove(`${APP_ID}-preview-refresh`);
      state.lightboxTransitionTimer = 0;
    }, LIGHTBOX_TRANSITION_MS + 40);
  }

  function updateLightbox(reloadMedia = true, transitionDirection = 0) {
    const mediaItems = getViewerItems();
    const item = mediaItems[state.lightboxIndex];
    const image = document.getElementById(`${APP_ID}-lightbox-image`);
    const stage = document.getElementById(`${APP_ID}-lightbox-stage`);
    if (!item || !(image instanceof HTMLImageElement) || !(stage instanceof HTMLElement)) return;

    state.lightboxItemKey = item.key;
    refreshVideoRetentionWindow();

    if (reloadMedia && stage.dataset.itemKey !== item.key) {
      cleanupActiveVideoSession();
      hideLightboxVideoFallback();
      stage.dataset.itemKey = item.key;

      if (item.kind === 'video') {
        playVideoInLightbox(item);
      } else {
        setLightboxImageLink(item, true);
        image.style.display = 'block';
        delete image.dataset.fallbackUsed;
        image.dataset.itemKey = item.key;
        image.dataset.fallbackUrl = item.displayUrl;
        image.alt = item.tweetText || 'Xでいいねした画像の拡大表示';
        image.src = item.originalUrl;
      }
      animateLightboxTransition(transitionDirection);
    }

    refreshLightboxChrome();
    preloadUpcomingLightboxMedia();
  }

  function refreshLightboxChrome() {
    if (!isLightboxOpen() && state.lightboxIndex < 0) return;

    const mediaItems = getViewerItems();
    const item = mediaItems[state.lightboxIndex];
    const info = document.getElementById(`${APP_ID}-lightbox-info`);
    const loadMore = document.getElementById(`${APP_ID}-lightbox-loadmore`);
    const loadMoreLabel = loadMore?.querySelector(`.${APP_ID}-lightbox-loadmore-label`);
    if (!item) return;

    if (info) {
      const author = item.author || '投稿者不明';
      const kind = item.kind === 'video' ? `　${item.isGif ? 'GIF' : '動画'}` : '';
      const loading = isLoadActive() ? '　続きを読込中…' : '';
      info.textContent = `${state.lightboxIndex + 1} / ${mediaItems.length}　${author}${kind}${loading}`;
    }

    refreshLightboxPreviews();

    const remaining = mediaItems.length - 1 - state.lightboxIndex;
    const showLoadMore = remaining <= LIGHTBOX_LOAD_AHEAD_COUNT;
    if (loadMore instanceof HTMLButtonElement) {
      loadMore.classList.toggle(`${APP_ID}-show`, showLoadMore);
      loadMore.disabled = isLoadActive();
      loadMore.setAttribute('aria-hidden', showLoadMore ? 'false' : 'true');
    }
    if (loadMoreLabel) {
      loadMoreLabel.textContent = isLoadActive() ? '読込中…' : '続きを読み込む';
    }
  }

  function pulseLoadMoreButton() {
    const button = document.getElementById(`${APP_ID}-lightbox-loadmore`);
    if (!(button instanceof HTMLElement)) return;
    button.classList.remove(`${APP_ID}-attention`);
    void button.offsetWidth;
    button.classList.add(`${APP_ID}-attention`);
    window.setTimeout(() => button.classList.remove(`${APP_ID}-attention`), 900);
  }

  function reconcileLightboxAfterItemsChange() {
    if (!isLightboxOpen()) return;

    const mediaItems = getViewerItems();
    if (!mediaItems.length) {
      closeLightbox();
      return;
    }

    const currentIndex = state.lightboxItemKey
      ? getItemIndex(state.lightboxItemKey)
      : -1;

    if (currentIndex >= 0) {
      state.lightboxIndex = currentIndex;
    } else {
      state.lightboxIndex = clamp(state.lightboxIndex, 0, mediaItems.length - 1);
      state.lightboxItemKey = mediaItems[state.lightboxIndex].key;
      updateLightbox(true, 0);
      return;
    }

    refreshLightboxChrome();
    preloadUpcomingLightboxMedia();
    scheduleGridSync(0);
  }

  function preloadUpcomingLightboxMedia() {
    if (state.lightboxIndex < 0) return;

    const mediaItems = getViewerItems();
    for (let offset = 1; offset <= LIGHTBOX_IMAGE_PRELOAD_COUNT; offset += 1) {
      const item = mediaItems[state.lightboxIndex + offset];
      if (!item || state.preloadCache.has(item.key)) continue;

      const preload = new Image();
      preload.decoding = 'async';
      preload.referrerPolicy = 'no-referrer';
      preload.src = item.kind === 'image' ? item.originalUrl : item.displayUrl;
      state.preloadCache.set(item.key, preload);
    }

    while (state.preloadCache.size > 16) {
      const oldestKey = state.preloadCache.keys().next().value;
      state.preloadCache.delete(oldestKey);
    }
  }

  function onLightboxImageError(event) {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.fallbackUsed === '1') return;

    const fallbackUrl = image.dataset.fallbackUrl;
    if (!fallbackUrl || fallbackUrl === image.src) return;
    image.dataset.fallbackUsed = '1';
    image.src = fallbackUrl;
  }

  function normalizeWheelDelta(event, viewportHeight) {
    const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return rawDelta * 18;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return rawDelta * viewportHeight;
    return rawDelta;
  }

  function onLightboxWheel(event) {
    if (!isLightboxOpen() || event.ctrlKey || event.metaKey) return;
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return;

    const delta = normalizeWheelDelta(event, overlay.clientHeight);
    if (!Number.isFinite(delta) || delta === 0) return;

    event.preventDefault();
    event.stopPropagation();
    state.lightboxManualBoardScroll = true;
    markUserBoardScrollIntent();
    overlay.scrollTop = clamp(
      overlay.scrollTop + delta,
      0,
      Math.max(0, overlay.scrollHeight - overlay.clientHeight),
    );
    window.requestAnimationFrame(() => maybeRequestMoreAtBoardEnd('lightbox-board-end'));
  }

  Object.assign(app.modules.lightbox, {
    setLightboxImageLink,
    restoreLightboxFocus,
    openLightbox,
    scheduleGridSync,
    closeLightbox,
    isLightboxOpen,
    moveLightbox,
    renderLightboxPreview,
    refreshLightboxPreviews,
    animateLightboxTransition,
    updateLightbox,
    refreshLightboxChrome,
    pulseLoadMoreButton,
    reconcileLightboxAfterItemsChange,
    preloadUpcomingLightboxMedia,
    onLightboxImageError,
    normalizeWheelDelta,
    onLightboxWheel,
  });
})();
