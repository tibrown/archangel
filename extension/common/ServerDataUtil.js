// Handles all manipulation of server data
var ServerDataUtil = function () {
  this.Preferences = 'Preferences';
  this.ActiveScout = 'ActiveScout';
  this.GmServer = 'GmServer';
  this.DsisState = 'DsisState';

  // active scouts for each gmserver
  this.ActiveScoutList = new ItemList(this.ActiveScout);
  // preferences for each gmserver
  this.PreferencesList = new ItemList(this.Preferences);
  // gmserver data for each
  this.GmServerList = new ItemList(this.GmServer);
  // state of each dsis server, has session, or not
  this.DsisStateList = new ItemList(this.DsisState);
  // global gm server list
  this.GmServerJson = null;

  this.ResetDsisState = function() {
    return;
  }

  this.SaveListToLocal = function(key) {
    switch(key) {
      case this.ActiveScout:
        var ActiveScoutList = this.ActiveScoutList;
        chrome.storage.local.set({ActiveScoutList});
        break;
      case this.Preferences:
        var PreferencesList = this.PreferencesList;
        chrome.storage.local.set({PreferencesList});
        break;
      case this.GmServer:
        var GmServerList = this.GmServerList;
        chrome.storage.local.set({GmServerList});
        break;
      case this.DsisState:
        var DsisStateList = this.DsisStateList;
        chrome.storage.local.set({DsisStateList});
        break;
    }
  }

  this.InitAllLists = function(callback) {
    //chrome.storage.local.clear();
    chrome.storage.local.get().then(function (obj) {
      var keys = Object.keys(obj);
      var m = 'Got Storage';
      if (keys.length == 0) {
        m = 'Got EMPTY DataLists';
        // need to offer to retrieve from dsis at some point
        this.log('No Storage');
        var p = new Preferences();
        sdu.SetItem(sdu.Preferences, 'central', p);
        econs.CallBack(callback, 'NOLISTS');
        return;
      }
      sdu.log(m);
      for (var key of keys) {
        var lst = obj[key];
        sdu.SetList(lst, key);
        //sdu.SaveListToLocal(key);
        sdu.log('Setup List:' + key);
      }
      econs.CallBack(callback, 'INITIALIZED');
    });
  }

  this.GetList = function(key) {
    switch(key) {
      case this.ActiveScout:
        return this.ActiveScoutList;
      case this.Preferences:
        return this.PreferencesList;
      case this.GmServer:
        return this.GmServerList;
      case this.DsisState:
        return this.DsisStateList;
        break;
    }
  }

  this.GetItem = function(key, serverName) {
    var l = this.GetList(key);
    return l.Items[serverName];
  }

  this.SetItem = function(key, serverName, data) {
    if(!data) {
      sdu.log('No data to save for:' + key + ',' + serverName);
      return;
    }
    if(data == 'DELETE') data = null;
    this.GetList(key).Items[serverName] = data;
    this.SaveListToLocal(key);
  }

  this.SetList = function(items, key) {
    var ilist = new ItemList(key, items);
    switch(key) {
      case this.ActiveScout:
        this.ActiveScoutList = ilist;
        break;
      case this.Preferences:
        this.PreferencesList = ilist;
        break;
      case this.GmServer:
        this.GmServerList = ilist;
        break;
      case this.DsisState:
        this.DsisStateList = ilist;
        break;
    }
  }

  this.log = function(msg) {
    lg.log('SDU:' + msg);
  }
}

var ItemList = function(key, items) {
  this.LastUpdated = Date.now();
  this.Key = key;
  this.Items = [];
}

// one game server
var GmServer = function () {
  this.servid = -1;
  this.serv = '0';
  this.galaxies = 0;
  this.serverName = '';
  this.baseUrl = '.astroempires.com';
  this.playerId = -1;
  this.guildId = -1;
  this.DsisServers = [];
  this.hasSession = false;
}
/*
 * this class is a hack to handle how dsis and current angel work today
 * it will go away when new methods are added to dsis to return proper gmServer data
 */
var GmServerJson = function (server, servid, galaxyData) {
  this.serverName = server;
  this.servid = servid;
  this.galaxyData = galaxyData;
}
// utility class for functions that act upon GmServer
var GmServerUtil = function (gmServer) {
  var _gmServer = gmServer;
  this.AddDsisServer = function (dsisServer) {
    if (this.DsisServerOnList(dsisServer) === true) {
      lg.log('GmServerUtil.AddDsisServer:DsisServer:' + dsisServer.dbName + ' is on list already');
      return;
    }
    lg.log('GmServerUtil.AddDsisServer: Adding DsisServer');
    _gmServer.DsisServers.push(dsisServer);
  }
  this.DsisServerOnList = function (dsisServer) {
    for (var i = 0; i < _gmServer.DsisServers.length; i++) {
      if (_gmServer.DsisServers[i].dbName == dsisServer.dbName) return true;
    }
    return false;
  }
}

// state = 1 logged in, 0 not
var DsisState = function(state, dsisServer) {
  this.State = state;
  this.DsisServer = dsisServer;
}
// one dsis server
var dsisServer = function () {
  this.playerId = -1;
  this.uid = -1;
  this.dbName = '';
  this.dsisHost = '';
  this.dsisVersion = '';
  this.disabled = false;
  this.hasSession = false;
  this.gmServerName = '';
}
