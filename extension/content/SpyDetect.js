// handle spy detection
//
// Astro Empires randomly injects spy scripts into its pages that take a DOM
// copy and exfiltrate it for bot/script detection. The old DSIS server tagged
// two markers it knows appear in those scripts:
//   - "js_jquery_debug"
//   - "debug.aspx"
// When either is present we must NOT write anything to the page/DOM.
//
// This object holds a sticky flag, kept in window.sessionStorage so it is
// available synchronously before the first DOM write on a freshly-navigated
// page, and mirrored to chrome.storage.local so it survives keep-alive. Content
// scripts cannot use chrome.storage.session ("Access to storage is not allowed
// from this context") — only the extension's own trusted contexts can — so the
// mirror uses local, which content scripts are permitted to access.
// It also keeps a set of "turn off" hooks that remove any DOM the extension has
// already injected on the current page.

var SpyDetect = function () {
  var turnOffHooks = [];
  var self = this;

  this._off = false;

  // Fire registered cleanup hooks (e.g. bHints.RemoveUI) and mark spy as found.
  this.TurnOff = function () {
    self._off = true;
    try {
      if (window.sessionStorage) window.sessionStorage.setItem('dsis_spy_found', '1');
    } catch (e) { /* storage unavailable — flag stays in-memory for this page */ }
    try {
      chrome.storage.local.set({ dsis_spy_found: true }, function () {
        if (chrome.runtime.lastError) void chrome.runtime.lastError; // swallow "not allowed from this context"
      });
    } catch (e) { /* ignore */ }
    $.each(turnOffHooks, function (index, hook) {
      try {
        econs.CallBack(hook, 'Shut it down');
      } catch (e) { /* a broken hook must not stop the others */ }
    });
  };

  this.AddHook = function (func) {
    turnOffHooks.push(func);
  };

  // True once a spy script has been detected this session — callers that write
  // to the DOM must check this and bail out.
  this.IsSpyFound = function () {
    return self._off;
  };

  // Called once at content-script startup. Restores any previous session flag
  // (synchronous sessionStorage first) and scans the live document.
  this.Restore = function () {
    try {
      if (window.sessionStorage && window.sessionStorage.getItem('dsis_spy_found')) {
        self._off = true;
      }
    } catch (e) { /* ignore */ }
    self.ScanDocument();
    try {
      chrome.storage.local.get('dsis_spy_found', function (s) {
        if (s && s.dsis_spy_found) self._off = true;
      });
    } catch (e) { /* ignore */ }
  };

  // Scan the live document for the spy markers, in case a spy script is present
  // on the page we're looking at rather than only in a fetched response.
  this.ScanDocument = function () {
    try {
      var html = document.documentElement ? document.documentElement.innerHTML : '';
      if (html.indexOf('js_jquery_debug') != -1 || html.indexOf('debug.aspx') != -1) {
        self.TurnOff();
      }
    } catch (e) { /* ignore */ }
  };
};