/*
 * All requests to dsis for data go here
 */

var DsisRequests = function() {
  var _url = '/script';
  this.log = function(msg) {
    lg.log('DsisRequests:' + msg);
  }

  this.MakeRequest = function(req, dsisServer, sendResponse) {
    try {
      var url = 'http://' +
        dsisServer.dsisHost +
        '/' + dsisServer.dbName +
        '/parse/script';
      var data = encodeURIComponent(JSON.stringify(req));
      var body = 'data=' + data;

      // LOCAL PORT: content scripts run in the https game page, where a plain
      // http fetch to the bridge is blocked as mixed content. Relay through the
      // background service worker (extension origin, host_permissions apply).
      // Content scripts are the only context without chrome.tabs.
      var inContentScript = (typeof chrome !== 'undefined' && !chrome.tabs);
      var doFetch = inContentScript
        ? chrome.runtime.sendMessage(new Message('background', 'BridgeFetch', { url: url, body: body }))
            .then(function (r) {
              if (!r || r.status != 'OK') throw new Error((r && r.errorText) || 'BridgeFetch failed');
              return r.data;
            })
        : fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: body
          }).then(function (resp) { return resp.json(); });

      doFetch.then(function (data) {
        try {
          sendResponse({
            status: 'OK',
            data: data
          });
        } catch (e) {
          dsisReq.log('ajax:Error thrown:' + e.message);
        }
      }).catch(function (err) {
        dsisReq.log('*********************ERROR:' + err);
        lg.debug('http error in dsisReq.MakeRequest', 'error', {
          details: { url: url, error: String(err) }
        });
        if (typeof ctF != 'undefined') ctF.DisplayStatus('Error from DSIS server');
        sendResponse({
          status: 'error',
          errorText: '***************ERROR' + err
        });
      });

    } catch (e) {
      dsisReq.log('MakeRequest:Error thrown:' + e.message);
    }
  }
}
