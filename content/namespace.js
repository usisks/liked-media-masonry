(() => {
  'use strict';

  const NAMESPACE = '__LIKED_MEDIA_MASONRY__';
  if (globalThis[NAMESPACE]) return;

  const APP_ID = 'xlg';
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'liked-media-masonry-settings-v2';
  const LEGACY_STORAGE_KEYS = ['x-likes-pinterest-viewer-settings-v1'];
  const TEST_MODE = globalThis.__LMM_TEST_MODE__ === true;
  const LOAD_COOLDOWN_MS = TEST_MODE ? 120 : 1800;
  const LOAD_MAX_WAIT_MS = TEST_MODE ? 900 : 10000;
  const LIGHTBOX_LOAD_AHEAD_COUNT = 8;
  const LIGHTBOX_IMAGE_PRELOAD_COUNT = 2;
  const SCAN_DEBOUNCE_MS = 80;
  const CARD_VIRTUAL_ROOT_MARGIN_PX = 1400;
  const CARD_UNLOAD_DELAY_MS = 900;
  const TIMELINE_OBSERVER_RETRY_MS = 700;
  const GRID_GAP_PX = 8;
  const BOARD_END_THRESHOLD_PX = 64;
  const BOARD_END_LOAD_COOLDOWN_MS = 1800;
  const USER_SCROLL_INTENT_MS = 1400;
  const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 700;
  const ROUTE_FALLBACK_CHECK_MS = 3000;
  const ROUTE_CHANGE_DEBOUNCE_MS = 80;
  const AUTO_LOAD_EMPTY_STREAK_THRESHOLD = 2;
  const AUTO_LOAD_BACKOFF_BASE_MS = 10000;
  const AUTO_LOAD_BACKOFF_MAX_MS = 60000;
  const LIGHTBOX_TRANSITION_MS = 180;
  const REBUILD_SCROLL_WAIT_MS = 1800;
  const KEYBOARD_SCROLL_LINE_STEP_PX = 132;
  const KEYBOARD_SCROLL_LINE_SPEED_PX_PER_SEC = 460;
  const KEYBOARD_SCROLL_PAGE_SPEED_PX_PER_SEC = 980;
  const KEYBOARD_HOLD_AUTO_LOAD_LIMIT = 3;
  const KEYBOARD_BOARD_END_THRESHOLD_PX = 360;
  const VIDEO_SOURCE_PROBE_DELAYS_MS = [180, 520, 1200];
  const VIDEO_RETAIN_LIMIT = 3;
  const VIDEO_DIRECT_READY_TIMEOUT_MS = TEST_MODE ? 180 : 1700;
  const VIDEO_BORROW_READY_TIMEOUT_MS = TEST_MODE ? 220 : 2400;
  const PREVIEW_TRANSPARENCY_DEFAULT = 0;
  const KEYBOARD_LOAD_RETRY_MS = TEST_MODE ? 80 : 420;
  const LOAD_QUEUED_REQUEST_DELAY_MS = TEST_MODE ? 40 : 220;
  const LOAD_RESULT_DISPLAY_MS = TEST_MODE ? 120 : 1800;
  const X_LOAD_DRIVER_INTERVAL_MS = TEST_MODE ? 80 : 650;
  const X_LOAD_BOUNCE_MIN_PX = 280;
  const X_LOAD_BOUNCE_MAX_PX = 720;
  const TOAST_RESULT_DISPLAY_MS = TEST_MODE ? 160 : 2800;
  const TOAST_ERROR_DISPLAY_MS = TEST_MODE ? 220 : 4200;

  const state = {
    active: false,
    routeKey: '',
    items: [],
    seen: new Set(),
    itemMap: new Map(),
    itemIndexMap: new Map(),
    mediaPathIndex: new Map(),
    observer: null,
    observerRoot: null,
    observerRetryTimer: 0,
    pendingArticles: new Set(),
    scanTimer: 0,
    relayoutTimer: 0,
    routeCheckTimer: 0,
    routeFallbackTimer: 0,
    lastLocation: location.href,
    xPageScrollTopOnBoardOpen: null,
    settings: {
      cardWidth: 300,
      includeVideo: false,
      closePositionBehavior: 'keep_scrolled_position',
      previewTransparency: PREVIEW_TRANSPARENCY_DEFAULT,
    },
    statusMessage: '',
    rebuildFromBeginningInProgress: false,
    lightboxTransitionTimer: 0,
    lightboxIndex: -1,
    lightboxItemKey: '',
    preloadCache: new Map(),
    gridSyncTimer: 0,
    currentGridCardKey: '',
    gridHighlightTimer: 0,
    cardObserver: null,
    cardUnloadQueue: new Map(),
    cardUnloadSweepTimer: 0,
    layoutColumns: [],
    layoutHeights: [],
    layoutColumnCount: 0,
    laidOutCount: 0,
    layoutHeightTimer: 0,
    activeVideoSession: null,
    lightboxOpenScrollTop: 0,
    lightboxManualBoardScroll: false,
    lastUserBoardScrollAt: 0,
    suppressBottomLoadUntil: 0,
    pendingBoardRestoreTop: null,
    pendingBoardRestoreUntil: 0,
    pendingBoardRestoreTimer: 0,
    recentErrors: [],
    videoVault: null,
    retainedVideoElements: new Map(),
    videoProbeTimers: new Map(),
    videoWatchControllers: new WeakMap(),
    videoWatchAbortControllers: new Set(),
    videoElementItemKeys: new WeakMap(),
    keyboardScrollRaf: 0,
    keyboardScrollHeldKey: '',
    keyboardScrollDirection: 0,
    keyboardScrollMode: 'line',
    keyboardScrollTargetTop: 0,
    keyboardScrollLastFrameAt: 0,
    keyboardAutoLoadsThisHold: 0,
    keyboardAutoLoadLimitNotified: false,
    keyboardLoadContinuationTimer: 0,
    activeVideoPlaybackMode: 'none',
    lightboxReturnFocusElement: null,
    toastTimer: 0,
    videoResourceUrlsById: new Map(),
    videoResourceEntryCount: 0,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getPageOrigin() {
    return globalThis.__LMM_TEST_ORIGIN__ || location.origin;
  }

  globalThis[NAMESPACE] = {
    config: Object.freeze({
      APP_ID,
      STORAGE_KEY,
      LEGACY_STORAGE_KEYS,
      TEST_MODE,
      LOAD_COOLDOWN_MS,
      LOAD_MAX_WAIT_MS,
      LIGHTBOX_LOAD_AHEAD_COUNT,
      LIGHTBOX_IMAGE_PRELOAD_COUNT,
      SCAN_DEBOUNCE_MS,
      CARD_VIRTUAL_ROOT_MARGIN_PX,
      CARD_UNLOAD_DELAY_MS,
      TIMELINE_OBSERVER_RETRY_MS,
      GRID_GAP_PX,
      BOARD_END_THRESHOLD_PX,
      BOARD_END_LOAD_COOLDOWN_MS,
      USER_SCROLL_INTENT_MS,
      PROGRAMMATIC_SCROLL_SUPPRESS_MS,
      ROUTE_FALLBACK_CHECK_MS,
      ROUTE_CHANGE_DEBOUNCE_MS,
      AUTO_LOAD_EMPTY_STREAK_THRESHOLD,
      AUTO_LOAD_BACKOFF_BASE_MS,
      AUTO_LOAD_BACKOFF_MAX_MS,
      LIGHTBOX_TRANSITION_MS,
      REBUILD_SCROLL_WAIT_MS,
      KEYBOARD_SCROLL_LINE_STEP_PX,
      KEYBOARD_SCROLL_LINE_SPEED_PX_PER_SEC,
      KEYBOARD_SCROLL_PAGE_SPEED_PX_PER_SEC,
      KEYBOARD_HOLD_AUTO_LOAD_LIMIT,
      KEYBOARD_BOARD_END_THRESHOLD_PX,
      VIDEO_SOURCE_PROBE_DELAYS_MS,
      VIDEO_RETAIN_LIMIT,
      VIDEO_DIRECT_READY_TIMEOUT_MS,
      VIDEO_BORROW_READY_TIMEOUT_MS,
      PREVIEW_TRANSPARENCY_DEFAULT,
      KEYBOARD_LOAD_RETRY_MS,
      LOAD_QUEUED_REQUEST_DELAY_MS,
      LOAD_RESULT_DISPLAY_MS,
      X_LOAD_DRIVER_INTERVAL_MS,
      X_LOAD_BOUNCE_MIN_PX,
      X_LOAD_BOUNCE_MAX_PX,
      TOAST_RESULT_DISPLAY_MS,
      TOAST_ERROR_DISPLAY_MS,
    }),
    extensionApi,
    state,
    helpers: Object.freeze({ clamp, getPageOrigin }),
    settingsApi: {},
    diagnosticsApi: {},
    modules: {},
    runtime: {},
  };
})();
