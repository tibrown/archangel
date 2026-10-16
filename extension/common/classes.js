// Base classes - when we need the same format many times.

// class for storing tab metadata for tabs, in background
// Safe regex capture helper. Legacy code did source.match(/re/)[n] and
// /re/.exec(source)[n], which throws "Cannot read properties of null" when
// the source is null/undefined (missing DOM attribute, empty jQuery set) or
// the pattern doesn't match (DOM drift). Returns '' instead of crashing.
// Defined in common/classes.js because it is loaded in every context:
// content scripts, the background service worker, popups, sidebar and options.
var safeMatch = function (source, re, idx) {
  if (source == null) return '';
  var m = String(source).match(re);
  return (m && m[idx] != null) ? m[idx] : '';
};

var TabMetadata = function(_tabId, _windowId) {
  this.TabId = _tabId;
  this.WindowId = _windowId;
  this.Url = null;
  this.GmServerJson = null;
  this.GmServer = null;
  this.IsOptions = false;
  this.IsDsis = false;
  this.IsGmServer = false;
  this.IsPopup = false;

  this.GetUrl = function(callback) {
    var self = this;
    chrome.tabs.query({
        active: true,
        windowId: chrome.windows.WINDOW_ID_CURRENT
      })
      .then(function (tabs) {
        if (!tabs || !tabs.length) throw new Error('no active tab');
        return chrome.tabs.get(tabs[0].id);
      })
      .then(function (tab) {
        if (!tab || !tab.url) throw new Error('no tab url');
        return new URL(tab.url);
      })
      .then(function (url) {
        self.Url = url;
        if (url.href.match(/options.html/)) self.IsOptions = true;
        if (url.href.match(/angeldsis.com/)) self.IsDsis = true;
        if (url.href.match(/astroempires.com/)) self.IsGmServer = true;
        if (url.href.match(/about:blank/)) self.IsPopup = true;
        econs.CallBack(callback, self.Url);
      })
      .catch(function () {
        // benign — no active tab or no resolvable URL yet (e.g. about:blank);
        // skip this activation rather than leaving an unhandled rejection.
      });
  }

}


var ScoutFleet = function(_fleetId, _orig, _dest, _size) {

  return {
    fleetId: _fleetId,
    origination: _orig,
    location: _orig,
    destination: _dest,
    arrival: 0,
    size: _size,
    scannedRegion: null
  }
}

// dataupload class
var DataUpload = function(_gmServer, _data) {
  this.gmServer = _gmServer;
  this.data = _data;
}

// upload to dsis db -- the json dsis is expecting
var DsisDbUpload = function() {
  this.serv = '';
  this.servid = '';
  this.load_time = '';
  this.local_load_time = '';
  this.local_upload_time = Date.now();
  this.data = [];
  this.extra_data = {};
  this.sign = '';
}
// our tab-port data
// not sure if we need the port itself
var TabData = function(_port, _serverType, _gmServer = null) {
  this.id = _port.sender.tab.windowId + '-' + _port.sender.tab.id;
  this.windowId = _port.sender.tab.windowId;
  this.tabId = _port.sender.tab.id;
  this.port = _port;
  this.gmServer = _gmServer;
  this.serverType = _serverType;
  this.logEntries = [];
}
// standard message class
var Message = function(_target, _action, _args) {
  this.target = _target;
  this.action = _action;
  this.actionArgs = _args;
}
