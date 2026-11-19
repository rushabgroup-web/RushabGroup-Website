/**
 * Rushab Group - Security & Anti-Inspection Shield
 * Disables inspection tools, right click, source viewing, and console tampering across all pages.
 */
(function() {
  'use strict';

  // 1. Block Context Menu (Right Click)
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  }, { capture: true, passive: false });

  // 2. Block Developer & Source Inspection Keyboard Shortcuts
  window.addEventListener('keydown', function(e) {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const key = (e.key || '').toLowerCase();
    const code = e.keyCode || e.which;

    // F12
    if (code === 123 || key === 'f12') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    // Ctrl+Shift+C / Cmd+Option+C (Inspect Element)
    // Ctrl+Shift+K (Firefox Web Console)
    if (isCtrlOrMeta && isShift && (code === 73 || code === 74 || code === 67 || code === 75 || key === 'i' || key === 'j' || key === 'c' || key === 'k')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+U / Cmd+Option+U (View Page Source)
    if (isCtrlOrMeta && (code === 85 || key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+S / Cmd+S (Save Page to Disk)
    if (isCtrlOrMeta && (code === 83 || key === 's')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+P / Cmd+P (Print Page)
    if (isCtrlOrMeta && (code === 80 || key === 'p')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true, passive: false });

  // 3. Block Dragging of images and links
  document.addEventListener('dragstart', function(e) {
    if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'A')) {
      e.preventDefault();
      return false;
    }
  }, { capture: true, passive: false });

  // 4. Console Sanitization & Warning
  try {
    const c = window.console;
    if (c) {
      const bannerTitle = '%cSTOP! %cRushab Group Protected System';
      const style1 = 'color:#ef4444;font-size:28px;font-weight:900;';
      const style2 = 'color:#ffffff;font-size:16px;font-weight:700;';
      const noticeStyle = 'color:#94a3b8;font-size:12px;line-height:1.6;font-family:sans-serif;';
      
      const printWarning = function() {
        if (c.clear) c.clear();
        c.log(bannerTitle, style1, style2);
        c.log('%cThis web application is protected. Inspection, source copying, and unauthorized tampering are strictly monitored.', noticeStyle);
      };

      printWarning();
    }
  } catch (err) {}
})();
