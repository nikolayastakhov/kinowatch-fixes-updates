// ==UserScript==
// @name         kino.watch — оригинал и субтитры
// @namespace    local.kino-watch.preferences
// @version      1.1.1
// @description  Оригинальное аудио. Для EN/RU субтитры выключены, для других языков — русские или английские.
// @updateURL    https://raw.githubusercontent.com/nikolayastakhov/kinowatch-fixes-updates/main/kino-watch-original-audio.meta.js
// @downloadURL  https://raw.githubusercontent.com/nikolayastakhov/kinowatch-fixes-updates/main/kino-watch-original-audio.user.js
// @match        https://kino.watch/item/view/*
// @match        https://*.kino.watch/item/view/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const marker = '__kinoWatchOriginalAudioV1';
  if (window[marker]) return;
  window[marker] = true;

  // Match the site's explicit original-audio label, whatever its language is.
  // Never guess that English (or simply a non-Russian track) is the original.
  const originalLabel = /оригинал|(?:^|[\s.(\[])orig(?:inal)?\.?(?=$|[\s.)\]])/iu;
  const commentaryLabel = /комментар|commentary|audio description|тифло/iu;
  const requiredFunctions = [
    'getAudioTracks', 'selectAudioTrack', 'applySavedAudioPreference',
    'getSubtitleTracks', 'getSubtitleTrackKey',
    'applySavedSubtitlesPreference', 'saveItemSetting',
  ];
  let attempts = 0;

  function originalIndex(tracks) {
    return tracks.findIndex(track => track
      && originalLabel.test(String(track.label || ''))
      && !commentaryLabel.test(String(track.label || '')));
  }

  function normalizeLanguage(value) {
    const code = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
    if (['en', 'eng', 'english'].includes(code)) return 'en';
    if (['ru', 'rus', 'russian'].includes(code)) return 'ru';
    return /^[a-z]{2,3}$/.test(code) && !['und', 'mul', 'zxx'].includes(code) ? code : '';
  }

  function trackLanguage(track) {
    const language = normalizeLanguage(track?.language);
    if (language) return language;
    // Some manifests put the language only in the displayed label.
    const label = String(track?.label || '');
    if (/русск|(?:^|[^\p{L}])(?:ru|rus|russian)(?=$|[^\p{L}])/iu.test(label)) return 'ru';
    if (/английск|(?:^|[^\p{L}])(?:en|eng|english)(?=$|[^\p{L}])/iu.test(label)) return 'en';
    return normalizeLanguage(label.match(/\(([a-z]{2,3})(?:[-_][a-z]+)?\)/iu)?.[1]);
  }

  function isForced(track) {
    return track.forced === true
      || /(?:^|[^\p{L}])forced(?=$|[^\p{L}])|форсир|принудитель/iu.test(String(track.label || ''));
  }

  function install() {
    const player = document.querySelector('media-player#player');
    if (!player || requiredFunctions.some(name => typeof window[name] !== 'function')) {
      if (++attempts < 300) window.setTimeout(install, 100);
      else console.warn('[kino.watch] Плеер не найден. Скрипт настроек не подключён.');
      return;
    }

    const savedAudioPreference = window.applySavedAudioPreference;
    const savedSubtitlesPreference = window.applySavedSubtitlesPreference;

    function chooseOriginal(...args) {
      const tracks = Array.from(window.getAudioTracks());
      const index = originalIndex(tracks);

      if (index === -1) {
        // With no explicitly marked original, keep the site's saved/default audio.
        return savedAudioPreference.apply(this, args);
      }
      if (!tracks[index].selected) window.selectAudioTrack(index);
    }

    function chooseSubtitles(...args) {
      const audioTracks = Array.from(window.getAudioTracks());
      const language = trackLanguage(audioTracks[originalIndex(audioTracks)]);
      const subtitles = Array.from(window.getSubtitleTracks());
      let index = -1;

      if (language && language !== 'en' && language !== 'ru') {
        for (const preferredLanguage of ['ru', 'en']) {
          // Prefer full subtitles within each language over Forced-only tracks.
          const matches = subtitles.map((track, i) => ({ track, i }))
            .filter(({ track }) => trackLanguage(track) === preferredLanguage);
          const match = matches.find(({ track }) => !isForced(track)) || matches[0];
          if (match) {
            index = match.i;
            break;
          }
        }
      }

      // Use the site's storage and activation logic, including the explicit off state.
      const setting = index < 0 ? 'off' : window.getSubtitleTrackKey(subtitles[index], index);
      window.saveItemSetting('vp_subs', setting);
      const result = savedSubtitlesPreference.apply(this, args);
      if (index >= 0) {
        const captions = document.querySelector('media-captions.player-captions');
        if (captions) captions.style.display = '';
      }
      return result;
    }

    // The player invokes these on metadata load and again 800 ms later.
    // Replacing these callbacks prevents that second pass restoring the old choice.
    window.applySavedAudioPreference = chooseOriginal;
    window.applySavedSubtitlesPreference = chooseSubtitles;

    // Track lists can arrive after metadata, or be replaced on a quality change.
    // Batch their events, but leave manual audio/subtitle selection available.
    let audioPending = false;
    let subtitlesPending = false;
    let queued = false;
    function schedule(audio, subtitles) {
      audioPending ||= audio;
      subtitlesPending ||= subtitles;
      if (queued) return;
      queued = true;
      window.queueMicrotask(() => {
        const applyAudio = audioPending;
        const applySubtitles = subtitlesPending;
        audioPending = subtitlesPending = queued = false;
        if (applyAudio) chooseOriginal();
        // Audio can arrive after subtitles; its language must update their choice too.
        if (applyAudio || applySubtitles) chooseSubtitles();
      });
    }

    player.addEventListener('audio-tracks-change', () => schedule(true, false));
    player.addEventListener('text-tracks-change', () => schedule(false, true));

    // Also handle installing/enabling the userscript after a player already exists.
    chooseOriginal();
    chooseSubtitles();
  }

  install();
})();
