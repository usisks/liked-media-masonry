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
  app.modules.loading ||= {};

  function findTimelineRoot(...args) { return app.modules.routing.findTimelineRoot(...args); }
  function installObserver(...args) { return app.modules.routing.installObserver(...args); }
  function isLikesPage(...args) { return app.modules.dom.isLikesPage(...args); }
  function markProgrammaticBoardScroll(...args) { return app.modules.board.markProgrammaticBoardScroll(...args); }
  function preserveDisconnectedRetainedVideos(...args) { return app.modules.video.preserveDisconnectedRetainedVideos(...args); }
  function reconcileLightboxAfterItemsChange(...args) { return app.modules.lightbox.reconcileLightboxAfterItemsChange(...args); }
  function refreshLightboxChrome(...args) { return app.modules.lightbox.refreshLightboxChrome(...args); }
  function runKeyboardBoardScroll(...args) { return app.modules.routing.runKeyboardBoardScroll(...args); }
  function scanTweets(...args) { return app.modules.dom.scanTweets(...args); }
  function setStatus(...args) { return app.modules.board.setStatus(...args); }
  function showToast(...args) { return app.modules.board.showToast(...args); }
  function start(...args) { return app.modules.main.start(...args); }
  function updateLoadZone(...args) { return app.modules.board.updateLoadZone(...args); }

  let loadController = null;
  let cancelPendingXPageRestore = null;

  function isLoadActive() {
    return Boolean(loadController?.isActive());
  }

  function getXScrollingElement() {
    return document.scrollingElement || document.documentElement;
  }

  function captureXPageScrollPosition() {
    cancelPendingXPageRestore?.();
    cancelPendingXPageRestore = null;
    const scrollingElement = getXScrollingElement();
    state.xPageScrollTopOnBoardOpen = Math.max(0, Number(scrollingElement?.scrollTop) || 0);
  }

  function stopXScrollMotion() {
    const scrollingElement = getXScrollingElement();
    if (!scrollingElement?.scrollTo) return;
    const currentTop = Math.max(0, Number(scrollingElement.scrollTop) || 0);
    scrollingElement.scrollTo({ top: currentTop, behavior: 'auto' });
  }

  function restoreXPageScrollPosition() {
    const savedTop = state.xPageScrollTopOnBoardOpen;
    state.xPageScrollTopOnBoardOpen = null;
    cancelPendingXPageRestore?.();
    cancelPendingXPageRestore = null;
    if (!Number.isFinite(savedTop)) return;

    const scrollingElement = getXScrollingElement();
    if (!scrollingElement?.scrollTo) return;
    const targetTop = Math.max(0, savedTop);
    const htmlStyle = document.documentElement.style.scrollBehavior;
    const bodyStyle = document.body?.style.scrollBehavior || '';
    const timers = new Set();
    const frames = new Set();
    let cancelled = false;

    const apply = () => {
      if (cancelled) return;
      document.documentElement.style.scrollBehavior = 'auto';
      if (document.body) document.body.style.scrollBehavior = 'auto';
      scrollingElement.scrollTo({ top: targetTop, behavior: 'auto' });
    };
    const cleanup = () => {
      if (cancelled) return;
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      for (const frame of frames) window.cancelAnimationFrame(frame);
      for (const eventName of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
        window.removeEventListener(eventName, cancelForUserInput, true);
      }
      document.documentElement.style.scrollBehavior = htmlStyle;
      if (document.body) document.body.style.scrollBehavior = bodyStyle;
      if (cancelPendingXPageRestore === cleanup) cancelPendingXPageRestore = null;
    };
    const cancelForUserInput = () => cleanup();
    const schedule = (delayMs) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        apply();
      }, delayMs);
      timers.add(timer);
    };

    for (const eventName of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      window.addEventListener(eventName, cancelForUserInput, true);
    }
    cancelPendingXPageRestore = cleanup;
    apply();
    const frame = window.requestAnimationFrame(() => {
      frames.delete(frame);
      apply();
    });
    frames.add(frame);
    schedule(40);
    schedule(120);
    schedule(300);
    const cleanupTimer = window.setTimeout(() => {
      timers.delete(cleanupTimer);
      apply();
      cleanup();
    }, 360);
    timers.add(cleanupTimer);
  }

  function ensureTimelineObserverCurrent() {
    const currentRoot = findTimelineRoot();
    if (!(currentRoot instanceof HTMLElement)) return state.observerRoot;
    if (
      state.observerRoot !== currentRoot
      || !state.observerRoot?.isConnected
      || !state.observer
    ) {
      installObserver();
    }
    return currentRoot;
  }

  function getTimelineLoadSnapshot(root = null) {
    const timelineRoot = root instanceof HTMLElement
      ? root
      : ensureTimelineObserverCurrent();
    const articles = Array.from(
      timelineRoot?.querySelectorAll?.('article[data-testid="tweet"], article') || [],
    );
    let lastStatusId = '';
    for (let index = articles.length - 1; index >= 0; index -= 1) {
      const href = articles[index].querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
      const match = href.match(/\/status\/(\d+)/);
      if (match) {
        lastStatusId = match[1];
        break;
      }
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    return {
      articleCount: articles.length,
      lastStatusId,
      scrollTop: Math.round(Number(scrollingElement?.scrollTop) || 0),
      scrollHeight: Math.round(Number(scrollingElement?.scrollHeight) || 0),
      clientHeight: Math.round(Number(scrollingElement?.clientHeight) || 0),
    };
  }

  function isAutomaticLoadSource(source) {
    return ['board-end', 'lightbox-board-end', 'keyboard-board-end'].includes(source);
  }

  function isKeyboardLoadSource(source) {
    return source === 'keyboard-board-end';
  }

  function createLoadController() {
    const validPhases = new Set([
      'idle',
      'requesting',
      'waiting_for_x',
      'collecting',
      'cooldown',
      'failed',
    ]);
    let phase = 'idle';
    let sequence = 0;
    let activeAttempt = null;
    let queuedRequest = null;
    let lastResult = null;
    let cooldownTimer = 0;
    let resultTimer = 0;
    let lastStartedAt = 0;
    let consecutiveEmptyLoads = 0;
    let autoLoadBlockedUntil = 0;

    const setPhase = (nextPhase) => {
      phase = validPhases.has(nextPhase) ? nextPhase : 'failed';
    };

    const clearTimer = (timerId) => {
      if (timerId) window.clearTimeout(timerId);
    };

    const clearAttemptWork = (attempt, abort = false) => {
      if (!attempt) return;
      if (abort && !attempt.abortController.signal.aborted) {
        attempt.abortController.abort();
      }
      for (const timer of attempt.timers) window.clearTimeout(timer);
      attempt.timers.clear();
      for (const frame of attempt.animationFrames) window.cancelAnimationFrame(frame);
      attempt.animationFrames.clear();
    };

    const scheduleAttempt = (attempt, callback, delayMs) => {
      if (!attempt || attempt.abortController.signal.aborted) return 0;
      const timer = window.setTimeout(() => {
        attempt.timers.delete(timer);
        if (attempt.abortController.signal.aborted || activeAttempt !== attempt) return;
        callback();
      }, delayMs);
      attempt.timers.add(timer);
      return timer;
    };

    const scheduleAttemptFrame = (attempt, callback) => {
      if (!attempt || attempt.abortController.signal.aborted) return 0;
      const frame = window.requestAnimationFrame(() => {
        attempt.animationFrames.delete(frame);
        if (attempt.abortController.signal.aborted || activeAttempt !== attempt) return;
        callback();
      });
      attempt.animationFrames.add(frame);
      return frame;
    };

    const normalizeRequest = (options = {}) => ({
      source: String(options.source || 'manual-button'),
      queuedKeyboardRequest: Boolean(options.queuedKeyboardRequest),
      queueIfBusy: options.queueIfBusy !== false,
      requestedAt: Date.now(),
    });

    const canUseRequest = (request) => {
      if (!isLikesPage()) return false;
      if (
        isAutomaticLoadSource(request.source)
        && !isKeyboardLoadSource(request.source)
        && Date.now() < autoLoadBlockedUntil
      ) return false;
      if (
        isKeyboardLoadSource(request.source)
        && state.keyboardAutoLoadsThisHold >= KEYBOARD_HOLD_AUTO_LOAD_LIMIT
      ) return false;
      return true;
    };

    const showQueuedRequest = (request) => {
      const keyboardRequest = isKeyboardLoadSource(request.source);
      setStatus(keyboardRequest
        ? '現在の読込後に、次の読込を続けます…'
        : '現在の読込後に、もう一度続きを読み込みます…');
      updateLoadZone(keyboardRequest
        ? '↓キーの入力を受け付けました。現在の読込が終わり次第、続きを読み込みます。'
        : '次の読込要求を受け付けました。現在の読込が終わり次第、もう一度読み込みます。');
      refreshLightboxChrome();
    };

    const queue = (options = {}) => {
      const request = normalizeRequest(options);
      if (!request.queueIfBusy || !canUseRequest(request) || queuedRequest) return false;
      queuedRequest = request;
      showQueuedRequest(request);
      return true;
    };

    const driveXTimelineToEnd = (attempt, iteration = 0) => {
      if (
        activeAttempt !== attempt
        || attempt.abortController.signal.aborted
        || !isLikesPage()
      ) return;

      const currentRoot = ensureTimelineObserverCurrent();
      if (currentRoot instanceof HTMLElement) scanTweets(currentRoot);
      if (state.items.length > attempt.beforeItemCount) return;

      const scrollingElement = getXScrollingElement();
      const articles = Array.from(
        currentRoot?.querySelectorAll?.('article[data-testid="tweet"], article') || [],
      );
      const progressIndicators = Array.from(
        currentRoot?.querySelectorAll?.('[role="progressbar"]') || [],
      );
      const target = progressIndicators[progressIndicators.length - 1]
        || articles[articles.length - 1];

      if (target instanceof HTMLElement) {
        target.scrollIntoView({
          block: 'end',
          behavior: iteration === 0 ? 'smooth' : 'auto',
        });
      }

      const maxTop = Math.max(
        0,
        Number(scrollingElement.scrollHeight || 0)
          - Number(scrollingElement.clientHeight || window.innerHeight || 0),
      );
      const bounceDistance = clamp(
        Number(scrollingElement.clientHeight || window.innerHeight || 0) * .45,
        X_LOAD_BOUNCE_MIN_PX,
        X_LOAD_BOUNCE_MAX_PX,
      );

      if (iteration === 0) {
        scrollingElement.scrollTo({ top: maxTop, behavior: 'smooth' });
      } else {
        scrollingElement.scrollTo({
          top: Math.max(0, maxTop - bounceDistance),
          behavior: 'auto',
        });
        scheduleAttemptFrame(attempt, () => {
          const refreshedMaxTop = Math.max(
            0,
            Number(scrollingElement.scrollHeight || 0)
              - Number(scrollingElement.clientHeight || window.innerHeight || 0),
          );
          scrollingElement.scrollTo({ top: refreshedMaxTop, behavior: 'smooth' });
          window.dispatchEvent(new Event('scroll'));
        });
      }

      window.dispatchEvent(new Event('scroll'));
      scheduleAttempt(
        attempt,
        () => driveXTimelineToEnd(attempt, iteration + 1),
        X_LOAD_DRIVER_INTERVAL_MS,
      );
    };

    const scheduleResultReset = (attemptId) => {
      clearTimer(resultTimer);
      resultTimer = window.setTimeout(() => {
        resultTimer = 0;
        if (!activeAttempt && lastResult?.attemptId === attemptId && !queuedRequest) {
          setStatus('');
          updateLoadZone();
        }
      }, LOAD_RESULT_DISPLAY_MS);
    };

    const consumeQueuedRequest = () => {
      clearTimer(cooldownTimer);
      cooldownTimer = 0;
      if (!queuedRequest) {
        setPhase('idle');
        return;
      }
      const nextRequest = queuedRequest;
      queuedRequest = null;
      setPhase('idle');
      if (!canUseRequest(nextRequest)) {
        refreshLightboxChrome();
        return;
      }
      start(nextRequest);
    };

    const enterCooldown = (attemptId, delayMs = LOAD_QUEUED_REQUEST_DELAY_MS) => {
      setPhase('cooldown');
      clearTimer(cooldownTimer);
      cooldownTimer = window.setTimeout(() => {
        cooldownTimer = 0;
        consumeQueuedRequest();
      }, delayMs);
      scheduleResultReset(attemptId);
    };

    const fail = (attempt, error) => {
      if (activeAttempt !== attempt) return;
      clearAttemptWork(attempt, true);
      stopXScrollMotion();
      activeAttempt = null;
      lastResult = {
        attemptId: attempt.id,
        status: 'failed',
        source: attempt.request.source,
        startedAt: new Date(attempt.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - attempt.startedAt,
        message: sanitizeDiagnosticText(error?.message || error || '追加読込に失敗しました。'),
      };
      setPhase('failed');
      recordError('load-controller-failed', error, {
        attemptId: attempt.id,
        source: attempt.request.source,
        phase,
      });
      setStatus('続きを読み込めませんでした');
      showToast('続きを読み込めませんでした', { tone: 'error', duration: TOAST_ERROR_DISPLAY_MS });
      updateLoadZone('追加読込に失敗しました。少し待ってから、もう一度お試しください。');
      refreshLightboxChrome();
      clearTimer(cooldownTimer);
      cooldownTimer = window.setTimeout(() => {
        cooldownTimer = 0;
        consumeQueuedRequest();
      }, LOAD_RESULT_DISPLAY_MS);
    };

    const finalize = (attempt) => {
      if (activeAttempt !== attempt || attempt.abortController.signal.aborted) return;
      try {
        const addedBeforeFinalScan = state.items.length - attempt.beforeItemCount;
        if (addedBeforeFinalScan <= 0) {
          const currentRoot = ensureTimelineObserverCurrent();
          scanTweets(currentRoot || state.observerRoot || document);
        }

        const finalAdded = state.items.length - attempt.beforeItemCount;
        const afterSnapshot = getTimelineLoadSnapshot();
        clearAttemptWork(attempt, true);
        activeAttempt = null;
        preserveDisconnectedRetainedVideos();
        markProgrammaticBoardScroll(500);

        lastResult = {
          attemptId: attempt.id,
          status: 'finished',
          source: attempt.request.source,
          queuedKeyboardRequest: attempt.request.queuedKeyboardRequest,
          startedAt: new Date(attempt.startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          elapsedMs: Date.now() - attempt.startedAt,
          addedCount: finalAdded,
          articleCountBefore: attempt.beforeSnapshot.articleCount,
          articleCountAfter: afterSnapshot.articleCount,
          articleDelta: afterSnapshot.articleCount - attempt.beforeSnapshot.articleCount,
          lastStatusChanged: Boolean(
            attempt.beforeSnapshot.lastStatusId
            && afterSnapshot.lastStatusId
            && attempt.beforeSnapshot.lastStatusId !== afterSnapshot.lastStatusId
          ),
          xScrollTopBefore: attempt.beforeSnapshot.scrollTop,
          xScrollHeightBefore: attempt.beforeSnapshot.scrollHeight,
          xScrollTopAfter: afterSnapshot.scrollTop,
          xScrollHeightAfter: afterSnapshot.scrollHeight,
        };

        let emptyLoadMessage = '';
        if (finalAdded > 0) {
          consecutiveEmptyLoads = 0;
          autoLoadBlockedUntil = 0;
        } else if (attempt.isAutomatic && !attempt.isKeyboardRequest) {
          consecutiveEmptyLoads += 1;
          if (consecutiveEmptyLoads >= AUTO_LOAD_EMPTY_STREAK_THRESHOLD) {
            const backoffStep = consecutiveEmptyLoads - AUTO_LOAD_EMPTY_STREAK_THRESHOLD;
            const backoffMs = Math.min(
              AUTO_LOAD_BACKOFF_BASE_MS * (2 ** backoffStep),
              AUTO_LOAD_BACKOFF_MAX_MS,
            );
            autoLoadBlockedUntil = Date.now() + backoffMs;
            emptyLoadMessage = `新しいメディアはありません。自動読込を${Math.ceil(backoffMs / 1000)}秒休止します`;
          }
        }

        reconcileLightboxAfterItemsChange();
        const resultMessage = finalAdded > 0
          ? `${finalAdded}件追加しました`
          : emptyLoadMessage || '新しいメディアはありません';
        setStatus(finalAdded > 0
          ? `${finalAdded}件追加`
          : emptyLoadMessage || '新しいメディアはまだありません');
        showToast(resultMessage, { duration: TOAST_RESULT_DISPLAY_MS });
        updateLoadZone(finalAdded > 0
          ? `${finalAdded}件追加しました。さらに下へスクロールすると続きも読み込みます。`
          : emptyLoadMessage
            ? `${emptyLoadMessage}。拡張機能メニューまたは拡大表示内のボタンからはすぐに再試行できます。`
            : '新しいメディアはまだありません。少し待ってから、もう一度最下部までスクロールしてください。');
        refreshLightboxChrome();

        if (
          !queuedRequest
          && state.keyboardScrollHeldKey
          && state.keyboardScrollDirection > 0
          && state.keyboardAutoLoadsThisHold < KEYBOARD_HOLD_AUTO_LOAD_LIMIT
        ) {
          state.keyboardScrollTargetTop = Math.max(
            state.keyboardScrollTargetTop,
            (document.getElementById(`${APP_ID}-overlay`)?.scrollTop || 0) + KEYBOARD_SCROLL_LINE_STEP_PX,
          );
          scheduleKeyboardLoadContinuation(finalAdded > 0 ? 120 : KEYBOARD_LOAD_RETRY_MS);
          if (!state.keyboardScrollRaf) {
            state.keyboardScrollRaf = window.requestAnimationFrame(runKeyboardBoardScroll);
          }
        }

        enterCooldown(attempt.id);
      } catch (error) {
        fail(attempt, error);
      }
    };

    const poll = (attempt) => {
      if (activeAttempt !== attempt || attempt.abortController.signal.aborted) return;
      const added = state.items.length - attempt.beforeItemCount;
      const elapsed = Date.now() - attempt.startedAt;
      if (added <= 0 && elapsed < LOAD_MAX_WAIT_MS) {
        setPhase('waiting_for_x');
        scheduleAttempt(attempt, () => poll(attempt), 250);
        return;
      }
      setPhase('collecting');
      finalize(attempt);
    };

    function start(options = {}) {
      const request = normalizeRequest(options);
      if (activeAttempt || ['cooldown', 'failed'].includes(phase) || !canUseRequest(request)) {
        return false;
      }

      clearTimer(resultTimer);
      resultTimer = 0;
      const startedAt = Date.now();
      const beforeSnapshot = getTimelineLoadSnapshot();
      const attempt = {
        id: ++sequence,
        request,
        abortController: new AbortController(),
        timers: new Set(),
        animationFrames: new Set(),
        beforeItemCount: state.items.length,
        startedAt,
        beforeSnapshot,
        isAutomatic: isAutomaticLoadSource(request.source),
        isKeyboardRequest: isKeyboardLoadSource(request.source),
      };
      activeAttempt = attempt;
      setPhase('requesting');
      lastStartedAt = startedAt;
      if (attempt.isKeyboardRequest) state.keyboardAutoLoadsThisHold += 1;

      lastResult = {
        attemptId: attempt.id,
        status: 'running',
        source: request.source,
        queuedKeyboardRequest: request.queuedKeyboardRequest,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: '',
        addedCount: 0,
        articleCountBefore: beforeSnapshot.articleCount,
        articleCountAfter: beforeSnapshot.articleCount,
        articleDelta: 0,
        xScrollTopBefore: beforeSnapshot.scrollTop,
        xScrollHeightBefore: beforeSnapshot.scrollHeight,
        xScrollTopAfter: beforeSnapshot.scrollTop,
        xScrollHeightAfter: beforeSnapshot.scrollHeight,
      };

      const reachedBoardEnd = attempt.isAutomatic;
      setStatus(reachedBoardEnd
        ? 'ボードの最下部に到達したため、続きを読み込み中…'
        : request.source === 'lightbox-button'
          ? '背面のXをスクロールして続きを読み込み中…'
          : 'Xから続きを読み込み中…');
      showToast('続きを読み込み中…', { tone: 'loading' });
      updateLoadZone('続きを読み込み中…');
      refreshLightboxChrome();

      try {
        preserveDisconnectedRetainedVideos();
        setPhase('waiting_for_x');
        driveXTimelineToEnd(attempt, 0);
        scheduleAttempt(attempt, () => poll(attempt), LOAD_COOLDOWN_MS);
        return true;
      } catch (error) {
        fail(attempt, error);
        return false;
      }
    }

    const request = (options = {}) => {
      const normalized = normalizeRequest(options);
      if (!canUseRequest(normalized)) return { started: false, queued: false };
      if (activeAttempt || ['cooldown', 'failed'].includes(phase)) {
        return { started: false, queued: queue(normalized) };
      }
      return { started: start(normalized), queued: false };
    };

    const clearQueuedRequest = (source = '') => {
      if (!queuedRequest) return false;
      if (source && queuedRequest.source !== source) return false;
      queuedRequest = null;
      return true;
    };

    const cancel = (reason = 'cancelled', options = {}) => {
      clearTimer(cooldownTimer);
      clearTimer(resultTimer);
      cooldownTimer = 0;
      resultTimer = 0;
      const attempt = activeAttempt;
      if (attempt) {
        clearAttemptWork(attempt, true);
        lastResult = {
          attemptId: attempt.id,
          status: 'cancelled',
          source: attempt.request.source,
          startedAt: new Date(attempt.startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          elapsedMs: Date.now() - attempt.startedAt,
          reason: String(reason || 'cancelled'),
        };
      }
      activeAttempt = null;
      queuedRequest = null;
      setPhase('idle');
      stopXScrollMotion();
      if (options.clearResult) lastResult = null;
      if (options.resetPolicy) {
        lastStartedAt = 0;
        consecutiveEmptyLoads = 0;
        autoLoadBlockedUntil = 0;
      }
      refreshLightboxChrome();
    };

    return {
      request,
      queue,
      cancel,
      clearQueuedRequest,
      isActive: () => Boolean(activeAttempt),
      isBusy: () => Boolean(activeAttempt) || ['cooldown', 'failed'].includes(phase),
      getPhase: () => phase,
      getActiveAttemptId: () => activeAttempt?.id || 0,
      getActiveSignal: () => activeAttempt?.abortController.signal || null,
      getQueuedRequest: () => queuedRequest ? { ...queuedRequest } : null,
      getLastResult: () => lastResult ? { ...lastResult } : null,
      getLastStartedAt: () => lastStartedAt,
      isAutoBlocked: () => Date.now() < autoLoadBlockedUntil,
      getAutoBlockedUntil: () => autoLoadBlockedUntil,
      getSnapshot: () => ({
        phase,
        activeAttemptId: activeAttempt?.id || 0,
        activeSource: activeAttempt?.request.source || '',
        queuedRequest: queuedRequest ? { ...queuedRequest } : null,
        lastResult: lastResult ? { ...lastResult } : null,
        lastStartedAt,
        consecutiveEmptyLoads,
        autoLoadBlockedUntil,
      }),
    };
  }

  loadController = createLoadController();

  function queueKeyboardLoadAfterCurrent() {
    if (
      state.keyboardAutoLoadsThisHold >= KEYBOARD_HOLD_AUTO_LOAD_LIMIT
      || !loadController.isBusy()
    ) return false;
    return loadController.queue({
      source: 'keyboard-board-end',
      queuedKeyboardRequest: true,
      queueIfBusy: true,
    });
  }

  function scheduleKeyboardLoadContinuation(delayMs = KEYBOARD_LOAD_RETRY_MS) {
    window.clearTimeout(state.keyboardLoadContinuationTimer);
    state.keyboardLoadContinuationTimer = 0;
    if (
      !state.keyboardScrollHeldKey
      || state.keyboardScrollDirection <= 0
      || state.keyboardAutoLoadsThisHold >= KEYBOARD_HOLD_AUTO_LOAD_LIMIT
    ) return;

    state.keyboardLoadContinuationTimer = window.setTimeout(() => {
      state.keyboardLoadContinuationTimer = 0;
      if (!state.keyboardScrollHeldKey || state.keyboardScrollDirection <= 0) return;
      ensureTimelineObserverCurrent();
      maybeRequestMoreAtBoardEnd('keyboard-board-end', { queueIfLoading: true });
      if (!state.keyboardScrollRaf) {
        state.keyboardScrollRaf = window.requestAnimationFrame(runKeyboardBoardScroll);
      }
    }, delayMs);
  }

  function maybeRequestMoreAtBoardEnd(source, options = {}) {
    if (!state.active || !isLikesPage()) return;
    const now = Date.now();
    const isKeyboardRequest = source === 'keyboard-board-end';

    const overlay = document.getElementById(`${APP_ID}-overlay`);
    if (!(overlay instanceof HTMLElement)) return;
    const maxTop = Math.max(0, overlay.scrollHeight - overlay.clientHeight);
    const distanceFromBottom = Math.max(0, maxTop - overlay.scrollTop);
    const keyboardThreshold = Math.max(
      KEYBOARD_BOARD_END_THRESHOLD_PX,
      Math.min(560, overlay.clientHeight * .22),
    );
    const keyboardIntendsToReachEnd = isKeyboardRequest
      && state.keyboardScrollDirection > 0
      && (
        state.keyboardScrollTargetTop >= maxTop - 1
        || distanceFromBottom <= keyboardThreshold
      );
    if (!keyboardIntendsToReachEnd && distanceFromBottom > BOARD_END_THRESHOLD_PX) return;

    if (isKeyboardRequest && state.keyboardAutoLoadsThisHold >= KEYBOARD_HOLD_AUTO_LOAD_LIMIT) {
      if (!state.keyboardAutoLoadLimitNotified) {
        state.keyboardAutoLoadLimitNotified = true;
        setStatus('↓キー長押しによる連続読込は3回で停止しました。キーを離して再度押すと続行できます。');
        updateLoadZone('連続読込は3回で一時停止しました。↓キーを離して再度押すか、拡張機能メニューから続きを読み込めます。');
      }
      return;
    }

    if (!isKeyboardRequest && loadController.isAutoBlocked()) return;
    if (!isKeyboardRequest && now < state.suppressBottomLoadUntil) return;
    if (!isKeyboardRequest && now - state.lastUserBoardScrollAt > USER_SCROLL_INTENT_MS) return;
    if (!isKeyboardRequest && now - loadController.getLastStartedAt() < BOARD_END_LOAD_COOLDOWN_MS) return;

    ensureTimelineObserverCurrent();
    const outcome = loadController.request({
      source,
      queueIfBusy: isKeyboardRequest ? options.queueIfLoading !== false : true,
      queuedKeyboardRequest: isKeyboardRequest && loadController.isBusy(),
    });
    if (!outcome.started && isKeyboardRequest && !outcome.queued) {
      scheduleKeyboardLoadContinuation();
    }
  }

  function requestMoreFromX(options = {}) {
    return loadController.request(options).started;
  }

  function getLoadController() { return loadController; }

  Object.assign(app.modules.loading, {
    isLoadActive,
    getXScrollingElement,
    captureXPageScrollPosition,
    stopXScrollMotion,
    restoreXPageScrollPosition,
    ensureTimelineObserverCurrent,
    getTimelineLoadSnapshot,
    isAutomaticLoadSource,
    isKeyboardLoadSource,
    createLoadController,
    queueKeyboardLoadAfterCurrent,
    scheduleKeyboardLoadContinuation,
    maybeRequestMoreAtBoardEnd,
    requestMoreFromX,
    getLoadController,
  });
})();
