/*
 * global constants - ext wide
 */

var eConstants = function(isContent = false) {
  var _isContent = isContent;
  var _gmServerList = [];
  var _gmServersJson = [];


    // public
  this.InContent = _isContent;
  this.version = '0.1 beta';
  this.AngelVersion = '0.400.1';

  this.GetVarName = function(v) {
    const varToString = varObj => Object.keys(varObj)[0]
    return varToString({ v })
  }

  this.IsEven = function(n) {
    return n % 2 == 0;
  }

  this.IsOdd = function(n) {
    return Math.abs(n % 2) == 1;
  }

  this.DisplayStatus = function(msg) {
      var m = new Message('sidebar', 'DisplayStatus', {
        displayText: msg,
        from: 'background'
      });
      chrome.runtime.sendMessage(m);
   }

   this.CallBack = function(callback, obj) {
      if (typeof callback == 'function') {
        callback(obj);
      }
    }

   this.GetGmServersJson = function() {
      return _gmServersJson;
    }

   this.SetGmServersJson = function(json) {
      _gmServersJson = json;
      var d = {
        "GmServerJson": json
      }
    }

   this.GetGmServer = function(serverName) {
      try {
        var gs = _gmServerList[serverName];
        if (typeof gs == 'undefined') {
          var g = new GmServer();
          var serverJson = econs.GetServerJsonByName(serverName);
          g.serverName = serverJson.serverName;
          g.serv = serverJson.serv;
          g.servid = serverJson.servid;
          g.galaxies = serverJson.galaxies;
          _gmServerList[serverName] = g;
          lg.log('econs.GetGmServer:added:' + g.serverName + ' to list, servid:' + +_gmServerList[serverName].servid);
        }
        return _gmServerList[serverName];
      } catch (e) {
        lg.debug(e, 'Error in econs.GetGmServer:', {
          stack: true
        });
      }
    }

    this.GetGmServerNameFromUrl = function(url) {
      var u = new URL(url);
      var m = u.host.match(/^(.+)\..+\./);
      if (m != null) return m[1];
      return null;
    }

    this.GetServerJsonByName = function(serverName) {
      for (var i = 0; i < _gmServersJson.length; i++) {
        var s = _gmServersJson[i];
        if (serverName == s.serverName) {
          return s;
        }
      }
      return null;
    }

}
