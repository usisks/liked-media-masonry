(() => {
  'use strict';

  const resultNode = document.getElementById('test-result');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const waitFor = async (predicate, timeoutMs = 2500) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await wait(25);
    }
    throw new Error('Timed out waiting for test condition');
  };

  const tests = {
    async 'normal-image'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      const [item] = hooks.state.items;
      assert(item.kind === 'image', 'normal image should be classified as image');
      assert(item.tweetUrl.endsWith('/yamada/status/1001'), 'tweet URL should match the outer post');
      assert(item.author.includes('山田'), 'Japanese author text should be collected');
    },

    async 'multiple-images'(hooks) {
      await waitFor(() => hooks.state.items.length === 2);
      assert(new Set(hooks.state.items.map((item) => item.mediaPath)).size === 2, 'two distinct media paths should be collected');
    },

    async 'vertical-image'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      const ratio = hooks.state.items[0].ratio;
      assert(Math.abs(ratio - 0.5) < 0.001, `vertical image ratio should be preserved, got ${ratio}`);
    },

    async 'quote-post'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      assert(hooks.state.items[0].tweetUrl.endsWith('/outer/status/1004'), 'time-adjacent outer status link should win over quoted link');
    },

    async 'video-thumbnail'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      assert(hooks.state.items[0].kind === 'video', 'video thumbnail should produce a video item when enabled');
    },

    async 'video-late-insertion'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      const article = document.getElementById('late-video-article');
      const video = document.createElement('video');
      video.setAttribute('poster', 'https://pbs.twimg.com/ext_tw_video_thumb/555002/pu/img/thumb002.jpg');
      video.setAttribute('src', 'blob:https://x.com/late-video-source');
      article.appendChild(video);
      await waitFor(() => hooks.state.items[0].videoSrc.includes('late-video-source'));
      assert(hooks.state.items.length === 1, 'late video insertion must update the existing card instead of duplicating it');
    },

    async 'duplicate-prevention'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      hooks.scanTweets(document);
      hooks.scanTweets(document);
      assert(hooks.state.items.length === 1, 'rescanning the same post must not duplicate media');
    },

    async 'settings-migration'(hooks) {
      const settings = hooks.state.settings;
      assert(settings.cardWidth === 420, 'legacy card width should migrate');
      assert(settings.includeVideo === true, 'legacy video setting should migrate');
      assert(settings.closePositionBehavior === 'restore_open_position', 'legacy close behavior should migrate');
      assert(settings.previewTransparency === 35, 'preview transparency should migrate');
      const stored = globalThis.__mockStorage['liked-media-masonry-settings-v2'];
      assert(stored && Object.keys(stored).sort().join(',') === 'cardWidth,closePositionBehavior,includeVideo,previewTransparency', 'stored settings should contain only supported keys');
      assert(!('x-likes-pinterest-viewer-settings-v1' in globalThis.__mockStorage), 'legacy storage key should be removed');
    },

    async 'load-input'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      const first = hooks.requestMoreFromX({ source: 'popup-button' });
      const activeSignal = hooks.loadController.getActiveSignal();
      const second = hooks.requestMoreFromX({ source: 'popup-button' });
      const third = hooks.requestMoreFromX({ source: 'lightbox-button' });
      const snapshot = hooks.loadController.getSnapshot();
      assert(first === true, 'first load request should start');
      assert(second === false && third === false, 'busy controller must not start parallel requests');
      assert(hooks.getPopupState().isLoadingMore === true, 'popup state should derive loading from the controller');
      assert(snapshot.phase === 'waiting_for_x', `controller should wait for X, got ${snapshot.phase}`);
      assert(snapshot.queuedRequest?.source === 'popup-button', 'the first extra request should occupy the only queue slot');
      assert(activeSignal instanceof AbortSignal && !activeSignal.aborted, 'active attempt should own an AbortController signal');
      hooks.clearCollectedMedia();
      assert(activeSignal.aborted, 'clearing collected media should abort the active load attempt');
      assert(hooks.loadController.getPhase() === 'idle', 'controller should return to idle after cancellation');
      assert(hooks.loadController.getQueuedRequest() === null, 'cancellation should clear the queued request');
    },

    async 'keyboard-load-limit'(hooks) {
      hooks.requestMoreFromX({ source: 'popup-button' });
      hooks.state.keyboardAutoLoadsThisHold = 3;
      const queued = hooks.queueKeyboardLoadAfterCurrent();
      assert(queued === false, 'fourth load in one key hold should be rejected');
      assert(hooks.loadController.getQueuedRequest() === null, 'rejected load should not remain queued');
      hooks.clearCollectedMedia();
    },

    async 'load-queue-handoff'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      assert(hooks.requestMoreFromX({ source: 'popup-button' }) === true, 'first request should start');
      const firstAttemptId = hooks.loadController.getActiveAttemptId();
      assert(hooks.requestMoreFromX({ source: 'lightbox-button' }) === false, 'second request should be queued instead of started');
      assert(hooks.loadController.getQueuedRequest()?.source === 'lightbox-button', 'queued request should preserve its input source');

      const article = document.createElement('article');
      article.setAttribute('data-testid', 'tweet');
      article.innerHTML = `
        <a href="/added/status/2002"><time datetime="2026-07-13T03:00:00.000Z"></time></a>
        <div data-testid="User-Name">追加投稿 @added</div>
        <img src="https://pbs.twimg.com/media/load_added?format=jpg&name=small" width="800" height="600">
      `;
      document.getElementById('fixture-root').appendChild(article);
      hooks.scanTweets(article);

      await waitFor(() => hooks.loadController.getActiveAttemptId() > firstAttemptId, 3000);
      const handoff = hooks.loadController.getSnapshot();
      assert(handoff.activeSource === 'lightbox-button', 'queued lightbox request should start after the first attempt');
      assert(handoff.queuedRequest === null, 'queue should be empty after handoff');
      hooks.clearCollectedMedia();
    },

    async 'load-cancel-restore'(hooks) {
      const spacer = document.createElement('div');
      spacer.style.height = '5000px';
      document.body.appendChild(spacer);
      window.scrollTo(0, 240);
      await wait(30);
      const openingTop = Math.round(document.scrollingElement.scrollTop);
      assert(openingTop > 0, 'test page should be scrolled before opening the board');

      hooks.openOverlay();
      assert(hooks.state.xPageScrollTopOnBoardOpen === openingTop, 'opening the board should save X page position');
      assert(hooks.requestMoreFromX({ source: 'popup-button' }) === true, 'load should start while board is open');
      const activeSignal = hooks.loadController.getActiveSignal();
      await wait(40);
      hooks.closeOverlay();
      await wait(60);

      assert(activeSignal?.aborted === true, 'closing the board should abort X loading work');
      assert(hooks.loadController.getPhase() === 'idle', 'closing the board should leave the controller idle');
      assert(hooks.loadController.getQueuedRequest() === null, 'closing the board should discard queued work');
      assert(Math.abs(document.scrollingElement.scrollTop - openingTop) <= 1, `closing the board should restore the X page position: opening=${openingTop}, current=${document.scrollingElement.scrollTop}`);
      assert(hooks.state.xPageScrollTopOnBoardOpen === null, 'saved X position should be cleared after restoration');
    },

    async 'load-cancel-page-leave'(hooks) {
      hooks.openOverlay();
      assert(hooks.requestMoreFromX({ source: 'popup-button' }) === true, 'load should start before page leave');
      const activeSignal = hooks.loadController.getActiveSignal();
      hooks.suspendLikesPageWork();
      assert(activeSignal?.aborted === true, 'leaving the likes page should abort the active load attempt');
      assert(hooks.loadController.getPhase() === 'idle', 'page leave should return the controller to idle');
      assert(hooks.loadController.getQueuedRequest() === null, 'page leave should discard queued work');
    },

    async 'video-stale-event'(hooks) {
      const itemA = { key: 'video-a', kind: 'video', mediaPath: 'pbs.twimg.com/ext_tw_video_thumb/aaa/pu/img/a.jpg|', videoSrc: '', isGif: false };
      const itemB = { key: 'video-b', kind: 'video', mediaPath: 'pbs.twimg.com/ext_tw_video_thumb/bbb/pu/img/b.jpg|', videoSrc: '', isGif: false };
      const videoA = document.createElement('video');
      const videoB = document.createElement('video');
      videoA.setAttribute('src', 'blob:https://x.com/video-a-initial');
      videoB.setAttribute('src', 'blob:https://x.com/video-b-current');
      document.body.append(videoA, videoB);
      hooks.watchVideoSource(itemA, videoA);
      hooks.watchVideoSource(itemB, videoB);
      const currentSource = itemB.videoSrc;
      videoA.setAttribute('src', 'blob:https://x.com/video-a-late-event');
      videoA.dispatchEvent(new Event('loadedmetadata'));
      assert(itemB.videoSrc === currentSource, 'late event from the old video must not alter the next video item');
    },


    async 'video-retention-limit'(hooks) {
      const items = [];
      for (let index = 0; index < 6; index += 1) {
        const item = {
          key: `video-retain-${index}`,
          kind: 'video',
          mediaPath: `pbs.twimg.com/ext_tw_video_thumb/retain${index}/pu/img/thumb.jpg|`,
          videoSrc: '',
          isGif: false,
          order: index,
        };
        const video = document.createElement('video');
        video.setAttribute('poster', `https://pbs.twimg.com/ext_tw_video_thumb/retain${index}/pu/img/thumb.jpg`);
        video.setAttribute('src', `blob:https://x.com/retain-${index}`);
        document.body.appendChild(video);
        hooks.watchVideoSource(item, video);
        items.push(item);
      }
      assert(hooks.state.retainedVideoElements.size <= 3, `strong video retention must be capped at 3, got ${hooks.state.retainedVideoElements.size}`);
      assert((hooks.state.videoVault?.querySelectorAll('video').length || 0) === 0, 'watching connected videos must not create or fill the hidden vault');
    },


    async 'video-retention-window'(hooks) {
      const items = [];
      for (let index = 0; index < 5; index += 1) {
        const item = {
          key: `video-window-${index}`,
          kind: 'video',
          mediaPath: `pbs.twimg.com/ext_tw_video_thumb/window${index}/pu/img/a.jpg|`,
          videoSrc: `blob:https://x.com/window-${index}`,
          isGif: false,
          order: index,
        };
        const video = document.createElement('video');
        video.setAttribute('src', item.videoSrc);
        document.body.appendChild(video);
        item.sourceVideoRef = new WeakRef(video);
        hooks.state.itemMap.set(item.key, item);
        items.push(item);
      }
      hooks.state.items = items;
      hooks.state.lightboxIndex = 2;
      hooks.state.lightboxItemKey = items[2].key;
      hooks.refreshVideoRetentionWindow();
      const keys = Array.from(hooks.state.retainedVideoElements.keys());
      assert(keys.length === 3, `retention window should keep 3 videos, got ${keys.length}`);
      assert(keys.includes(items[2].key), 'retention window must keep the current video');
      assert(keys.includes(items[1].key) && keys.includes(items[3].key), 'retention window must prefer the nearest previous and next videos');
    },

    async 'video-watch-once'(hooks) {
      const item = { key: 'video-watch-once', kind: 'video', mediaPath: 'pbs.twimg.com/ext_tw_video_thumb/watchonce/pu/img/a.jpg|', videoSrc: '', isGif: false };
      const video = document.createElement('video');
      video.setAttribute('src', 'blob:https://x.com/watch-once');
      document.body.appendChild(video);
      let trackedAdds = 0;
      const originalAdd = video.addEventListener.bind(video);
      video.addEventListener = (type, listener, options) => {
        if (['loadedmetadata', 'loadeddata', 'canplay', 'durationchange', 'progress'].includes(type)) trackedAdds += 1;
        return originalAdd(type, listener, options);
      };
      hooks.watchVideoSource(item, video);
      hooks.watchVideoSource(item, video);
      assert(trackedAdds === 5, `the same video must be watched only once, got ${trackedAdds} listener registrations`);
    },

    async 'video-direct-priority'(hooks) {
      hooks.openOverlay();
      const item = {
        key: 'video-direct-priority',
        kind: 'video',
        mediaPath: 'pbs.twimg.com/ext_tw_video_thumb/direct001/pu/img/a.jpg|',
        videoMediaId: 'direct001',
        videoSrc: 'https://video.twimg.com/ext_tw_video/direct001/pu/vid/1280x720/direct.mp4',
        displayUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/direct001/pu/img/a.jpg',
        tweetUrl: 'https://x.com/example/status/301',
        isGif: false,
        order: 0,
      };
      hooks.state.lightboxItemKey = item.key;
      hooks.state.itemMap.set(item.key, item);
      hooks.playVideoInLightbox(item);
      assert(hooks.state.activeVideoPlaybackMode === 'direct-video-url', `normal MP4 URL must be attempted first, got ${hooks.state.activeVideoPlaybackMode}`);
      assert(hooks.state.activeVideoSession?.kind === 'direct-video-url', 'direct URL playback must own the active video session');
      hooks.cleanupActiveVideoSession();
    },

    async 'video-borrow-policy'(hooks) {
      const blobVideo = document.createElement('video');
      blobVideo.setAttribute('src', 'blob:https://x.com/borrowable');
      const normalVideo = document.createElement('video');
      normalVideo.setAttribute('src', 'https://example.com/not-borrowable.mp4');
      assert(hooks.isBorrowableVideoElement(blobVideo) === true, 'blob video should be eligible for last-resort borrowing');
      assert(hooks.isBorrowableVideoElement(normalVideo) === false, 'ordinary URL video must not be borrowed from X');
    },

    async 'video-session-abort'(hooks) {
      hooks.openOverlay();
      const item = {
        key: 'video-session-abort',
        kind: 'video',
        mediaPath: 'pbs.twimg.com/ext_tw_video_thumb/sessionabort/pu/img/a.jpg|',
        videoMediaId: 'sessionabort',
        videoSrc: 'https://video.twimg.com/ext_tw_video/sessionabort/pu/vid/640x360/a.mp4',
        displayUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/sessionabort/pu/img/a.jpg',
        tweetUrl: 'https://x.com/example/status/302',
        isGif: false,
        order: 0,
      };
      hooks.state.lightboxItemKey = item.key;
      hooks.state.itemMap.set(item.key, item);
      hooks.playVideoInLightbox(item);
      const signal = hooks.state.activeVideoSession?.abortController?.signal;
      assert(signal instanceof AbortSignal && !signal.aborted, 'active playback must own an AbortController signal');
      hooks.cleanupActiveVideoSession();
      assert(signal.aborted === true, 'leaving the media must abort playback listeners and timers');
      assert(hooks.state.activeVideoSession === null, 'active video session must be cleared');
    },


    async 'video-session-stale-event'(hooks) {
      hooks.openOverlay();
      const makeItem = (suffix, status) => ({
        key: `video-session-${suffix}`,
        kind: 'video',
        mediaPath: `pbs.twimg.com/ext_tw_video_thumb/${suffix}/pu/img/a.jpg|`,
        displayUrl: `https://pbs.twimg.com/ext_tw_video_thumb/${suffix}/pu/img/a.jpg`,
        tweetUrl: `https://x.com/example/status/${status}`,
        isGif: false,
        order: 0,
      });
      const itemA = makeItem('stale-a', 305);
      const itemB = makeItem('stale-b', 306);
      const sourceA = document.createElement('video');
      const sourceB = document.createElement('video');
      sourceA.setAttribute('src', 'blob:https://x.com/session-stale-a');
      sourceB.setAttribute('src', 'blob:https://x.com/session-stale-b');
      document.body.append(sourceA, sourceB);
      hooks.state.itemMap.set(itemA.key, itemA);
      hooks.state.itemMap.set(itemB.key, itemB);
      hooks.state.lightboxItemKey = itemA.key;
      hooks.mountBorrowedVideo(itemA, sourceA);
      const firstSignal = hooks.state.activeVideoSession?.abortController.signal;
      hooks.state.lightboxItemKey = itemB.key;
      hooks.mountBorrowedVideo(itemB, sourceB);
      assert(firstSignal?.aborted === true, 'switching videos must abort the previous playback session');
      sourceA.dispatchEvent(new Event('error'));
      assert(hooks.state.activeVideoSession?.itemKey === itemB.key, 'an old video event must not replace the current session');
      assert(hooks.state.activeVideoSession?.source === sourceB, 'the current borrowed source must remain mounted after an old event');
      hooks.cleanupActiveVideoSession();
    },

    async 'video-fallback-link'(hooks) {
      hooks.openOverlay();
      const item = {
        key: 'video-fallback-link',
        kind: 'video',
        displayUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/fallback/pu/img/a.jpg',
        tweetUrl: 'https://x.com/example/status/303',
        tweetText: 'fallback fixture',
        isGif: false,
      };
      hooks.showLightboxVideoFallback(item, '拡張機能内では再生できません。');
      const image = document.getElementById('xlg-lightbox-image');
      const video = document.getElementById('xlg-lightbox-video');
      const panel = document.getElementById('xlg-lightbox-video-error');
      const link = document.getElementById('xlg-lightbox-video-open-x');
      assert(image?.style.display === 'block', 'fallback must show the thumbnail');
      assert(video?.style.display === 'none', 'fallback must hide the unusable 0:00 player');
      assert(panel?.classList.contains('xlg-show'), 'fallback panel must be visible');
      assert(link?.href === item.tweetUrl, 'fallback must link to the original X post');
      assert(link?.textContent.includes('Xで再生'), 'fallback link must describe the result');
    },

    async 'video-borrow-restore'(hooks) {
      hooks.openOverlay();
      const item = {
        key: 'video-borrow-restore',
        kind: 'video',
        mediaPath: 'pbs.twimg.com/ext_tw_video_thumb/borrowrestore/pu/img/a.jpg|',
        displayUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/borrowrestore/pu/img/a.jpg',
        tweetUrl: 'https://x.com/example/status/304',
        isGif: false,
        order: 0,
      };
      const parent = document.createElement('div');
      const before = document.createElement('span');
      const source = document.createElement('video');
      source.setAttribute('poster', item.displayUrl);
      source.setAttribute('src', 'blob:https://x.com/borrow-restore');
      parent.append(source, before);
      document.body.appendChild(parent);
      hooks.state.lightboxItemKey = item.key;
      hooks.state.itemMap.set(item.key, item);
      const mounted = hooks.mountBorrowedVideo(item, source);
      assert(mounted === true, 'blob source should mount as a last-resort borrowed video');
      assert(source.parentElement?.id === 'xlg-lightbox-current', 'borrowed video should move into the lightbox');
      hooks.cleanupActiveVideoSession();
      assert(source.parentElement === parent, 'borrowed video should be restored to its original parent');
      assert(parent.firstChild === source, 'borrowed video should return to its original position');
    },

    async 'ui-accessibility'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      const launcher = document.getElementById('xlg-launcher');
      assert(launcher instanceof HTMLButtonElement, 'launcher should exist');
      launcher.click();
      await waitFor(() => hooks.state.active === true);
      assert(launcher.textContent.includes('Xの表示に戻る'), 'launcher should become the visible board exit control');
      assert(launcher.getAttribute('aria-pressed') === 'true', 'open board should be reflected with aria-pressed');

      const item = hooks.state.items[0];
      const cardButton = await waitFor(() => item.card.querySelector('.xlg-media-wrap'));
      assert(cardButton instanceof HTMLButtonElement, 'card media control should be keyboard focusable');
      cardButton.focus();
      hooks.openLightbox(item);
      await waitFor(() => document.getElementById('xlg-lightbox')?.classList.contains('xlg-lightbox-open'));
      await waitFor(() => document.activeElement?.id === 'xlg-lightbox-close');
      const lightbox = document.getElementById('xlg-lightbox');
      const imageLink = document.getElementById('xlg-lightbox-image-link');
      assert(!lightbox.hasAttribute('aria-modal'), 'background-operable lightbox must not claim modal semantics');
      assert(lightbox.getAttribute('aria-describedby') === 'xlg-lightbox-scroll-hint', 'background scroll guidance should describe the dialog');
      assert(imageLink instanceof HTMLAnchorElement, 'central image should be a real keyboard-operable link');
      assert(imageLink.href.endsWith('/yamada/status/1001'), 'central image link should target the source post');

      hooks.closeLightbox();
      await waitFor(() => document.activeElement === cardButton);
      hooks.showToast('続きを読み込み中…', { tone: 'loading' });
      const toast = document.getElementById('xlg-toast');
      await waitFor(() => toast?.classList.contains('xlg-show'));
      assert(toast.getAttribute('role') === 'status', 'toast should expose polite status semantics');
      assert(toast.classList.contains('xlg-toast-loading'), 'loading toast should expose its loading state');
      hooks.hideToast();

      launcher.click();
      await waitFor(() => hooks.state.active === false);
      assert(launcher.textContent.includes('いいねビューに変える'), 'launcher should return to the open-board label');
      assert(launcher.getAttribute('aria-pressed') === 'false', 'closed board should be reflected with aria-pressed');
    },


    async 'media-key-index'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      const [item] = hooks.state.items;
      assert(item.tweetStatusId === '1001', `tweet status ID should be stored separately, got ${item.tweetStatusId}`);
      assert(item.key === hooks.buildMediaKey(item.tweetStatusId, item.mediaPath), 'media key should use tweetStatusId and canonicalMediaPath only');
      assert(item.key === `1001|${item.mediaPath}`, `unexpected media key: ${item.key}`);
      assert(hooks.getItemIndex(item.key) === 0, 'item index map should resolve the first item without a linear search');
      assert(hooks.state.mediaPathIndex.get(item.mediaPath)?.has(item.key), 'media path index should contain the item key');
    },

    async 'card-unload-batch'(hooks) {
      await waitFor(() => hooks.state.items.length === 2);
      hooks.openOverlay();
      await waitFor(() => hooks.state.items.every((item) => item.hydrated));
      for (const item of hooks.state.items) hooks.queueCardUnload(item);
      hooks.queueCardUnload(hooks.state.items[0]);
      assert(hooks.state.cardUnloadQueue.size === 2, 'one queue entry should be kept per card');
      assert(Number(hooks.state.cardUnloadSweepTimer) > 0, 'all queued cards should share one sweep timer');
      await waitFor(() => hooks.state.items.every((item) => !item.hydrated), 2200);
      assert(hooks.state.cardUnloadQueue.size === 0, 'batch sweep should drain due card entries');
      hooks.clearCardUnloadQueue();
      hooks.closeOverlay();
    },

    async 'architecture-modules'(hooks) {
      const app = globalThis.__LIKED_MEDIA_MASONRY__;
      assert(app && typeof app === 'object', 'shared application namespace should exist');
      assert(app.state === hooks.state, 'all modules and test hooks should share one state object');
      assert(typeof app.settingsApi.loadSettings === 'function', 'settings module should register loadSettings');
      assert(typeof app.settingsApi.saveSettings === 'function', 'settings module should register saveSettings');
      assert(typeof app.diagnosticsApi.getDiagnostics === 'function', 'diagnostics module should register getDiagnostics');
      assert(typeof app.runtime.isLikesPage === 'function', 'main module should register runtime bridges');
      for (const moduleName of ['dom', 'video', 'board', 'lightbox', 'loading', 'routing', 'main']) {
        assert(app.modules[moduleName] && typeof app.modules[moduleName] === 'object', `${moduleName} module should be registered`);
      }
      assert(typeof app.modules.dom.buildMediaKey === 'function', 'DOM module should own media identity helpers');
      assert(typeof app.modules.board.queueCardUnload === 'function', 'board module should own batched card release');
      assert(typeof app.modules.loading.createLoadController === 'function', 'loading module should own LoadController');
      assert(document.getElementById('xlg-styles') === null, 'legacy injected style element should not be created');
      const launcher = document.getElementById('xlg-launcher');
      assert(launcher instanceof HTMLButtonElement, 'launcher should still be created after module split');
      assert(getComputedStyle(launcher).position === 'fixed', 'external content.css should style the launcher');
    },

    async 'diagnostics-privacy'(hooks) {
      await waitFor(() => hooks.state.items.length === 1);
      hooks.recordError(
        'load-controller-failed',
        new TypeError('failed at https://x.com/private-user/status/998877 for Private Display Name'),
        {
          attemptId: 7,
          source: 'popup-button',
          phase: 'waiting_for_x',
          tweetUrl: 'https://x.com/private-user/status/998877',
          author: 'Private Display Name',
          nested: { videoSrc: 'https://video.twimg.com/private/file.mp4' },
          arbitrarySecret: 'do-not-copy',
        },
      );
      hooks.recordError(
        'private-user-defined-code',
        new Error('https://video.twimg.com/private/unknown.mp4'),
        { tweetText: 'private tweet body', source: 'private-source' },
      );
      const diagnostics = hooks.getDiagnostics();
      const serialized = JSON.stringify(diagnostics);
      assert(Object.keys(diagnostics).sort().join(',') === 'environment,errors,extensionVersion,generatedAt,page,settings,state', 'diagnostics top-level fields should be fixed');
      assert(!Object.prototype.hasOwnProperty.call(diagnostics, 'browser'), 'full User-Agent field must not be present');
      assert(!Object.prototype.hasOwnProperty.call(diagnostics, 'platform'), 'raw platform field must not be present');
      assert(!Object.prototype.hasOwnProperty.call(diagnostics, 'language'), 'browser language should not be included');
      assert(Number.isInteger(diagnostics.environment.chromeMajorVersion) || diagnostics.environment.chromeMajorVersion === null, 'only Chrome major version should be reported');
      assert(['Windows', 'macOS', 'Linux', 'ChromeOS', 'Android', 'iOS', 'Other'].includes(diagnostics.environment.os), 'OS should be reduced to a fixed category');
      assert(!serialized.includes('private-user'), 'diagnostics must not include account or post URL data');
      assert(!serialized.includes('Private Display Name'), 'diagnostics must not include author display text');
      assert(!serialized.includes('video.twimg.com/private'), 'diagnostics must not include video URLs');
      assert(!serialized.includes('do-not-copy'), 'unknown context fields must be discarded');
      assert(!serialized.includes('private tweet body'), 'unknown error details must be discarded');
      const loadError = diagnostics.errors.find((entry) => entry.code === 'load-controller-failed');
      assert(loadError?.message === '追加読込処理に失敗しました。', 'error message should come from a fixed definition');
      assert(loadError?.errorName === 'TypeError', 'only a safe error class should be retained');
      assert(Object.keys(loadError?.context || {}).sort().join(',') === 'attemptId,phase,source', 'error context should contain only code-specific allowlisted fields');
      assert(diagnostics.errors.some((entry) => entry.code === 'unknown-error'), 'unknown codes should be collapsed to a fixed category');
    },

    async 'diagnostics-runtime-filter'(hooks) {
      const before = hooks.state.recentErrors.length;
      assert(hooks.isExtensionScriptErrorEvent({ filename: 'https://x.com/client-web/main.js' }) === false, 'X page errors must not be classified as extension errors');
      assert(hooks.recordRuntimeErrorEvent({
        filename: 'https://x.com/client-web/main.js',
        error: new Error('X page failure'),
        lineno: 10,
        colno: 20,
      }) === false, 'X page errors must not be recorded');
      assert(hooks.state.recentErrors.length === before, 'X page error should not change diagnostic errors');

      const rejection = typeof PromiseRejectionEvent === 'function'
        ? new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('X rejection') })
        : new Event('unhandledrejection');
      window.dispatchEvent(rejection);
      assert(hooks.state.recentErrors.length === before, 'page-wide unhandled rejections must not be collected');

      const extensionEvent = {
        filename: 'chrome-extension://lmm-test-extension/content/video.js',
        error: new TypeError('secret https://x.com/private/status/1'),
        lineno: 12,
        colno: 34,
      };
      assert(hooks.isExtensionScriptErrorEvent(extensionEvent) === true, 'known content script URL should be accepted');
      assert(hooks.recordRuntimeErrorEvent(extensionEvent) === true, 'extension script error should be recorded');
      const recorded = hooks.getDiagnostics().errors.at(-1);
      assert(recorded.code === 'runtime-error', 'extension script error should use fixed runtime code');
      assert(recorded.context.module === 'video', 'runtime error should expose only the module name');
      assert(recorded.context.line === 12 && recorded.context.column === 34, 'runtime error should retain numeric location only');
      assert(!JSON.stringify(recorded).includes('private/status'), 'runtime error must not retain its raw message');
    },
  };

  (async () => {
    const hooks = await waitFor(() => globalThis.__LMM_TEST_HOOKS__);
    const caseName = globalThis.__LMM_TEST_CASE__;
    const test = tests[caseName];
    if (!test) throw new Error(`No browser test registered for ${caseName}`);
    await test(hooks);
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS ${caseName}`;
  })().catch((error) => {
    resultNode.dataset.status = 'failed';
    resultNode.textContent = error?.stack || String(error);
  });
})();
