
/*
 * This namespace has functions for communicating with the dsis site, uploads, queries
 */
var dsisIoFuncs = function () {
  this.log = function (msg) {
    lg.log('DsisIo:' + msg);
  }

  this.DoAjax = function (url, sendingPlayerId, data, sendResponse, errorHandler) {
    var body;
    if (url.match(/storage/) || url.match(/angellog/)) {
      // single form field: data=<urlencoded JSON>, with PlayerId injected
      data.PlayerId = sendingPlayerId;
      body = 'data=' + encodeURIComponent(JSON.stringify(data));
    } else if (typeof data === 'string') {
      body = data;
    } else {
      // object -> form-encoded (dataupload sends {data, server})
      var params = new URLSearchParams();
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) params.append(k, data[k]);
      }
      body = params.toString();
    }
    // MV3: fetch() — no XHR/jQuery in a service worker.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body
    }).then(function (resp) {
      return resp.json();
    }).then(function (data) {
      try {
        if (data.status && data.status != 'OK') {
          dsisioF.log('Server side ERROR:' + data.status + ',' + data.error);
          econs.CallBack(errorHandler, data);
          return;
        }
        sendResponse({
          status: 'OK',
          data: data
        });
      } catch (e) {
        dsisioF.log('DoAjax.success:Error thrown:' + e.message);
      }
    }).catch(function (err) {
      dsisioF.log('*********************ERROR:' + err);
      lg.debug('http error in dsisIo.DoAjax', 'error', {
        details: { url: url, error: String(err) }
      });
      sendResponse({
        status: 'error',
        errorText: '***************ERROR' + err,
        response: null
      });
    });
  }

}
