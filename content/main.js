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
  const { sanitizeDiagnosticText, recordError, getDiagnostics, recordRuntimeErrorEvent, isExtensionScriptErrorEvent } = app.diagnosticsApi;
  app.modules ||= {};
  app.modules.main ||= {};

  const loadController = app.modules.loading.getLoadController();

  function cleanupActiveVideoSession(...args) { return app.modules.video.cleanupActiveVideoSession(...args); }
  function clearCollectedMedia(...args) { return app.modules.routing.clearCollectedMedia(...args); }
  function closeLightbox(...args) { return app.modules.lightbox.closeLightbox(...args); }
  function closeOverlay(...args) { return app.modules.board.closeOverlay(...args); }
  function createLauncher(...args) { return app.modules.board.createLauncher(...args); }
  function createOverlay(...args) { return app.modules.board.createOverlay(...args); }
  function extractItemsFromTweet(...args) { return app.modules.dom.extractItemsFromTweet(...args); }
  function findSourceVideoForItem(...args) { return app.modules.video.findSourceVideoForItem(...args); }
  function getPopupState(...args) { return app.modules.routing.getPopupState(...args); }
  function getTweetUrl(...args) { return app.modules.dom.getTweetUrl(...args); }
  function buildMediaKey(...args) { return app.modules.dom.buildMediaKey(...args); }
  function getItemIndex(...args) { return app.modules.dom.getItemIndex(...args); }
  function queueCardUnload(...args) { return app.modules.board.queueCardUnload(...args); }
  function clearCardUnloadQueue(...args) { return app.modules.board.clearCardUnloadQueue(...args); }
  function handleRouteChange(...args) { return app.modules.routing.handleRouteChange(...args); }
  function hideToast(...args) { return app.modules.board.hideToast(...args); }
  function installGlobalEvents(...args) { return app.modules.routing.installGlobalEvents(...args); }
  function installObserver(...args) { return app.modules.routing.installObserver(...args); }
  function installRuntimeMessaging(...args) { return app.modules.routing.installRuntimeMessaging(...args); }
  function isBorrowableVideoElement(...args) { return app.modules.video.isBorrowableVideoElement(...args); }
  function isLikesPage(...args) { return app.modules.dom.isLikesPage(...args); }
  function isLightboxOpen(...args) { return app.modules.lightbox.isLightboxOpen(...args); }
  function isLoadActive(...args) { return app.modules.loading.isLoadActive(...args); }
  function getBoardDistanceFromEnd(...args) { return app.modules.board.getBoardDistanceFromEnd(...args); }
  function getCurrentVideoDiagnostics(...args) { return app.modules.video.getCurrentVideoDiagnostics(...args); }
  function hasVideoSourceData(...args) { return app.modules.video.hasVideoSourceData(...args); }
  function mountBorrowedVideo(...args) { return app.modules.video.mountBorrowedVideo(...args); }
  function openLightbox(...args) { return app.modules.lightbox.openLightbox(...args); }
  function openOverlay(...args) { return app.modules.board.openOverlay(...args); }
  function playDirectVideoUrl(...args) { return app.modules.video.playDirectVideoUrl(...args); }
  function playVideoInLightbox(...args) { return app.modules.video.playVideoInLightbox(...args); }
  function preserveRemovedVideos(...args) { return app.modules.video.preserveRemovedVideos(...args); }
  function queueKeyboardLoadAfterCurrent(...args) { return app.modules.loading.queueKeyboardLoadAfterCurrent(...args); }
  function refreshVideoRetentionWindow(...args) { return app.modules.video.refreshVideoRetentionWindow(...args); }
  function requestMoreFromX(...args) { return app.modules.loading.requestMoreFromX(...args); }
  function scanTweets(...args) { return app.modules.dom.scanTweets(...args); }
  function showLightboxVideoFallback(...args) { return app.modules.video.showLightboxVideoFallback(...args); }
  function showToast(...args) { return app.modules.board.showToast(...args); }
  function stopKeyboardBoardScroll(...args) { return app.modules.routing.stopKeyboardBoardScroll(...args); }
  function suspendLikesPageWork(...args) { return app.modules.routing.suspendLikesPageWork(...args); }
  function updateLauncherState(...args) { return app.modules.board.updateLauncherState(...args); }
  function watchVideoSource(...args) { return app.modules.video.watchVideoSource(...args); }

  function installTestHooks() {
    if (globalThis.__LMM_TEST_MODE__ !== true) return;
    Object.defineProperty(globalThis, '__LMM_TEST_HOOKS__', {
      configurable: true,
      value: {
        state,
        getPopupState,
        getDiagnostics,
        recordError,
        recordRuntimeErrorEvent,
        isExtensionScriptErrorEvent,
        scanTweets,
        extractItemsFromTweet,
        getTweetUrl,
        buildMediaKey,
        getItemIndex,
        queueCardUnload,
        clearCardUnloadQueue,
        requestMoreFromX,
        queueKeyboardLoadAfterCurrent,
        loadController,
        openOverlay,
        closeOverlay,
        openLightbox,
        closeLightbox,
        showToast,
        hideToast,
        updateLauncherState,
        suspendLikesPageWork,
        watchVideoSource,
        findSourceVideoForItem,
        isBorrowableVideoElement,
        playVideoInLightbox,
        playDirectVideoUrl,
        mountBorrowedVideo,
        cleanupActiveVideoSession,
        showLightboxVideoFallback,
        preserveRemovedVideos,
        refreshVideoRetentionWindow,
        clearCollectedMedia,
        stopKeyboardBoardScroll,
      },
    });
  }

  function init() {
    createLauncher();
    createOverlay();
    installObserver();
    installGlobalEvents();
    installRuntimeMessaging();
    handleRouteChange();
  }

  async function start() {
    await loadSettings();
    installTestHooks();
    if (document.body) {
      init();
    } else {
      window.addEventListener('DOMContentLoaded', init, { once: true });
    }
  }

  Object.assign(app.modules.main, {
    installTestHooks,
    init,
    start,
  });

  Object.assign(app.runtime, {
    isLikesPage,
    isLightboxOpen,
    isLoadActive,
    getLoadController: () => loadController,
    getBoardDistanceFromEnd,
    getCurrentVideoDiagnostics,
    hasVideoSourceData,
  });

  start();
})();
