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
  app.modules.board ||= {};

  function captureXPageScrollPosition(...args) { return app.modules.loading.captureXPageScrollPosition(...args); }
  function clearVideoSourceProbe(...args) { return app.modules.video.clearVideoSourceProbe(...args); }
  function closeLightbox(...args) { return app.modules.lightbox.closeLightbox(...args); }
  function delay(...args) { return app.modules.routing.delay(...args); }
  function el(...args) { return app.modules.dom.el(...args); }
  function formatDate(...args) { return app.modules.dom.formatDate(...args); }
  function getLoadController() { return app.modules.loading.getLoadController(); }
  function isLightboxOpen(...args) { return app.modules.lightbox.isLightboxOpen(...args); }
  function isLikesPage(...args) { return app.modules.dom.isLikesPage(...args); }
  function maybeRequestMoreAtBoardEnd(...args) { return app.modules.loading.maybeRequestMoreAtBoardEnd(...args); }
  function moveLightbox(...args) { return app.modules.lightbox.moveLightbox(...args); }
  function onLightboxImageError(...args) { return app.modules.lightbox.onLightboxImageError(...args); }
  function onLightboxVideoError(...args) { return app.modules.video.onLightboxVideoError(...args); }
  function onLightboxWheel(...args) { return app.modules.lightbox.onLightboxWheel(...args); }
  function openLightbox(...args) { return app.modules.lightbox.openLightbox(...args); }
  function reconcileLightboxAfterItemsChange(...args) { return app.modules.lightbox.reconcileLightboxAfterItemsChange(...args); }
  function releaseRetainedVideoElement(...args) { return app.modules.video.releaseRetainedVideoElement(...args); }
  function requestMoreFromX(...args) { return app.modules.loading.requestMoreFromX(...args); }
  function restoreXPageScrollPosition(...args) { return app.modules.loading.restoreXPageScrollPosition(...args); }
  function scanTweets(...args) { return app.modules.dom.scanTweets(...args); }
  function scheduleGridSync(...args) { return app.modules.lightbox.scheduleGridSync(...args); }
  function unwatchVideoSource(...args) { return app.modules.video.unwatchVideoSource(...args); }
  function unregisterItemIndexes(...args) { return app.modules.dom.unregisterItemIndexes(...args); }
  function reindexItemPositions(...args) { return app.modules.dom.reindexItemPositions(...args); }

  function getBoardDistanceFromEnd() {
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return null;
    return Math.max(0, overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight);
  }

  function updateLauncherState() {
    const launcher = document.getElementById(`${APP_ID}-launcher`);
    if (!(launcher instanceof HTMLButtonElement)) return;
    launcher.textContent = state.active ? '← Xの表示に戻る' : '▦ いいねビューに変える';
    launcher.title = state.active
      ? 'ボードを閉じてXのいいね欄へ戻る'
      : 'いいねしたメディアをボード表示に切り替える';
    launcher.setAttribute('aria-pressed', state.active ? 'true' : 'false');
    launcher.classList.toggle(`${APP_ID}-board-active`, state.active);
  }

  function toggleOverlay() {
    if (state.active) closeOverlay();
    else openOverlay();
  }

  function createLauncher() {
    let launcher = document.getElementById(`${APP_ID}-launcher`);
    if (launcher) {
      updateLauncherState();
      return launcher;
    }

    launcher = el('button');
    launcher.id = `${APP_ID}-launcher`;
    launcher.type = 'button';
    launcher.addEventListener('click', toggleOverlay);
    document.body.appendChild(launcher);
    updateLauncherState();
    return launcher;
  }

  function createOverlay() {
    let overlay = document.getElementById(`${APP_ID}-overlay`);
    if (overlay) return overlay;

    overlay = el('section');
    overlay.id = `${APP_ID}-overlay`;
    overlay.setAttribute('aria-label', 'X Likes Media Masonry Viewer');


    const content = el('main', `${APP_ID}-content`);
    const grid = el('div', `${APP_ID}-grid`);
    grid.id = `${APP_ID}-grid`;

    const empty = el('div', `${APP_ID}-empty`);
    empty.id = `${APP_ID}-empty`;
    const emptyTitle = el('strong', '', 'まだ画像・動画を取得できていません');
    empty.append(
      emptyTitle,
      document.createTextNode('Xのいいね欄が表示されるまで待ち、拡張機能メニューの「画面内を再走査」を押してください。ボードの最下部までスクロールすると、続きの読み込みを開始します。'),
    );

    const loadZone = el('div', `${APP_ID}-load-zone`, '最下部までスクロールすると続きを読み込みます。拡張機能メニューの「さらに読み込む」からも実行できます。');
    loadZone.id = `${APP_ID}-load-zone`;
    loadZone.setAttribute('aria-live', 'polite');

    content.append(grid, empty, loadZone);

    const lightbox = el('div');
    lightbox.id = `${APP_ID}-lightbox`;
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-label', 'メディアの拡大表示');
    lightbox.setAttribute('aria-describedby', `${APP_ID}-lightbox-scroll-hint`);

    const lightboxBackdrop = el('button', `${APP_ID}-lightbox-backdrop`);
    lightboxBackdrop.type = 'button';
    lightboxBackdrop.title = '拡大表示を閉じる';
    lightboxBackdrop.addEventListener('click', closeLightbox);

    const lightboxStage = el('div', `${APP_ID}-lightbox-stage`);
    lightboxStage.id = `${APP_ID}-lightbox-stage`;

    const previousPreview = el('div', `${APP_ID}-lightbox-preview ${APP_ID}-lightbox-preview-prev`);
    previousPreview.id = `${APP_ID}-lightbox-preview-prev`;
    const previousPreviewImage = el('img', `${APP_ID}-lightbox-preview-image`);
    previousPreviewImage.id = `${APP_ID}-lightbox-preview-prev-image`;
    previousPreviewImage.alt = '';
    previousPreviewImage.decoding = 'async';
    previousPreviewImage.referrerPolicy = 'no-referrer';
    previousPreviewImage.tabIndex = -1;
    previousPreviewImage.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveLightbox(-1);
    });
    previousPreview.append(previousPreviewImage);

    const currentPane = el('div', `${APP_ID}-lightbox-current`);
    currentPane.id = `${APP_ID}-lightbox-current`;

    const lightboxImageLink = el('a', `${APP_ID}-lightbox-image-link`);
    lightboxImageLink.id = `${APP_ID}-lightbox-image-link`;
    lightboxImageLink.target = '_blank';
    lightboxImageLink.rel = 'noopener noreferrer';
    lightboxImageLink.title = '元の投稿を新しいタブで開く';

    const lightboxImage = el('img', `${APP_ID}-lightbox-image`);
    lightboxImage.id = `${APP_ID}-lightbox-image`;
    lightboxImage.alt = '';
    lightboxImage.decoding = 'async';
    lightboxImage.referrerPolicy = 'no-referrer';
    lightboxImage.addEventListener('error', onLightboxImageError);
    lightboxImageLink.appendChild(lightboxImage);

    const lightboxVideo = el('video', `${APP_ID}-lightbox-video`);
    lightboxVideo.id = `${APP_ID}-lightbox-video`;
    lightboxVideo.controls = true;
    lightboxVideo.playsInline = true;
    lightboxVideo.preload = 'metadata';
    lightboxVideo.addEventListener('error', onLightboxVideoError);

    const lightboxVideoError = el('div', `${APP_ID}-lightbox-video-error`);
    lightboxVideoError.id = `${APP_ID}-lightbox-video-error`;
    const lightboxVideoErrorText = el('span', `${APP_ID}-lightbox-video-error-text`, '');
    lightboxVideoErrorText.id = `${APP_ID}-lightbox-video-error-text`;
    const lightboxVideoOpenX = el('a', `${APP_ID}-lightbox-video-open-x`, 'Xで再生する');
    lightboxVideoOpenX.id = `${APP_ID}-lightbox-video-open-x`;
    lightboxVideoOpenX.target = '_blank';
    lightboxVideoOpenX.rel = 'noopener noreferrer';
    lightboxVideoError.append(lightboxVideoErrorText, lightboxVideoOpenX);

    currentPane.append(lightboxImageLink, lightboxVideo, lightboxVideoError);

    const nextPreview = el('div', `${APP_ID}-lightbox-preview ${APP_ID}-lightbox-preview-next`);
    nextPreview.id = `${APP_ID}-lightbox-preview-next`;
    const nextPreviewImage = el('img', `${APP_ID}-lightbox-preview-image`);
    nextPreviewImage.id = `${APP_ID}-lightbox-preview-next-image`;
    nextPreviewImage.alt = '';
    nextPreviewImage.decoding = 'async';
    nextPreviewImage.referrerPolicy = 'no-referrer';
    nextPreviewImage.tabIndex = -1;
    nextPreviewImage.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveLightbox(1);
    });
    nextPreview.append(nextPreviewImage);

    lightboxStage.append(previousPreview, currentPane, nextPreview);

    const lightboxClose = el('button', `${APP_ID}-lightbox-close`, '×');
    lightboxClose.id = `${APP_ID}-lightbox-close`;
    lightboxClose.type = 'button';
    lightboxClose.title = '閉じる（Esc）';
    lightboxClose.addEventListener('click', closeLightbox);


    const lightboxInfo = el('div', `${APP_ID}-lightbox-info`, '');
    lightboxInfo.id = `${APP_ID}-lightbox-info`;

    const lightboxScrollHint = el(
      'div',
      `${APP_ID}-lightbox-scroll-hint`,
      'ホイール／↑↓キー：背景ボードをスクロール',
    );
    lightboxScrollHint.id = `${APP_ID}-lightbox-scroll-hint`;
    lightboxScrollHint.title = '拡大表示を開いたままホイールまたは上下キーで背景ボードを移動できます。↓キーを押し続けると連続スクロールし、1回の長押しにつき最大3回まで続きを自動読込します。';

    const lightboxLoadMore = el('button', `${APP_ID}-lightbox-loadmore`);
    lightboxLoadMore.id = `${APP_ID}-lightbox-loadmore`;
    lightboxLoadMore.type = 'button';
    lightboxLoadMore.setAttribute('aria-label', '続きを読み込む');
    const lightboxLoadMoreLabel = el('span', `${APP_ID}-lightbox-loadmore-label`, '続きを読み込む');
    const lightboxLoadMoreTooltip = el(
      'span',
      `${APP_ID}-lightbox-loadmore-tooltip`,
      'すぐに続きを取得したい場合に使用します。背景ボードを最下部までスクロールした場合も、自動で新しい画像・動画を読み込みます。表示中のメディアは維持されます。',
    );
    lightboxLoadMore.append(lightboxLoadMoreLabel, lightboxLoadMoreTooltip);
    lightboxLoadMore.addEventListener('click', () => requestMoreFromX({ source: 'lightbox-button' }));

    lightbox.append(
      lightboxBackdrop,
      lightboxStage,
      lightboxClose,
      lightboxInfo,
      lightboxScrollHint,
      lightboxLoadMore,
    );
    lightbox.addEventListener('wheel', onLightboxWheel, { passive: false });

    const toast = el('div');
    toast.id = `${APP_ID}-toast`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.hidden = true;

    overlay.append(content, lightbox, toast);
    overlay.addEventListener('wheel', onOverlayWheel, { passive: true });
    overlay.addEventListener('pointerdown', markUserBoardScrollIntent, { passive: true });
    overlay.addEventListener('touchstart', markUserBoardScrollIntent, { passive: true });
    overlay.addEventListener('scroll', onOverlayScroll, { passive: true });
    document.body.appendChild(overlay);
    applyPreviewTransparencySetting();

    return overlay;
  }

  function hideToast() {
    window.clearTimeout(state.toastTimer);
    state.toastTimer = 0;
    const toast = document.getElementById(`${APP_ID}-toast`);
    if (!(toast instanceof HTMLElement)) return;
    toast.classList.remove(`${APP_ID}-show`, `${APP_ID}-toast-loading`, `${APP_ID}-toast-error`);
    toast.hidden = true;
    toast.textContent = '';
  }

  function showToast(message, options = {}) {
    const toast = document.getElementById(`${APP_ID}-toast`);
    if (!(toast instanceof HTMLElement) || !state.active) return;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = 0;
    const tone = options.tone || 'info';
    toast.hidden = false;
    toast.textContent = String(message || '');
    toast.classList.toggle(`${APP_ID}-toast-loading`, tone === 'loading');
    toast.classList.toggle(`${APP_ID}-toast-error`, tone === 'error');
    window.requestAnimationFrame(() => toast.classList.add(`${APP_ID}-show`));
    const duration = Number(options.duration) || 0;
    if (duration > 0) state.toastTimer = window.setTimeout(hideToast, duration);
  }

  function detectLightTheme() {
    const bodyColor = getComputedStyle(document.body).backgroundColor;
    const match = bodyColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return false;
    const [, r, g, b] = match.map(Number);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55;
  }

  function getPreviewOpacity() {
    return clamp((100 - Number(state.settings.previewTransparency || 0)) / 100, .08, 1);
  }

  function applyPreviewTransparencySetting() {
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return;
    overlay.style.setProperty('--xlg-preview-opacity', String(getPreviewOpacity()));
  }

  function openOverlay() {
    if (!isLikesPage()) return;

    if (!state.active) captureXPageScrollPosition();
    const overlay = createOverlay();
    overlay.classList.toggle(`${APP_ID}-light`, detectLightTheme());
    applyPreviewTransparencySetting();
    overlay.classList.add(`${APP_ID}-open`);
    document.documentElement.classList.add(`${APP_ID}-hide-page-scrollbar`);
    state.active = true;
    updateLauncherState();
    setStatus('メディアを走査中…');
    scanTweets();
    scheduleRelayout(0);
    ensureCardObserver();
    setTimeout(() => setStatus(''), 700);
  }

  function closeOverlay(options = {}) {
    const wasActive = state.active;
    closeLightbox();
    getLoadController()?.cancel('board-closed');
    clearPendingBoardRestore();
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (overlay) overlay.classList.remove(`${APP_ID}-open`);
    document.documentElement.classList.remove(`${APP_ID}-hide-page-scrollbar`);
    state.active = false;
    updateLauncherState();
    hideToast();
    setStatus('');

    if (wasActive && options.restoreXScroll !== false) {
      restoreXPageScrollPosition();
    } else if (options.restoreXScroll === false) {
      cancelPendingXPageRestore?.();
      cancelPendingXPageRestore = null;
      state.xPageScrollTopOnBoardOpen = null;
    }
  }

  function setStatus(message) {
    state.statusMessage = String(message || '');
    const status = document.getElementById(`${APP_ID}-status`);
    if (status) status.textContent = state.statusMessage;
  }

  function updateCount() {
    const count = document.getElementById(`${APP_ID}-count`);
    if (count) count.textContent = `${state.items.length}件`;

    const empty = document.getElementById(`${APP_ID}-empty`);
    if (empty) empty.style.display = state.items.length ? 'none' : 'block';
  }

  function createCard(item) {
    const card = el('article', `${APP_ID}-card ${APP_ID}-virtual-placeholder`);
    card.dataset.kind = item.kind;
    card.dataset.order = String(item.order);
    card.dataset.itemKey = item.key;
    card.style.aspectRatio = String(item.ratio || 1);
    return card;
  }

  function createCardContents(item) {
    const mediaButton = el('button', `${APP_ID}-media-wrap`);
    mediaButton.type = 'button';
    mediaButton.title = item.kind === 'image'
      ? 'この画面で拡大表示'
      : 'この画面で動画/GIFを再生';
    mediaButton.addEventListener('click', () => openLightbox(item));

    const image = el('img', `${APP_ID}-image`);
    image.alt = item.tweetText || (item.kind === 'video'
      ? 'Xでいいねした動画/GIFのサムネイル'
      : 'Xでいいねした画像');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.fetchPriority = 'low';
    image.style.aspectRatio = String(item.ratio || (item.kind === 'video' ? 16 / 9 : 1));
    image.addEventListener('load', () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        item.ratio = clamp(image.naturalWidth / image.naturalHeight, 0.08, 12);
      }
      image.style.removeProperty('aspect-ratio');
      item.card.style.removeProperty('height');
      item.card.style.removeProperty('aspect-ratio');
      item.measuredWidth = item.card.getBoundingClientRect().width;
      item.measuredHeight = item.card.getBoundingClientRect().height;
      scheduleLayoutHeightRefresh();
    }, { once: true });
    image.addEventListener('error', () => {
      image.alt = item.kind === 'video'
        ? '動画/GIFのサムネイルを読み込めませんでした。'
        : '画像を読み込めませんでした。';
      mediaButton.title = image.alt;
    }, { once: true });
    image.src = item.displayUrl;
    mediaButton.appendChild(image);

    if (item.kind === 'video') {
      mediaButton.appendChild(el('span', `${APP_ID}-badge`, item.isGif ? 'GIF' : '動画'));
      mediaButton.appendChild(el('span', `${APP_ID}-video-playmark`, '▶'));
    }

    const hoverInfo = el('div', `${APP_ID}-hover-info`);
    const hoverAuthor = el('div', `${APP_ID}-hover-author`, item.author || '投稿者不明');
    const hoverDate = el('div', `${APP_ID}-hover-date`, formatDate(item.dateText));
    hoverInfo.append(hoverAuthor, hoverDate);
    mediaButton.appendChild(hoverInfo);
    return mediaButton;
  }

  function hydrateCard(item) {
    if (!item?.card || item.hydrated) return;
    cancelCardUnload(item.key);

    item.hydrated = true;
    item.card.classList.remove(`${APP_ID}-virtual-placeholder`);
    item.card.style.removeProperty('height');
    item.card.style.aspectRatio = String(item.ratio || 1);
    item.card.replaceChildren(createCardContents(item));
  }

  function dehydrateCard(item) {
    if (!item?.card || !item.hydrated) return;
    if (item.key === state.currentGridCardKey || item.key === state.lightboxItemKey) return;

    const rect = item.card.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      item.measuredWidth = rect.width;
      item.measuredHeight = rect.height;
    }
    item.hydrated = false;
    item.card.replaceChildren();
    item.card.classList.add(`${APP_ID}-virtual-placeholder`);
    if (item.measuredHeight > 0) item.card.style.height = `${Math.ceil(item.measuredHeight)}px`;
    else item.card.style.aspectRatio = String(item.ratio || 1);
  }

  function scheduleCardUnloadSweep() {
    window.clearTimeout(state.cardUnloadSweepTimer);
    state.cardUnloadSweepTimer = 0;
    if (!state.cardUnloadQueue.size) return;
    const now = Date.now();
    let nextDueAt = Infinity;
    for (const dueAt of state.cardUnloadQueue.values()) nextDueAt = Math.min(nextDueAt, dueAt);
    state.cardUnloadSweepTimer = window.setTimeout(
      runCardUnloadSweep,
      Math.max(0, nextDueAt - now),
    );
  }

  function runCardUnloadSweep() {
    state.cardUnloadSweepTimer = 0;
    const now = Date.now();
    for (const [itemKey, dueAt] of Array.from(state.cardUnloadQueue.entries())) {
      if (dueAt > now) continue;
      state.cardUnloadQueue.delete(itemKey);
      const item = state.itemMap.get(itemKey);
      if (item) dehydrateCard(item);
    }
    scheduleCardUnloadSweep();
  }

  function queueCardUnload(item) {
    if (!item?.key) return;
    state.cardUnloadQueue.set(item.key, Date.now() + CARD_UNLOAD_DELAY_MS);
    scheduleCardUnloadSweep();
  }

  function cancelCardUnload(itemKey) {
    if (!itemKey || !state.cardUnloadQueue.delete(itemKey)) return;
    scheduleCardUnloadSweep();
  }

  function clearCardUnloadQueue() {
    window.clearTimeout(state.cardUnloadSweepTimer);
    state.cardUnloadSweepTimer = 0;
    state.cardUnloadQueue.clear();
  }

  function ensureCardObserver() {
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return;
    state.cardObserver?.disconnect();
    state.cardObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const key = entry.target.dataset.itemKey;
        const item = state.itemMap.get(key);
        if (!item) continue;

        if (entry.isIntersecting) {
          hydrateCard(item);
          continue;
        }

        queueCardUnload(item);
      }
    }, {
      root: overlay,
      rootMargin: `${CARD_VIRTUAL_ROOT_MARGIN_PX}px 0px`,
      threshold: 0.001,
    });

    for (const item of state.items) state.cardObserver.observe(item.card);
  }

  function observeCard(item) {
    if (!state.cardObserver) ensureCardObserver();
    state.cardObserver?.observe(item.card);
  }

  function getViewerItems() {
    return state.items;
  }

  function markProgrammaticBoardScroll(duration = PROGRAMMATIC_SCROLL_SUPPRESS_MS) {
    state.suppressBottomLoadUntil = Math.max(
      state.suppressBottomLoadUntil,
      Date.now() + duration,
    );
  }

  function clearPendingBoardRestore() {
    window.clearTimeout(state.pendingBoardRestoreTimer);
    state.pendingBoardRestoreTimer = 0;
    state.pendingBoardRestoreTop = null;
    state.pendingBoardRestoreUntil = 0;
  }

  function markUserBoardScrollIntent() {
    state.lastUserBoardScrollAt = Date.now();
    if (!isLightboxOpen()) clearPendingBoardRestore();
  }

  function restoreBoardScrollPosition(scrollTop) {
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return;

    const targetTop = Math.max(0, Number(scrollTop) || 0);
    state.pendingBoardRestoreTop = targetTop;
    state.pendingBoardRestoreUntil = Date.now() + 1100;
    window.clearTimeout(state.pendingBoardRestoreTimer);

    const applyRestore = () => {
      if (!(overlay instanceof HTMLElement) || !overlay.isConnected) return;
      if (state.pendingBoardRestoreTop === null) return;
      markProgrammaticBoardScroll();
      overlay.scrollTop = state.pendingBoardRestoreTop;
    };

    applyRestore();
    window.requestAnimationFrame(applyRestore);
    window.setTimeout(applyRestore, 120);
    window.setTimeout(applyRestore, 360);
    state.pendingBoardRestoreTimer = window.setTimeout(() => {
      applyRestore();
      state.pendingBoardRestoreTimer = 0;
      state.pendingBoardRestoreTop = null;
      state.pendingBoardRestoreUntil = 0;
    }, 900);
  }

  function highlightGridCard(itemKey, clearHighlightAfterMs = 1400) {
    if (!itemKey) return;
    const card = state.itemMap.get(itemKey)?.card;
    if (!(card instanceof HTMLElement)) return;

    if (state.currentGridCardKey && state.currentGridCardKey !== itemKey) {
      state.itemMap.get(state.currentGridCardKey)?.card?.classList.remove(`${APP_ID}-current-card`);
    }

    card.classList.add(`${APP_ID}-current-card`);
    state.currentGridCardKey = itemKey;
    window.clearTimeout(state.gridHighlightTimer);
    if (clearHighlightAfterMs > 0) {
      state.gridHighlightTimer = window.setTimeout(() => {
        card.classList.remove(`${APP_ID}-current-card`);
        if (state.currentGridCardKey === itemKey) state.currentGridCardKey = '';
      }, clearHighlightAfterMs);
    }
  }

  function syncGridToLightboxItem(itemKey, options = {}) {
    if (!itemKey) return;

    const overlay = document.getElementById(`${APP_ID}-overlay`);
    const item = state.itemMap.get(itemKey);
    const card = item?.card;
    if (!(overlay instanceof HTMLElement) || !(card instanceof HTMLElement)) return;

    hydrateCard(item);

    if (!card.isConnected) {
      scheduleRelayout(0);
      return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const topInset = 0;
    const verticalPadding = 14;
    const usableHeight = Math.max(1, overlay.clientHeight - topInset - verticalPadding * 2);

    const desiredOffset = cardRect.height <= usableHeight
      ? topInset + verticalPadding + Math.max(0, (usableHeight - cardRect.height) / 2)
      : topInset + verticalPadding;
    const targetTop = Math.max(
      0,
      overlay.scrollTop + cardRect.top - overlayRect.top - desiredOffset,
    );

    markProgrammaticBoardScroll();
    overlay.scrollTo({
      top: targetTop,
      behavior: options.behavior || 'auto',
    });

    highlightGridCard(itemKey, options.clearHighlightAfterMs || 0);
  }

  function removeVideoItems() {
    const remaining = [];
    for (const item of state.items) {
      if (item.kind === 'video') {
        state.cardObserver?.unobserve(item.card);
        cancelCardUnload(item.key);
        item.card?.remove();
        state.seen.delete(item.key);
        unregisterItemIndexes(item);
        clearVideoSourceProbe(item.key);
        const source = state.retainedVideoElements.get(item.key) || item.sourceVideoRef?.deref?.();
        if (source instanceof HTMLVideoElement) unwatchVideoSource(source);
        releaseRetainedVideoElement(item.key, source);
      } else {
        remaining.push(item);
      }
    }
    state.items = remaining;
    reindexItemPositions(0);
    state.laidOutCount = 0;
    updateCount();
    reconcileLightboxAfterItemsChange();
    scheduleRelayout(0);
  }

  function scheduleRelayout(delay = 80) {
    window.clearTimeout(state.relayoutTimer);
    state.relayoutTimer = window.setTimeout(relayout, delay);
  }

  function getDesiredColumnCount(grid) {
    const availableWidth = Math.max(grid.clientWidth, 1);
    return clamp(
      Math.floor((availableWidth + GRID_GAP_PX) / (state.settings.cardWidth + GRID_GAP_PX)),
      1,
      12,
    );
  }

  function estimateItemHeight(item, columnWidth) {
    if (item.measuredWidth > 0 && item.measuredHeight > 0) {
      return Math.max(60, item.measuredHeight * (columnWidth / item.measuredWidth));
    }
    return Math.max(60, columnWidth / clamp(item.ratio || 1, 0.08, 12));
  }

  function scheduleLayoutHeightRefresh() {
    window.clearTimeout(state.layoutHeightTimer);
    state.layoutHeightTimer = window.setTimeout(() => {
      state.layoutHeights = state.layoutColumns.map((column) => column.scrollHeight);
    }, 180);
  }

  function prepareCardForColumn(item, columnWidth) {
    if (item.hydrated) {
      item.card.style.removeProperty('height');
      return;
    }
    item.card.style.removeProperty('height');
    item.card.style.aspectRatio = String(item.ratio || 1);
    if (item.measuredWidth > 0 && item.measuredHeight > 0) {
      const scaledHeight = item.measuredHeight * (columnWidth / item.measuredWidth);
      item.card.style.height = `${Math.max(60, Math.ceil(scaledHeight))}px`;
      item.card.style.removeProperty('aspect-ratio');
    }
  }

  function appendNewItemsToLayout() {
    const grid = document.getElementById(`${APP_ID}-grid`);
    if (!(grid instanceof HTMLElement) || !state.active) return;

    const desiredColumnCount = getDesiredColumnCount(grid);
    if (
      state.layoutColumnCount !== desiredColumnCount ||
      state.layoutColumns.length !== desiredColumnCount ||
      !state.layoutColumns.every((column) => column.isConnected)
    ) {
      scheduleRelayout(0);
      return;
    }

    if (state.laidOutCount >= state.items.length) return;
    const columnWidth = Math.max(
      1,
      (grid.clientWidth - GRID_GAP_PX * (desiredColumnCount - 1)) / desiredColumnCount,
    );

    for (let index = state.laidOutCount; index < state.items.length; index += 1) {
      const item = state.items[index];
      prepareCardForColumn(item, columnWidth);
      let targetIndex = 0;
      for (let columnIndex = 1; columnIndex < state.layoutHeights.length; columnIndex += 1) {
        if (state.layoutHeights[columnIndex] < state.layoutHeights[targetIndex]) {
          targetIndex = columnIndex;
        }
      }
      state.layoutColumns[targetIndex].appendChild(item.card);
      state.layoutHeights[targetIndex] += estimateItemHeight(item, columnWidth) + GRID_GAP_PX;
      observeCard(item);
    }
    state.laidOutCount = state.items.length;
    scheduleLayoutHeightRefresh();
  }

  function relayout() {
    const grid = document.getElementById(`${APP_ID}-grid`);
    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(grid instanceof HTMLElement) || !(overlay instanceof HTMLElement) || !state.active) return;

    const previousScrollTop = overlay.scrollTop;
    const overlayRect = overlay.getBoundingClientRect();
    const visibleTop = overlayRect.top + 54;

    let anchorCard = null;
    let anchorOffset = 0;
    for (const item of state.items) {
      const rect = item.card?.getBoundingClientRect();
      if (rect && rect.bottom > visibleTop) {
        anchorCard = item.card;
        anchorOffset = rect.top - overlayRect.top;
        break;
      }
    }

    const columnCount = getDesiredColumnCount(grid);
    const columnWidth = Math.max(
      1,
      (grid.clientWidth - GRID_GAP_PX * (columnCount - 1)) / columnCount,
    );
    const fragment = document.createDocumentFragment();
    const columns = [];
    const heights = Array(columnCount).fill(0);

    for (let index = 0; index < columnCount; index += 1) {
      const column = el('div', `${APP_ID}-column`);
      columns.push(column);
      fragment.appendChild(column);
    }

    state.cardObserver?.disconnect();
    grid.replaceChildren(fragment);

    for (const item of state.items) {
      prepareCardForColumn(item, columnWidth);
      let targetIndex = 0;
      for (let index = 1; index < heights.length; index += 1) {
        if (heights[index] < heights[targetIndex]) targetIndex = index;
      }
      columns[targetIndex].appendChild(item.card);
      heights[targetIndex] += estimateItemHeight(item, columnWidth) + GRID_GAP_PX;
    }

    state.layoutColumns = columns;
    state.layoutHeights = heights;
    state.layoutColumnCount = columnCount;
    state.laidOutCount = state.items.length;
    ensureCardObserver();

    if (
      state.pendingBoardRestoreTop !== null
      && Date.now() <= state.pendingBoardRestoreUntil
    ) {
      markProgrammaticBoardScroll();
      overlay.scrollTop = state.pendingBoardRestoreTop;
      window.requestAnimationFrame(() => {
        if (state.pendingBoardRestoreTop !== null) {
          overlay.scrollTop = state.pendingBoardRestoreTop;
        }
      });
      scheduleLayoutHeightRefresh();
      return;
    }

    // DOMの再配置中にscrollTopが丸められるため、以前の位置と表示中カードを基準に復元する。
    markProgrammaticBoardScroll();
    overlay.scrollTop = previousScrollTop;
    if (anchorCard) {
      window.requestAnimationFrame(() => {
        if (!anchorCard.isConnected || !state.active) return;
        const newOffset = anchorCard.getBoundingClientRect().top - overlay.getBoundingClientRect().top;
        overlay.scrollTop = Math.max(0, previousScrollTop + (newOffset - anchorOffset));
        if (isLightboxOpen() && state.lightboxItemKey) scheduleGridSync(0);
      });
    } else if (isLightboxOpen() && state.lightboxItemKey) {
      scheduleGridSync(0);
    }
    scheduleLayoutHeightRefresh();
  }

  function onOverlayWheel(event) {
    if (event.ctrlKey || event.metaKey) return;
    markUserBoardScrollIntent();
    window.requestAnimationFrame(() => maybeRequestMoreAtBoardEnd('board-end'));
  }

  function onOverlayScroll() {
    maybeRequestMoreAtBoardEnd(isLightboxOpen() ? 'lightbox-board-end' : 'board-end');
  }

  function updateLoadZone(message = '') {
    const loadZone = document.getElementById(`${APP_ID}-load-zone`);
    if (!loadZone) return;
    loadZone.textContent = message || '最下部までスクロールすると続きを読み込みます。拡張機能メニューの「さらに読み込む」からも実行できます。';
  }

  Object.assign(app.modules.board, {
    getBoardDistanceFromEnd,
    updateLauncherState,
    toggleOverlay,
    createLauncher,
    createOverlay,
    hideToast,
    showToast,
    detectLightTheme,
    getPreviewOpacity,
    applyPreviewTransparencySetting,
    openOverlay,
    closeOverlay,
    setStatus,
    updateCount,
    createCard,
    createCardContents,
    hydrateCard,
    dehydrateCard,
    scheduleCardUnloadSweep,
    runCardUnloadSweep,
    queueCardUnload,
    cancelCardUnload,
    clearCardUnloadQueue,
    ensureCardObserver,
    observeCard,
    getViewerItems,
    markProgrammaticBoardScroll,
    clearPendingBoardRestore,
    markUserBoardScrollIntent,
    restoreBoardScrollPosition,
    highlightGridCard,
    syncGridToLightboxItem,
    removeVideoItems,
    scheduleRelayout,
    getDesiredColumnCount,
    estimateItemHeight,
    scheduleLayoutHeightRefresh,
    prepareCardForColumn,
    appendNewItemsToLayout,
    relayout,
    onOverlayWheel,
    onOverlayScroll,
    updateLoadZone,
  });
})();
