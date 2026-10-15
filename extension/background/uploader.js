/*
 * This namespace is responsible for Q'ing up the data to be uploaded.
 */

var upload = function() {
  var _UserDataType = 1;
  var _CentralDataType = 2;
  var _userQueue = [];
  var _centralQueue = [];

  this.UserDataType = _UserDataType;
  this.CentralDataType = _CentralDataType;

  this.log = function(msg) {
    lg.log('Uploader:' + msg);
  }

  this.Lock = false;
  this.LockCnt = 5;

  this.DoUploadUserData = function(data, gs) {
    try {
      if(bgF.HasDsisServer(gs) === false) {
        upL.log('DoUploadUserData:No DSIS Server');
        return;
      }
      var f = function() {
        upL.AddToQueue(gs, upL.UserDataType, data);
      }
      var waitForLock = function() {
        upL.log('Upload Q is busy, waiting...' + upL.LockCnt);
        setTimeout(function() {
          upL.LockCnt--;
          if (upL.Lock === true && upL.LockCnt > 0) {
            waitForLock();
            return;
          }
          upL.log('upL.Lock == false, after wait');
          f();
          return;
        }, 500);
      }
      if (upL.Lock === true) {
        waitForLock();
        return;
      }
      upL.log('upL.Lock == false');
      f();
    } catch (e) {
      lg.debug(e, 'Error in Uploader.DoUploadUserData:', {
        stack: true
      });
    }
  }
  /*
   * determin which queue to add the data
   * and add it
   */
  this.AddToQueue = function(gmServer, dataType, data) {
    try {
      if(bgF.HasDsisServer(gmServer) === false) {
        upL.log('AddToQueue:No DSIS Server');
        return;
      }
      upL.Lock = true;
      var d = new DataUpload(gmServer, data);
      if (dataType == _UserDataType) {
        _userQueue.push(d);
        upL.log('Data added to User Queue');
        upL.FlushUserUpload(gmServer, function(resp) {
          upL.Lock = false;
          var r = JSON.stringify(resp);
          if (r.indexOf('NOSESSION') != -1) {
            upL.log('NOSESSION - need to login to the DSIS Site');
            econs.DisplayStatus('No DSIS SESSION - login or refresh the DSIS Site');
            comms.NotifyOfNoDsis({status: 'ERROR', message: 'No DSIS SESSION - login or refresh the DSIS Site'}, comms.LastTabId);
          }
        });
      }
      if (dataType == _CentralDataType) {
        _centralQueue.push(d);
        upL.log('Data added to Central Queue');
      }
    } catch (e) {
      lg.debug(e, 'Error in Uploader.AddToQueue:', {
        stack: true
      });
    }
  }

  this.UpArr = [];
  // iterate over Q
  this.DoUserUpload = function(gmServer, callback) {
    try {
      if(bgF.HasDsisServer(gmServer) === false) {
        upL.log('DoUserUpload:No DSIS Server');
        econs.CallBack(callback, 'NOSESSION');
        return;
      }

      if (_userQueue.length == 0) {
        // nothing to upload
        upL.log('Nothing to Upload');
        econs.CallBack(callback, {
          displayText: 'Nothing to upload'
        });
        return;
      }
      var ajaxit = function() {
        try {
          dsisioF.DoAjax(url, ds.playerId, dt, function(resp) {
            if(!resp.called) { // not dataupload
              econs.CallBack(callback, resp);
              return;
            }
            econs.CallBack(callback, resp);
          }, function(resp) {
            // error handler
            if(resp.status == 'NOSESION') {
              bgFuncs.ReloadDsis();
              econs.CallBack(callback, resp);
              return;
            }
          });
          return;
        } catch (e) {
          lg.debug(e, 'Error in Uploader.DoUserUpload.ajaxit:', {
            stack: true
          });
        }
      }
      var dsisServer = null;
      var getChunks = function() {
        var upArr = [];
        // get list of data chunks
        for (var i = 0; i < _userQueue.length; i++) {
          var d = _userQueue[i];

          if (d.gmServer.serverName == gmServer.serverName) {
            upArr.push(d.data);
          }
        }
        upL.UpArr = upArr;
        // temp // HACK:
        _userQueue = [];
      }

      if (upL.UpArr.length == 0) getChunks();

      // get the dsis server
      var dsisServers = gmServer.DsisServers;
      if (!dsisServers || dsisServers.length == 0) {
        econs.CallBack(callback, 'NOSESSION');
        return;
      }
      for (var d = 0; d < dsisServers.length; d++) {
        var ds = dsisServers[d];
        var url = 'http://' + ds.dsisHost + '/' +
          ds.dbName +
          '/parse/dataupload?sendingPlayerId=' +
          ds.playerId +
          '&ver=0.349.69';
        var dt = {
          data: JSON.stringify(upL.UpArr),
          server: gmServer.serverName
        };
        upL.log('Upload [' + ds.dbName + '] array:' + JSON.stringify(dt).substring(0, 50));
        ajaxit();
      }
      upL.UpArr = [];
    } catch (e) {
      lg.debug(e, 'Error in Uploader.DoUserUpload:', {
        stack: true
      });
    }
  }
  /*
   * flush upload will trigger this upload
   */
  this.FlushUserUpload = function(gmServer, callback) {
    try {
      if(bgF.HasDsisServer(gmServer) === false) {
        upL.log('FlushUserUpload:No DSIS Server');
        econs.CallBack(callback, 'NOSESSION');
        return;
      }
      upL.DoUserUpload(gmServer, function(resp) {
        upL.log('FlushUserUpload finished:' + JSON.stringify(resp).substring(0, 50));
        if (typeof callback == 'function') callback(resp);
      });
    } catch (e) {
      lg.debug(e, 'Error in Uploader.FlushUserUpload:', {
        stack: true
      });
    }
  }

}
