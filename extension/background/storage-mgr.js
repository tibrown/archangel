var QueryParam = function (key, servid, userId) {
  this.StorageKey = key;
  this.ServId = servid;
  this.UserId = userId;
}
/*
 * Storage Manager.
 * This module will maintain any persistent dataType
 */
var Store = function () {
  var StorageHost = 'http://' + BRIDGE_HOST;
  var GetUrl = StorageHost + '/dsisscripts/load/getstorage';
  var SaveUrl = StorageHost + '/dsisscripts/load/savestorage';
  var DeleteUrl = StorageHost + '/dsisscripts/load/deletestorage';
  var storageTypes = {
    preferences: 0,
    random: 1,
    scouting: 2
  }

  this.StoreCount = 0;

  // save an array of packets
  this.SavePackets = function (packets, callback) {
    try {
      // upload via dsisio
      dsisioF.DoAjax(SaveUrl, econs.SendingPlayerId, {
        Packets: packets
      }, function (resp) {
        // check status..
        econs.CallBack(callback, resp.status);
        return;
      });
    } catch (e) {
      lg.log('store.SavePackets ERROR:' + e.message);
    }
  }

  this.DeletePacket = function (key, servId, callback) {
    try {
      var qp = new QueryParam(key, servId, econs.SendingPlayerId);
      dsisioF.DoAjax(DeleteUrl, econs.SendingPlayerId, qp, function (resp) {
        // check status..
        econs.CallBack(callback, resp.status);
        return;
      });
    } catch (e) {
      lg.log('store.DeletePacket ERROR:' + e.message);
    }
  }

  this.GetAllStorage = function (servId, callback) {
    try {
      var qp = [];
      qp.push(new QueryParam('ActiveScout', servId, econs.SendingPlayerId));
      qp.push(new QueryParam('Preferences', servId, econs.SendingPlayerId));

      store.GetPacket({
        QueryData: qp
      }, callback);
    } catch (e) {
      lg.log('store.GetAllStorage ERROR:' + e.message);
    }

  }

  // get an array of packets
  this.GetPacket = function (queryParams, callback) {
    var d = encodeURI(JSON.stringify(queryParams));
    var url = GetUrl;// + '?keys=' + d;
    dsisioF.DoAjax(GetUrl, econs.SendingPlayerId, queryParams, function (resp) {
      // check status..
      econs.CallBack(callback, resp);
      return;
    });
  }
}
