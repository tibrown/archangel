` `
/*
 * This namespace has functions for communicating with the dsis site, uploads, queries
 */
var DsisUrl = function () {
  this.log = function (msg) {
    lg.log('DsisU:' + msg);
  }

  this.DoAjax = function (url, sendingPlayerId, data, sendResponse) {
    // LOCAL PORT: relay through the background service worker. A direct
    // request from the https game page to the plain-http bridge is blocked
    // as mixed content; the SW is exempt and holds the host_permissions.
    var body;
    if (url.match(/storage/)) {
      body = 'data=' + encodeURIComponent(JSON.stringify(data));
    } else {
      var params = new URLSearchParams();
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) params.append(k, data[k]);
      }
      body = params.toString();
    }
    chrome.runtime.sendMessage(new Message('background', 'BridgeFetch', { url: url, body: body }))
      .then(function (r) {
        if (!r || r.status != 'OK') {
          dsisU.log('*********************ERROR:' + (r && r.errorText));
          sendResponse({ status: 'error', errorText: '***************ERROR' + (r && r.errorText) });
          return;
        }
        try {
          sendResponse({ status: 'OK', data: r.data });
        } catch (e) {
          dsisU.log('Error thrown:' + e.message);
        }
      })
      .catch(function (err) {
        dsisU.log('*********************ERROR:' + err);
        sendResponse({ status: 'error', errorText: '***************ERROR' + err });
      });
  }

}
