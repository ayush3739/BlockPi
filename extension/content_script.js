/**
 * BlockPi — Content Script
 * Injected into every page. Sends a heartbeat TICK to the service worker
 * every 5 seconds while the page is visible (focused and not hidden).
 * 
 * Total overhead: ~30 lines, one setInterval, one visibility listener.
 */

(() => {
  const TICK_INTERVAL = 5000; // 5 seconds
  let intervalId = null;

  /**
   * Extract normalized domain from the current page
   */
  function getDomain() {
    return window.location.hostname.replace(/^www\./, '').toLowerCase();
  }

  /**
   * Send a TICK message to the service worker
   */
  function sendTick() {
    // Optimization: Only send ticks if this document is actually focused
    if (!document.hasFocus()) return;

    const domain = getDomain();
    if (!domain) return;

    try {
      chrome.runtime.sendMessage({
        type: 'TICK',
        domain: domain,
        path: window.location.pathname,
        timestamp: Date.now()
      });
    } catch (e) {
      // Extension context may be invalidated (e.g., extension updated/reloaded)
      stopHeartbeat();
    }
  }

  /**
   * Start the heartbeat interval
   */
  function startHeartbeat() {
    if (intervalId) return; // Already running
    // Send an immediate tick, then every 5s
    sendTick();
    intervalId = setInterval(sendTick, TICK_INTERVAL);
  }

  /**
   * Stop the heartbeat interval
   */
  function stopHeartbeat() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  /**
   * Handle visibility changes — only count time when the page is visible
   */
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  }

  // Listen for visibility changes (tab switching, minimizing, etc.)
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Start immediately if the page is visible
  if (document.visibilityState === 'visible') {
    startHeartbeat();
  }
})();
