(() => {
  'use strict';

  const app = globalThis.__LIKED_MEDIA_MASONRY__;
  if (!app) throw new Error('Liked Media Masonry namespace is not initialized.');

  const { extensionApi, state, runtime } = app;

  const LOAD_SOURCES = new Set([
    'manual-button',
    'popup-button',
    'board-end',
    'lightbox-board-end',
    'lightbox-button',
    'keyboard-board-end',
  ]);
  const LOAD_PHASES = new Set([
    'idle',
    'requesting',
    'waiting_for_x',
    'collecting',
    'cooldown',
    'failed',
  ]);
  const LOAD_STATUSES = new Set(['running', 'finished', 'failed', 'cancelled']);
  const PLAYBACK_MODES = new Set([
    'none',
    'direct-video-url',
    'borrowed-x-video',
    'recovering-source',
  ]);
  const SAFE_ERROR_NAMES = new Set([
    'AbortError',
    'Error',
    'InvalidStateError',
    'MediaError',
    'NetworkError',
    'NotAllowedError',
    'NotFoundError',
    'NotSupportedError',
    'SecurityError',
    'TimeoutError',
    'TypeError',
  ]);

  const ERROR_DEFINITIONS = Object.freeze({
    'borrowed-video-not-ready': Object.freeze({
      message: '借用した動画を準備できませんでした。',
      fields: Object.freeze({
        readyState: 'integer',
        networkState: 'integer',
        duration: 'number-or-null',
        hasSource: 'boolean',
      }),
    }),
    'source-video-play-failed': Object.freeze({
      message: '借用した動画の再生を開始できませんでした。',
      fields: Object.freeze({
        readyState: 'integer',
        networkState: 'integer',
        hasSource: 'boolean',
      }),
    }),
    'video-source-missing': Object.freeze({
      message: '動画の再生元を取得できませんでした。',
      fields: Object.freeze({
        itemOrder: 'integer',
        hasRetainedUrl: 'boolean',
        retainedVideoCount: 'integer',
      }),
    }),
    'direct-video-fallback-failed': Object.freeze({
      message: '動画URLと代替再生元の両方を利用できませんでした。',
      fields: Object.freeze({
        playbackMode: 'playback-mode',
        resourceCandidateCount: 'integer',
      }),
    }),
    'lightbox-video-play-failed': Object.freeze({
      message: '拡大表示内の動画再生を開始できませんでした。',
      fields: Object.freeze({
        sourceType: 'video-source-type',
        readyState: 'integer',
        networkState: 'integer',
      }),
    }),
    'lightbox-video-element-error': Object.freeze({
      message: '拡大表示内の動画要素でエラーが発生しました。',
      fields: Object.freeze({
        readyState: 'integer',
        networkState: 'integer',
      }),
    }),
    'load-controller-failed': Object.freeze({
      message: '追加読込処理に失敗しました。',
      fields: Object.freeze({
        attemptId: 'integer',
        source: 'load-source',
        phase: 'load-phase',
      }),
    }),
    'runtime-error': Object.freeze({
      message: '拡張機能スクリプトでJavaScriptエラーが発生しました。',
      fields: Object.freeze({
        module: 'module-name',
        line: 'integer',
        column: 'integer',
      }),
    }),
    'unknown-error': Object.freeze({
      message: '分類できない拡張機能内エラーが発生しました。',
      fields: Object.freeze({}),
    }),
  });

  function sanitizeDiagnosticText(value) {
    return String(value || '')
      .replace(/(?:https?:\/\/|blob:|chrome-extension:\/\/|moz-extension:\/\/)[^\s"'<>]+/gi, '[URL]')
      .slice(0, 200);
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toInteger(value, fallback = 0) {
    return Math.trunc(toFiniteNumber(value, fallback));
  }

  function normalizeSetValue(value, allowed, fallback = 'other') {
    const normalized = String(value || '');
    return allowed.has(normalized) ? normalized : fallback;
  }

  function normalizeModuleName(value) {
    const raw = String(value || '').toLowerCase();
    const direct = raw.match(/^(namespace|settings|diagnostics|dom|video|board|lightbox|loading|routing|main)$/);
    if (direct) return direct[1];
    const normalized = raw.match(/(?:^|\/)(namespace|settings|diagnostics|dom|video|board|lightbox|loading|routing|main)\.js$/);
    return normalized?.[1] || 'unknown';
  }

  function normalizeErrorName(error) {
    const candidate = error && typeof error === 'object' ? String(error.name || '') : '';
    return SAFE_ERROR_NAMES.has(candidate) ? candidate : 'Error';
  }

  function sanitizeAllowedField(type, value) {
    switch (type) {
      case 'boolean':
        return Boolean(value);
      case 'integer':
        return toInteger(value);
      case 'number-or-null':
        return value === null || value === undefined || !Number.isFinite(Number(value))
          ? null
          : Number(value);
      case 'load-source':
        return normalizeSetValue(value, LOAD_SOURCES);
      case 'load-phase':
        return normalizeSetValue(value, LOAD_PHASES, 'failed');
      case 'playback-mode':
        return normalizeSetValue(value, PLAYBACK_MODES, 'none');
      case 'video-source-type':
        return value === 'direct-url' ? 'direct-url' : 'other';
      case 'module-name':
        return normalizeModuleName(value);
      default:
        return null;
    }
  }

  function buildErrorContext(code, context) {
    const definition = ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS['unknown-error'];
    const source = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
    const result = {};
    for (const [field, type] of Object.entries(definition.fields)) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      result[field] = sanitizeAllowedField(type, source[field]);
    }
    return result;
  }

  function recordError(code, error, context = null) {
    const normalizedCode = Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, code)
      ? String(code)
      : 'unknown-error';
    const definition = ERROR_DEFINITIONS[normalizedCode];
    state.recentErrors.push({
      time: new Date().toISOString(),
      code: normalizedCode,
      message: definition.message,
      errorName: normalizeErrorName(error),
      context: buildErrorContext(normalizedCode, context),
    });
    if (state.recentErrors.length > 20) state.recentErrors.splice(0, state.recentErrors.length - 20);
  }

  function getChromeMajorVersion() {
    const brands = navigator.userAgentData?.brands || [];
    for (const name of ['Google Chrome', 'Chromium']) {
      const brand = brands.find((entry) => entry?.brand === name);
      const major = Number.parseInt(brand?.version || '', 10);
      if (Number.isFinite(major)) return major;
    }
    const match = String(navigator.userAgent || '').match(/(?:Chrome|Chromium)\/(\d+)/i);
    const major = Number.parseInt(match?.[1] || '', 10);
    return Number.isFinite(major) ? major : null;
  }

  function getOsType() {
    const raw = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
    if (/android/.test(raw)) return 'Android';
    if (/(iphone|ipad|ipod|ios)/.test(raw)) return 'iOS';
    if (/(cros|chrome os)/.test(raw)) return 'ChromeOS';
    if (/win/.test(raw)) return 'Windows';
    if (/(mac|darwin)/.test(raw)) return 'macOS';
    if (/linux/.test(raw)) return 'Linux';
    return 'Other';
  }

  function getMinimalEnvironment() {
    return {
      chromeMajorVersion: getChromeMajorVersion(),
      os: getOsType(),
    };
  }

  function sanitizeSettings(settings) {
    return {
      cardWidth: Math.min(640, Math.max(180, toInteger(settings?.cardWidth, 300))),
      includeVideo: Boolean(settings?.includeVideo),
      closePositionBehavior: settings?.closePositionBehavior === 'restore_open_position'
        ? 'restore_open_position'
        : 'keep_scrolled_position',
      previewTransparency: Math.min(90, Math.max(0, toInteger(settings?.previewTransparency, 0))),
    };
  }

  function sanitizeLoadResult(value) {
    if (!value || typeof value !== 'object') return null;
    const result = {
      attemptId: toInteger(value.attemptId),
      status: normalizeSetValue(value.status, LOAD_STATUSES, 'failed'),
      source: normalizeSetValue(value.source, LOAD_SOURCES),
      startedAt: typeof value.startedAt === 'string' ? value.startedAt.slice(0, 32) : '',
      finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt.slice(0, 32) : '',
      elapsedMs: Math.max(0, toInteger(value.elapsedMs)),
    };
    for (const field of [
      'addedCount',
      'articleCountBefore',
      'articleCountAfter',
      'articleDelta',
      'xScrollTopBefore',
      'xScrollHeightBefore',
      'xScrollTopAfter',
      'xScrollHeightAfter',
    ]) {
      if (Object.prototype.hasOwnProperty.call(value, field)) result[field] = toInteger(value[field]);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'queuedKeyboardRequest')) {
      result.queuedKeyboardRequest = Boolean(value.queuedKeyboardRequest);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'lastStatusChanged')) {
      result.lastStatusChanged = Boolean(value.lastStatusChanged);
    }
    return result;
  }

  function sanitizeCurrentVideo(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      playbackMode: normalizeSetValue(value.playbackMode, PLAYBACK_MODES, 'none'),
      hasConnectedSourceElement: Boolean(value.hasConnectedSourceElement),
      sourceElementUsable: Boolean(value.sourceElementUsable),
      sourceReadyState: toInteger(value.sourceReadyState, -1),
      sourceNetworkState: toInteger(value.sourceNetworkState, -1),
      sourceHasUrl: Boolean(value.sourceHasUrl),
      sourceCanBeBorrowed: Boolean(value.sourceCanBeBorrowed),
      reusableResourceCount: Math.max(0, toInteger(value.reusableResourceCount)),
      lightboxReadyState: toInteger(value.lightboxReadyState, -1),
      lightboxNetworkState: toInteger(value.lightboxNetworkState, -1),
      lightboxDuration: value.lightboxDuration === null || !Number.isFinite(Number(value.lightboxDuration))
        ? null
        : Number(value.lightboxDuration),
      lightboxMediaErrorCode: Math.max(0, toInteger(value.lightboxMediaErrorCode)),
    };
  }

  function isExtensionScriptErrorEvent(event) {
    const filename = String(event?.filename || '');
    if (!filename) return false;
    try {
      const url = new URL(filename);
      if (!['chrome-extension:', 'moz-extension:'].includes(url.protocol)) return false;
      const runtimeId = String(extensionApi?.runtime?.id || '');
      if (runtimeId && url.hostname !== runtimeId) return false;
      return /^\/content\/(?:namespace|settings|diagnostics|dom|video|board|lightbox|loading|routing|main)\.js$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function recordRuntimeErrorEvent(event) {
    if (!isExtensionScriptErrorEvent(event)) return false;
    recordError('runtime-error', event?.error || event?.message || new Error('JavaScript error'), {
      module: event.filename,
      line: event.lineno,
      column: event.colno,
    });
    return true;
  }

  function getDiagnostics() {
    const loadController = runtime.getLoadController?.() || null;
    const hasVideoSourceData = runtime.hasVideoSourceData || (() => false);
    const lastLoadResult = sanitizeLoadResult(loadController?.getLastResult?.());
    return {
      generatedAt: new Date().toISOString(),
      extensionVersion: String(extensionApi?.runtime?.getManifest?.().version || 'unknown').slice(0, 32),
      environment: getMinimalEnvironment(),
      page: runtime.isLikesPage?.() ? 'x-likes-page' : 'other-page',
      settings: sanitizeSettings(state.settings),
      state: {
        itemCount: state.items.length,
        videoCount: state.items.reduce((count, item) => count + (item.kind === 'video' ? 1 : 0), 0),
        settingsStorage: 'extension.storage.local',
        boardOpen: Boolean(state.active),
        lightboxOpen: Boolean(runtime.isLightboxOpen?.()),
        isLoadingMore: Boolean(runtime.isLoadActive?.()),
        loadState: normalizeSetValue(loadController?.getPhase?.(), LOAD_PHASES, 'idle'),
        isRebuilding: Boolean(state.rebuildFromBeginningInProgress),
        videoWithElementCount: state.items.reduce((count, item) => (
          count + (item.kind === 'video' && (
            state.retainedVideoElements.get(item.key) instanceof HTMLVideoElement
            || item.sourceVideoRef?.deref?.() instanceof HTMLVideoElement
          ) ? 1 : 0)
        ), 0),
        stronglyRetainedVideoCount: state.retainedVideoElements.size,
        videoWithUrlCount: state.items.reduce((count, item) => (
          count + (item.kind === 'video' && Boolean(item.videoSrc && !item.videoSrc.startsWith('blob:')) ? 1 : 0)
        ), 0),
        vaultedVideoCount: state.videoVault?.querySelectorAll?.('video').length || 0,
        detachedVideoWithSourceCount: state.items.reduce((count, item) => {
          const video = state.retainedVideoElements.get(item.key) || item.sourceVideoRef?.deref?.();
          return count + (item.kind === 'video'
            && video instanceof HTMLVideoElement
            && !video.isConnected
            && hasVideoSourceData(video) ? 1 : 0);
        }, 0),
        keyboardAutoLoadsThisHold: Math.max(0, toInteger(state.keyboardAutoLoadsThisHold)),
        keyboardScrollHeldKey: ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(state.keyboardScrollHeldKey)
          ? state.keyboardScrollHeldKey
          : '',
        keyboardScrollDirection: [-1, 0, 1].includes(state.keyboardScrollDirection)
          ? state.keyboardScrollDirection
          : 0,
        keyboardDistanceFromEnd: runtime.getBoardDistanceFromEnd?.() == null
          ? null
          : Math.max(0, toInteger(runtime.getBoardDistanceFromEnd())),
        keyboardLoadQueued: loadController?.getQueuedRequest?.()?.source === 'keyboard-board-end',
        queuedLoadSource: normalizeSetValue(loadController?.getQueuedRequest?.()?.source, LOAD_SOURCES, ''),
        activeLoadAttemptId: Math.max(0, toInteger(loadController?.getActiveAttemptId?.())),
        lastLoadResult,
        activeVideoPlaybackMode: normalizeSetValue(state.activeVideoPlaybackMode, PLAYBACK_MODES, 'none'),
        currentVideo: sanitizeCurrentVideo(runtime.getCurrentVideoDiagnostics?.()),
      },
      errors: state.recentErrors.slice(-20).map((entry) => ({
        time: typeof entry?.time === 'string' ? entry.time.slice(0, 32) : '',
        code: Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, entry?.code) ? entry.code : 'unknown-error',
        message: Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, entry?.code)
          ? ERROR_DEFINITIONS[entry.code].message
          : ERROR_DEFINITIONS['unknown-error'].message,
        errorName: SAFE_ERROR_NAMES.has(entry?.errorName) ? entry.errorName : 'Error',
        context: buildErrorContext(
          Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, entry?.code) ? entry.code : 'unknown-error',
          entry?.context,
        ),
      })),
    };
  }

  Object.assign(app.diagnosticsApi, {
    sanitizeDiagnosticText,
    buildErrorContext,
    recordError,
    getMinimalEnvironment,
    isExtensionScriptErrorEvent,
    recordRuntimeErrorEvent,
    getDiagnostics,
  });
})();
