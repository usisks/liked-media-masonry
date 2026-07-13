(() => {
  'use strict';

  const app = globalThis.__LIKED_MEDIA_MASONRY__;
  if (!app) throw new Error('Liked Media Masonry namespace is not initialized.');

  const { extensionApi, state } = app;
  const { STORAGE_KEY, LEGACY_STORAGE_KEYS, PREVIEW_TRANSPARENCY_DEFAULT } = app.config;
  const { clamp } = app.helpers;

  async function loadSettings() {
    const defaults = {
      cardWidth: 300,
      includeVideo: false,
      closePositionBehavior: 'keep_scrolled_position',
      previewTransparency: PREVIEW_TRANSPARENCY_DEFAULT,
    };

    try {
      if (!extensionApi?.storage?.local) throw new Error('storage APIを利用できません。');
      const storageKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
      const result = await extensionApi.storage.local.get(storageKeys);
      const currentSaved = result?.[STORAGE_KEY];
      const legacySaved = LEGACY_STORAGE_KEYS
        .map((key) => result?.[key])
        .find((value) => value && typeof value === 'object');
      const saved = currentSaved && typeof currentSaved === 'object'
        ? currentSaved
        : legacySaved || {};

      const legacyCloseBehavior = saved.lightboxCloseBehavior === 'restore'
        ? 'restore_open_position'
        : 'keep_scrolled_position';
      const closePositionBehavior = saved.closePositionBehavior === 'restore_open_position'
        ? 'restore_open_position'
        : saved.closePositionBehavior === 'keep_scrolled_position'
          ? 'keep_scrolled_position'
          : legacyCloseBehavior;

      state.settings = {
        cardWidth: clamp(Number(saved.cardWidth) || defaults.cardWidth, 180, 640),
        includeVideo: Boolean(saved.includeVideo),
        closePositionBehavior,
        previewTransparency: clamp(
          Number.isFinite(Number(saved.previewTransparency))
            ? Number(saved.previewTransparency)
            : defaults.previewTransparency,
          0,
          90,
        ),
      };

      const supportedSettingKeys = new Set([
        'cardWidth',
        'includeVideo',
        'closePositionBehavior',
        'previewTransparency',
      ]);
      const hasUnsupportedSetting = Object.keys(saved).some((key) => !supportedSettingKeys.has(key));

      if (
        !currentSaved
        || saved.lightboxCloseBehavior
        || Object.prototype.hasOwnProperty.call(saved, 'hideNavigationArrows')
        || !Object.prototype.hasOwnProperty.call(saved, 'previewTransparency')
        || hasUnsupportedSetting
      ) {
        await saveSettings();
      }

      if (legacySaved && extensionApi.storage.local.remove) {
        await extensionApi.storage.local.remove(LEGACY_STORAGE_KEYS);
      }
    } catch (error) {
      console.warn('[Liked Media Masonry] 設定の読み込みに失敗しました。', error);
      state.settings = { ...defaults };
    }
  }

  async function saveSettings() {
    try {
      if (!extensionApi?.storage?.local) throw new Error('storage APIを利用できません。');
      await extensionApi.storage.local.set({
        [STORAGE_KEY]: { ...state.settings },
      });
    } catch (error) {
      console.warn('[Liked Media Masonry] 設定の保存に失敗しました。', error);
    }
  }

  Object.assign(app.settingsApi, { loadSettings, saveSettings });
})();
