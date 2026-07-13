(() => {
  'use strict';

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'liked-media-masonry-settings-v2';
  const MESSAGE_NAMESPACE = 'liked-media-masonry';
  const defaults = {
    cardWidth: 300,
    includeVideo: false,
    closePositionBehavior: 'keep_scrolled_position',
    previewTransparency: 0,
  };

  const ui = {
    pageState: document.getElementById('page-state'),
    itemCount: document.getElementById('item-count'),
    toggleBoard: document.getElementById('toggle-board'),
    rescan: document.getElementById('rescan'),
    loadMore: document.getElementById('load-more'),
    scrollTop: document.getElementById('scroll-top'),
    reportErrors: document.getElementById('report-errors'),
    cardWidth: document.getElementById('card-width'),
    cardWidthPresets: Array.from(document.querySelectorAll('[data-card-width]')),
    cardWidthValue: document.getElementById('card-width-value'),
    previewTransparency: document.getElementById('preview-transparency'),
    previewTransparencyValue: document.getElementById('preview-transparency-value'),
    includeVideo: document.getElementById('include-video'),
    closePosition: document.getElementById('close-position'),
    status: document.getElementById('status'),
  };

  let activeTabId = null;
  let contentAvailable = false;
  let currentState = null;
  let settings = { ...defaults };
  let widthSaveTimer = 0;
  let previewSaveTimer = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSettings(raw = {}) {
    return {
      cardWidth: clamp(Number(raw.cardWidth) || defaults.cardWidth, 180, 640),
      includeVideo: Boolean(raw.includeVideo),
      closePositionBehavior: raw.closePositionBehavior === 'restore_open_position'
        ? 'restore_open_position'
        : 'keep_scrolled_position',
      previewTransparency: clamp(
        Number.isFinite(Number(raw.previewTransparency)) ? Number(raw.previewTransparency) : defaults.previewTransparency,
        0,
        90,
      ),
    };
  }


  function getMinimalEnvironment() {
    const brands = navigator.userAgentData?.brands || [];
    let chromeMajorVersion = null;
    for (const name of ['Google Chrome', 'Chromium']) {
      const brand = brands.find((entry) => entry?.brand === name);
      const major = Number.parseInt(brand?.version || '', 10);
      if (Number.isFinite(major)) {
        chromeMajorVersion = major;
        break;
      }
    }
    if (chromeMajorVersion === null) {
      const match = String(navigator.userAgent || '').match(/(?:Chrome|Chromium)\/(\d+)/i);
      const major = Number.parseInt(match?.[1] || '', 10);
      chromeMajorVersion = Number.isFinite(major) ? major : null;
    }
    const rawPlatform = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
    const os = /android/.test(rawPlatform) ? 'Android'
      : /(iphone|ipad|ipod|ios)/.test(rawPlatform) ? 'iOS'
        : /(cros|chrome os)/.test(rawPlatform) ? 'ChromeOS'
          : /win/.test(rawPlatform) ? 'Windows'
            : /(mac|darwin)/.test(rawPlatform) ? 'macOS'
              : /linux/.test(rawPlatform) ? 'Linux'
                : 'Other';
    return { chromeMajorVersion, os };
  }

  function setStatus(message, error = false) {
    ui.status.textContent = message || '';
    ui.status.classList.toggle('error', error);
  }

  function setBusy(busy) {
    for (const control of [
      ui.toggleBoard,
      ui.rescan,
      ui.loadMore,
      ui.scrollTop,
      ui.reportErrors,
      ui.cardWidth,
      ...ui.cardWidthPresets,
      ui.previewTransparency,
      ui.includeVideo,
      ui.closePosition,
    ]) {
      control.disabled = Boolean(busy);
    }
  }

  async function readStoredSettings() {
    try {
      const result = await extensionApi.storage.local.get(STORAGE_KEY);
      return normalizeSettings(result?.[STORAGE_KEY] || {});
    } catch (error) {
      console.warn('[Liked Media Masonry] 設定を読み込めませんでした。', error);
      return { ...defaults };
    }
  }

  async function writeStoredSettings() {
    await extensionApi.storage.local.set({
      [STORAGE_KEY]: { ...settings },
    });
  }

  async function findActiveTab() {
    const tabs = await extensionApi.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] || null;
  }

  async function sendToContent(type, payload = {}) {
    if (!activeTabId) throw new Error('操作対象のタブを確認できません。');
    return extensionApi.tabs.sendMessage(activeTabId, {
      namespace: MESSAGE_NAMESPACE,
      type,
      ...payload,
    });
  }

  function renderSettings() {
    ui.cardWidth.value = String(settings.cardWidth);
    ui.cardWidthValue.textContent = `${settings.cardWidth}px`;
    for (const button of ui.cardWidthPresets) {
      button.setAttribute('aria-pressed', Number(button.dataset.cardWidth) === settings.cardWidth ? 'true' : 'false');
    }
    ui.previewTransparency.value = String(settings.previewTransparency);
    ui.previewTransparencyValue.textContent = `${settings.previewTransparency}%`;
    ui.includeVideo.checked = settings.includeVideo;
    ui.closePosition.value = settings.closePositionBehavior;
  }

  function renderState() {
    const likesPage = Boolean(currentState?.isLikesPage);
    contentAvailable = Boolean(currentState);
    ui.pageState.textContent = likesPage
      ? currentState?.statusMessage || 'Xのいいね欄で利用できます'
      : contentAvailable
        ? 'Xのいいね欄を開いてください'
        : 'Xのいいね欄を再読み込みしてください';
    ui.itemCount.textContent = `${Number(currentState?.itemCount) || 0}件`;
    ui.toggleBoard.textContent = currentState?.boardOpen ? 'ボードを閉じる' : 'ボードを開く';

    const operationsEnabled = likesPage && !currentState?.isRebuilding;
    ui.toggleBoard.disabled = !operationsEnabled;
    ui.rescan.disabled = !operationsEnabled;
    ui.loadMore.disabled = !operationsEnabled || Boolean(currentState?.isLoadingMore);
    ui.scrollTop.disabled = !operationsEnabled || !currentState?.boardOpen;
  }

  async function refreshState() {
    try {
      currentState = await sendToContent('get-state');
      if (currentState?.settings) settings = normalizeSettings(currentState.settings);
    } catch {
      currentState = null;
    }
    renderSettings();
    renderState();
  }

  async function applySettings(partial, message = '設定を保存しました') {
    settings = normalizeSettings({ ...settings, ...partial });
    renderSettings();
    await writeStoredSettings();

    if (!contentAvailable) {
      setStatus('設定を保存しました。Xのいいね欄を再読み込みすると反映されます。');
      return;
    }

    try {
      currentState = await sendToContent('apply-settings', { settings });
      if (currentState?.settings) settings = normalizeSettings(currentState.settings);
      renderSettings();
      renderState();
      setStatus(message);
    } catch (error) {
      setStatus(`設定は保存しましたが、画面への反映に失敗しました: ${error.message}`, true);
    }
  }

  async function runAction(type, pendingMessage) {
    setStatus(pendingMessage);
    try {
      currentState = await sendToContent(type);
      renderState();
      setStatus(currentState?.error || currentState?.statusMessage || '操作を実行しました', !currentState?.ok);
    } catch (error) {
      setStatus(`操作できませんでした: ${error.message}`, true);
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }

  function installEvents() {
    ui.toggleBoard.addEventListener('click', async () => {
      await runAction(currentState?.boardOpen ? 'close-board' : 'open-board', 'ボード表示を切り替えています…');
    });
    ui.rescan.addEventListener('click', () => runAction('rescan', '画面内を再走査しています…'));
    ui.loadMore.addEventListener('click', () => runAction('load-more', '続きを読み込んでいます…'));
    ui.scrollTop.addEventListener('click', () => runAction('scroll-board-top', 'ボードの先頭へ移動しています…'));
    ui.reportErrors.addEventListener('click', async () => {
      setStatus('診断情報を作成しています…');
      try {
        const response = await sendToContent('get-diagnostics');
        const report = response?.diagnostics || {
          generatedAt: new Date().toISOString(),
          extensionVersion: extensionApi.runtime.getManifest().version,
          environment: getMinimalEnvironment(),
          note: 'Xの画面へ接続できなかったため、拡張機能メニュー側の情報だけです。',
        };
        await copyText(JSON.stringify(report, null, 2));
        setStatus('エラー報告をクリップボードへコピーしました');
      } catch (error) {
        setStatus(`エラー報告を作成できませんでした: ${error.message}`, true);
      }
    });

    const saveCardWidth = () => {
      window.clearTimeout(widthSaveTimer);
      widthSaveTimer = 0;
      applySettings({ cardWidth: Number(ui.cardWidth.value) });
    };
    ui.cardWidth.addEventListener('input', () => {
      ui.cardWidthValue.textContent = `${ui.cardWidth.value}px`;
      window.clearTimeout(widthSaveTimer);
      widthSaveTimer = window.setTimeout(saveCardWidth, 140);
    });
    ui.cardWidth.addEventListener('change', saveCardWidth);
    for (const button of ui.cardWidthPresets) {
      button.addEventListener('click', async () => {
        const width = Number(button.dataset.cardWidth);
        if (!Number.isFinite(width)) return;
        await applySettings({ cardWidth: width }, `カードの大きさを「${button.textContent.trim()}」に変更しました`);
      });
    }

    const savePreviewTransparency = () => {
      window.clearTimeout(previewSaveTimer);
      previewSaveTimer = 0;
      applySettings({ previewTransparency: Number(ui.previewTransparency.value) });
    };
    ui.previewTransparency.addEventListener('input', () => {
      ui.previewTransparencyValue.textContent = `${ui.previewTransparency.value}%`;
      window.clearTimeout(previewSaveTimer);
      previewSaveTimer = window.setTimeout(savePreviewTransparency, 140);
    });
    ui.previewTransparency.addEventListener('change', savePreviewTransparency);


    ui.includeVideo.addEventListener('change', async () => {
      const enabling = ui.includeVideo.checked;
      if (enabling) {
        setBusy(true);
        setStatus('動画/GIFを取得するため、いいね欄の先頭からボードを作り直しています…');
      }
      try {
        await applySettings(
          { includeVideo: enabling },
          enabling ? '動画/GIFを含めて先頭から更新しました' : '動画/GIFを非表示にしました',
        );
      } finally {
        setBusy(false);
        renderState();
      }
    });

    ui.closePosition.addEventListener('change', () => {
      applySettings({ closePositionBehavior: ui.closePosition.value });
    });

  }

  async function init() {
    installEvents();
    settings = await readStoredSettings();
    renderSettings();

    try {
      const tab = await findActiveTab();
      activeTabId = tab?.id || null;
    } catch (error) {
      setStatus(`タブを確認できませんでした: ${error.message}`, true);
    }

    await refreshState();
  }

  init();
})();
