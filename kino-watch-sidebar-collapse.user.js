// ==UserScript==
// @name         KinoPub Sidebar Collapse
// @namespace    http://kino.pub/
// @version      3.1.1
// @description  Штатное меню kino.watch: бургер на всех ширинах и раскрытие по наведению мыши.
// @updateURL    https://raw.githubusercontent.com/nikolayastakhov/kinowatch-fixes-updates/main/kino-watch-sidebar-collapse.meta.js
// @downloadURL  https://raw.githubusercontent.com/nikolayastakhov/kinowatch-fixes-updates/main/kino-watch-sidebar-collapse.user.js
// @match        https://kino.watch/*
// @match        https://*.kino.watch/*
// @match        https://kino.pub/*
// @match        https://*.kino.pub/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const styleId = 'kp-native-sidebar-style';
  const css = `
    /* A regular offcanvas keeps Bootstrap's animation, focus trap and backdrop
       at every width. Undo only the site's permanent desktop sidebar layout. */
    html[data-kp-native-sidebar] #kpSidebar.offcanvas {
      top: 0;
      bottom: 0;
      height: auto;
      z-index: var(--bs-offcanvas-zindex);
      overflow-y: visible;
    }

    @media (min-width: 992px) {
      html[data-kp-native-sidebar] .kp-topbar
        button[data-bs-toggle="offcanvas"][data-bs-target="#kpSidebar"] {
        display: inline-flex !important;
      }

      html[data-kp-native-sidebar] .kp-topbar > .container-fluid {
        padding-left: calc(var(--bs-gutter-x, 1.5rem) * .5);
      }

      html[data-kp-native-sidebar] .kp-topbar .kp-brand {
        width: auto;
        padding-left: 0;
        justify-content: center;
      }

      html[data-kp-native-sidebar] .kp-main {
        margin-left: 0;
      }

      /* Match the site's mobile close button's native 44 px touch target. */
      html[data-kp-native-sidebar] #kpSidebar .offcanvas-header .btn-close {
        padding: calc((var(--kp-tap) - 1em) / 2);
        margin: calc((1em - var(--kp-tap)) / 2)
          calc((1em - var(--kp-tap)) / 2)
          calc((1em - var(--kp-tap)) / 2) auto;
      }
    }
  `;

  function bindHover(sidebar, toggle, close) {
    if (sidebar.hasAttribute('data-kp-sidebar-hover')) return;
    sidebar.setAttribute('data-kp-sidebar-hover', '');

    const hover = matchMedia('(hover: hover) and (pointer: fine)');
    const openDelay = 100;
    const closeDelay = 300;
    let phase = sidebar.classList.contains('show') ? 'open' : 'closed';
    let hoverOwned = false;
    let automaticAction = null;
    let blocked = false;
    let pendingClose = false;
    let forceClose = false;
    let reopen = false;
    let openTimer = null;
    let closeTimer = null;
    let pointer = { x: -1, y: -1 };

    const clearOpen = () => { clearTimeout(openTimer); openTimer = null; };
    const clearClose = () => { clearTimeout(closeTimer); closeTimer = null; };
    function contains(element) {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && pointer.x >= rect.left && pointer.x < rect.right
        && pointer.y >= rect.top && pointer.y < rect.bottom;
    }
    // Geometric bounds keep the trigger's area usable while the opening panel
    // and backdrop cover it and retarget pointer events to a different element.
    const inside = () => contains(toggle) || (phase !== 'closed' && contains(sidebar));
    function nativeAction(action, element) {
      automaticAction = action;
      try { element.click(); } finally { automaticAction = null; }
    }
    function requestOpen() {
      clearOpen();
      if (!hover.matches || blocked) return;
      if (phase === 'closing') { reopen = true; return; }
      if (phase !== 'closed') return;
      openTimer = setTimeout(() => {
        openTimer = null;
        if (phase === 'closed' && hover.matches && !blocked && contains(toggle)) {
          nativeAction('show', toggle);
        }
      }, openDelay);
    }
    function requestClose() {
      clearClose();
      if (!hoverOwned) return;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!hoverOwned || inside()) return;
        if (phase === 'opening') pendingClose = true;
        else if (phase === 'open') nativeAction('hide', close);
      }, closeDelay);
    }
    function enter(event) {
      if (event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      clearClose();
      pendingClose = false;
      if (event.currentTarget === toggle) requestOpen();
    }
    function leave(event) {
      if (event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      if (inside()) return;
      blocked = false;
      reopen = false;
      clearOpen();
      requestClose();
    }

    toggle.addEventListener('pointerenter', enter);
    toggle.addEventListener('pointerleave', leave);
    sidebar.addEventListener('pointerenter', enter);
    sidebar.addEventListener('pointerleave', leave);
    toggle.addEventListener('click', () => {
      if (automaticAction === 'show') return;
      hoverOwned = false;
      pendingClose = false;
      clearOpen();
      clearClose();
    });
    sidebar.addEventListener('keydown', event => {
      if (event.key === 'Escape' || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      // A real keyboard action takes ownership; Bootstrap's automatic focus
      // when showing a modal must not make a hover session permanent.
      hoverOwned = false;
      pendingClose = false;
      clearClose();
    });
    sidebar.addEventListener('show.bs.offcanvas', event => {
      phase = 'opening';
      hoverOwned = automaticAction === 'show';
      clearOpen();
      clearClose();
      queueMicrotask(() => {
        if (event.defaultPrevented) { phase = 'closed'; hoverOwned = false; }
      });
    });
    sidebar.addEventListener('shown.bs.offcanvas', () => {
      phase = 'open';
      if (hoverOwned && (forceClose || (pendingClose && !inside()))) {
        nativeAction('hide', close);
      } else if (hoverOwned && !inside()) requestClose();
      pendingClose = false;
    });
    sidebar.addEventListener('hide.bs.offcanvas', event => {
      phase = 'closing';
      clearOpen();
      clearClose();
      pendingClose = false;
      if (automaticAction !== 'hide') blocked = true;
      queueMicrotask(() => {
        if (event.defaultPrevented) phase = 'open';
      });
    });
    sidebar.addEventListener('hidden.bs.offcanvas', () => {
      phase = 'closed';
      hoverOwned = false;
      forceClose = false;
      if (reopen && contains(toggle)) requestOpen();
      reopen = false;
    });
    document.addEventListener('pointermove', event => {
      if (!blocked || event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!inside()) blocked = false;
    }, { passive: true });
    function stopHover() {
      clearOpen();
      clearClose();
      reopen = false;
      if (!hoverOwned) return;
      blocked = true;
      forceClose = true;
      if (phase === 'open') nativeAction('hide', close);
    }
    window.addEventListener('blur', stopHover);
    hover.addEventListener('change', () => { if (!hover.matches) stopHover(); });
  }

  function activate() {
    const root = document.documentElement;
    const sidebar = document.querySelector('#kpSidebar.kp-sidebar.offcanvas-start');
    const toggle = document.querySelector(
      '.kp-topbar button[data-bs-toggle="offcanvas"][data-bs-target="#kpSidebar"]',
    );

    // Leave the old design and pages without the site's own menu untouched.
    const close = sidebar?.querySelector('[data-bs-dismiss="offcanvas"]');
    if (!root || !sidebar || !toggle || !close) return false;
    if (!sidebar.classList.contains('offcanvas-lg')
        && !sidebar.classList.contains('offcanvas')) return false;

    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      (document.head || root).appendChild(style);
    }

    // Keep the same element and any existing Bootstrap instance. The site's
    // data-bs-toggle / data-bs-dismiss handlers remain in charge of all actions.
    sidebar.classList.replace('offcanvas-lg', 'offcanvas');
    root.setAttribute('data-kp-native-sidebar', '');
    bindHover(sidebar, toggle, close);
    return true;
  }

  if (activate() || document.readyState !== 'loading') return;

  // The server-rendered menu can arrive after this document-start script.
  // Stop observing once it is ready, or when parsing finishes on other pages.
  const observer = new MutationObserver(() => {
    if (activate()) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    activate();
    observer.disconnect();
  }, { once: true });
})();
