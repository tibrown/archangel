// background functions


// startup type functions
var BgFuncs = function () {
  this.TabMetadataList = [];
  this.DsisTabMetadataList = [];
  this.ActiveTabMetadata = null;
  this.StatusLogObj = null;
  this.SidebarObj = null;
  this.OptionsObj = null;
  this.EmpireFleetObj = null;
  this.MenuOpener = null; // current tab
  this.DateReloaded = Date.now();


  this.log = function (msg) {
    lg.log('BG:' + msg);
  }

  this.init = function () {
    try {
      bgF.log('Reloaded:' + moment(this.DateReloaded).format('YYYY-MM-DD hh:mm:ss'));
      sdu.InitAllLists(function (status) {
        if (status == 'INITIALIZED') {
          bgF.log('Storage Lists Initialized');
          sdu.ResetDsisState();
        } else {
          // no data in storage
          bgF.log('Nothing in storage');
        }
      });
      bgF.log('In INIT');
      // LOCAL PORT: seed the server list synchronously (kills cold-start race)
      bgF.SeedLocalServers();
      // get server json
      bgF.GetServerJson();
      
    } catch (e) {
      lg.debug(e, 'Error in bgf.init:', {
        stack: true
      });
    }
  }

  this.GetServerJson = function () {
    try {
      var url = 'http://' + BRIDGE_HOST + '/dsisscripts/load/getservers';
      dsisioF.DoAjax(url, 0, '', function (resp) {
        bgF.log('Got server JSON');
        bgF.MakeGmServerJsonObjs(resp.data);
      });
    } catch (e) {
      lg.debug(e, 'Error in bgf.GetServerJson:', {
        stack: true
      });
    }
  }

  this.ReloadDsis = function (dsisServer) {

  }

  this.GetStatusLogs = function () {
    try {
      if (this.MenuOpener == null) return;
      var tabData = comms.GetTabDataById(this.MenuOpener.id);
      if (tabData != null) {
        chrome.runtime.sendMessage(new Message('StatusLog', 'LogData', {
          LogData: tabData.logEntries
        }));
      }
    } catch (e) {
      lg.debug(e, 'Error in bgf.GetStatusLogs:', {
        stack: true
      });
    }
  }

  this.GetPreferences = function (target) {
    try {
      var tab = bgF.GetTabFromTarget(target);
      if (tab == null) {
        bgF.log('bgF.GetPreferences:Not able to find current tab for:' + target);
        return;
      }

      var msg = new Message('content', 'SendPreferences', {
        target: target
      });
      chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) {
      lg.debug(e, 'Error in bgf.GetPreferences:', {
        stack: true
      });
    }
  }

  this.GetTabFromTarget = function (target) {
    try {
      switch (target) {
        case 'MiscOptions':
          return (bgF.MiscOptionsObj) ? bgF.MiscOptionsObj.CurrentTab : bgF.MenuOpener;
        case 'ScoutOptions':
          return (bgF.ScoutOptionsObj) ? bgF.ScoutOptionsObj.CurrentTab : bgF.MenuOpener;

      }
      return bgF.MenuOpener;
    } catch (e) {
      lg.debug(e, 'Error in bgf.GetTabFromTarget:', {
        stack: true
      });
    }
  }

  this.UpdatePreferenceValues = function (data) {
    try {
      var prefs = new Preferences();
      prefs.Scouting.MaxScouts = data.Scouting.MaxScouts;
      prefs.Scouting.MaxPerRegion = data.Scouting.MaxPerRegion;
      prefs.ConnectionDelay = data.ConnectionDelay;
      prefs.Scouting.PickupStrays = data.Scouting.PickupStrays;
      prefs.Scouting.HandleStrays = data.Scouting.HandleStrays;
      prefs.Colors = data.Colors;
      return prefs;
    } catch (e) {
      lg.debug(e, 'Error in bgf.UpdatePreeferencesValues:', {
        stack: true
      });
    }
  }

  this.UpdateLocalFromServerDataList = function (serverData) {
    try {
      sdu.SetItem(sdu.ActiveScout, serverData.GmServer.serverName, serverData.ActiveScout);
      sdu.SetItem(sdu.Preferences, serverData.GmServer.serverName, serverData.Preferences);
      sdu.SetItem(sdu.GmServer, serverData.GmServer.serverName, serverData.GmServer);
    } catch (e) {
      lg.debug(e, 'Error in bgf.UpdateLocalFromServerDataList:', {
        stack: true
      });
    }
  }

  this.SyncServerData = function (gmServer, mode) {
    try {
      var gs = gmServer;
      var prefs = sdu.GetItem('Preferences', gmServer.serverName);
      var ascout = sdu.GetItem('ActiveScout', gmServer.serverName);
      var packets = [];
      packets.push(new StoragePacket(prefs, prefs.StorageKey, gs.servid, gs.playerId, 0));

      if (ascout) packets.push(new StoragePacket(ascout, ascout.StorageKey, gs.servid, gs.playerId, 2));

      if (mode == 'SyncToDb') {

        store.SavePackets(gmServer.playerId, packets, function (status) {
          bgF.log('SyncServerData:save status:' + status);
        });
        return;
      } else {
        // from
        bgF.UpdateServerDataFromDb(gs, function (sdata) {
          if (sdata == 'ERROR') {
            bgF.log('Error Getting ServerData');
            return
          } else bgF.log('Got ServerData');
          // update prefs last synced
          sdata.Preferences.LastSynced = Date.now();
          // need to notify content
          var td = comms.GetTabDataByGmServerName(gs.serverName);
          bgF.log('Sending New Server Data to Content');
          chrome.tabs.sendMessage(td.tabId, new Message('content', 'ServerData', {
            ServerData: sdata
          }));
          return;
        }, true);
      }
    } catch (e) {
      lg.debug(e, 'Error in bgf.SyncServerData:', {
        stack: true
      });
    }
  }

  this.HasDsisServer = function (gmServer) {
    if (gmServer && gmServer.DsisServers.length > 0) return true;
    bgF.log(':HasDsisServer:No DSIS Server Active');
    return false;
  }

  // LOCAL PORT: synthesize the DSIS-server config that used to come from the
  // (now-dead) angeldsis.com login page. Every GmServer needs a dsisServer on
  // its DsisServers list or HasDsisServer() blocks all uploads.
  this.EnsureLocalDsis = function (gs, playerId) {
    try {
      if (!gs) return gs;
      if (!gs.DsisServers) gs.DsisServers = [];
      var local = null;
      for (var i = 0; i < gs.DsisServers.length; i++) {
        if (gs.DsisServers[i].dbName == 'archangel') { local = gs.DsisServers[i]; break; }
      }
      if (!local) {
        local = new dsisServer();
        local.dbName = 'archangel';
        local.dsisHost = BRIDGE_HOST;
        local.gmServerName = gs.serverName;
        local.hasSession = true;
        local.disabled = false;
        gs.DsisServers.push(local);
        bgF.log('EnsureLocalDsis: injected local bridge for ' + gs.serverName);
      }
      if (playerId) local.playerId = playerId;
      else if (gs.playerId && gs.playerId != -1) local.playerId = gs.playerId;
      return gs;
    } catch (e) {
      lg.debug(e, 'Error in EnsureLocalDsis:', { stack: true });
      return gs;
    }
  }

  // Synchronously seed the server list so HandShake never races the async
  // getservers fetch when the service worker cold-starts.
  this.SeedLocalServers = function () {
    try {
      econs.SetGmServersJson([new GmServerJson('helion', 1, null)]);
      bgF.log('SeedLocalServers: seeded helion (servid 1)');
    } catch (e) {
      lg.debug(e, 'Error in SeedLocalServers:', { stack: true });
    }
  }

  this.UpdateServerDataFromDb = function (gmServer, callback) {
    try {

      var sd = bgF.GetServerData(gmServer);
      store.GetAllStorage(gmServer.servid, function (data) {
        try {
          var resp = {
            Status: data.status,
            ServerData: sd
          }
          if (data.status != 'OK') {
            // error getting storage
            econs.CallBack(callback, resp);
            return;
          }
          var p = data.data.Packets;
          var player = data.data.Player;
          // convert staoragePacket to ServerData
          for (i = 0; i < p.length; i++) {
            var d = p[i];

            var json = JSON.parse(d.Data);
            var key = d.Key;
            switch (key) {
              case sdu.ActiveScout:
                // verify is good ActiveScout
                if (json.SourceFleets.length == 0 || json.ScoutRegions.length == 0) {
                  // bad scout
                  bgF.log('Got bad ActiveScout data, deleting');
                  sdu.SetItem(ActiveScout.StorageKey, sd.GmServer.serverName, 'DELETE');
                  store.DeletePacket(ActiveScout.StorageKey, sd.GmServer.servid, function (status) {
                    bgF.log('Deleted:' + status);
                    return;
                  });
                  break;
                }
                sd.ActiveScout = json;
                comms.log('Got active scout data');
                chrome.runtime.sendMessage(new Message('sidebar', 'DisplayStatus', {
                  displayText: 'Got Active Scout:' + json.Galaxy,
                  from: 'BgFuncs'
                }));

                break;
              case sdu.Preferences:
                sd.Preferences = bgF.UpdatePreferenceValues(json);
                break;
            }
          }
          resp.ServerData = sd;
          resp.Player = player;

          // update local list
          bgF.UpdateLocalFromServerDataList(sd);

          econs.CallBack(callback, resp);

        } catch (e) {
          lg.debug(e, 'Error in bgf.UpdateServerDataFromDb:store.Get:', {
            stack: true
          });
        }
      }, gmServer);
    } catch (e) {
      lg.debug(e, 'Error in UpdateServerDataFromDb:', {
        stack: true
      });
    }
  }

  this.GetGmServer = function (sn) {
    var gs = sdu.GetItem(sdu.GmServer, sn);

    if (!gs) gs = econs.GetGmServer(sn);

    // LOCAL PORT: attach the local bridge so uploads are never gated.
    return bgF.EnsureLocalDsis(gs);
  }

  this.SaveErrorPacket = function (args) {
    try {
      var url = 'http://' + BRIDGE_HOST + '/dsisscripts/load/angellog';
      // upload via dsisio
      dsisioF.DoAjax(url, econs.SendingPlayerId, args.ErrorPacket, function (resp) {
        return;
      });
    } catch (e) {
      lg.log('store.SavePackets ERROR:' + e.message);
    }
  }

  this.CheckDsisSession = function (dsis, callback) {
    // LOCAL PORT: the DSIS site is gone; the local bridge is always "active".
    econs.CallBack(callback, {
      status: 'OK',
      error: 'Local bridge active'
    });
  }

  this.GetGmServerNameFromUrl = function (url) {
    return econs.GetGmServerNameFromUrl(url);
  }

  this.GetServerData = function (gmServer) {
    try {
      var sn = gmServer.serverName;
      var gs = sdu.GetItem(sdu.GmServer, sn);
      if (!gs) {
        gs = gmServer;
        sdu.SetItem(sdu.GmServer, gs.serverName, gs);
      }
      var p = sdu.GetItem(sdu.Preferences, sn);
      if (!p) {
        p = new Preferences();
        sdu.SetItem(sdu.Preferences, gs.serverName, p);
      }

      var sd = new ServerData(gs,
        p,
        sdu.GetItem(sdu.ActiveScout, sn));
      sd.GmServersJson = econs.GetGmServersJson();

      if (!sd.Preferences) sd.Preferences = new Preferences();

      return sd;
    } catch (e) {
      lg.debug(e, 'Error in GetServerData:', {
        stack: true
      });
    }
  }

  // called from options to let content know prefs have changed
  this.UpdatePreferences = function (preferences, target) {
    try {
      var tab = bgF.GetTabFromTarget(target);
      if (tab == null) {
        bgF.log('bgF.UpdatePreferences:Not able to find current tab for:' + target);
        return;
      }

      var msg = new Message('content', 'UpdatePreferences', {
        Preferences: preferences,
        Target: target,
        from: target
      });
      chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) {
      lg.debug(e, 'Error in bgf.UpdatePreferences:', {
        stack: true
      });
    }
  }

  this.ClearLogs = function () {
    try {
      var tab = bgF.GetTabFromTarget(target);
      if (tab == null) {
        bgF.log('bgF.CclearLogs:Not able to find current tab for:' + target);
        return;
      }
      var tabData = comms.GetTabDataById(tab.id);
      if (tabData != null) {
        tabData.logEntries = [];
        bgF.log('Logs cleared for:' + tabData.id);
      }
    } catch (e) {
      lg.debug(e, 'Error in bgf.ClearLogs:', {
        stack: true
      });
    }
  }

  this.GetAllLogs = function () {
    try {
      var tab = bgF.GetTabFromTarget(target);
      if (tab == null) {
        bgF.log('bgF.GetAllLogs:Not able to find current tab for:' + target);
        return null;
      }
      var tabData = comms.GetTabDataById(tab.id);
      return tabData.logEntries;
    } catch (e) {
      lg.debug(e, 'Error in bgf.GetAllLogs:', {
        stack: true
      });
    }
  }

  // active one is passed, update list
  this.UpdateTabMetadata = function (tmd) {
    try {
      for (var i = 0; i < this.TabMetadataList.length; i++) {
        var t = this.TabMetadataList[i];
        if (tmd.WindowId == t.WindowId && tmd.TabId == t.TabId) {
          this.TabMetadataList[i] = tmd;
          return;
        }
      }
      this.TabMetadataList.push(tmd);
      return;
    } catch (e) {
      lg.debug(e, 'Error in bgf.UpdateTabMetadata:', {
        stack: true
      });
    }
  }

  this.MakeGmServerJsonObjs = function (rawJson) {
    try {
      var j = [];
      for (var i = 0; i < rawJson.length; i++) {
        var r = rawJson[i];
        var g = new GmServerJson(r.server, r.servid, r.galaxyData);
        j.push(g);
      }
      econs.SetGmServersJson(j);
    } catch (e) {
      lg.debug(e, 'Error in bgf.MakeGmServerJsonObjs:', {
        stack: true
      });
    }
  }

  this.HandleActivated = function (activeInfo) {
    try {
      var tmd = new TabMetadata(activeInfo.tabId, activeInfo.windowId);

      tmd.GetUrl(function (url) {
        tmd.Url = url;
        bgF.log('Activated:[' +
          tmd.WindowId +
          ',' +
          tmd.TabId +
          ']' +
          tmd.Url);
        _activeTabId = activeInfo.windowId + '-' + activeInfo.tabId;
        if (tmd.IsGmServer === true) {
          // send update request to GM content
          var msg = new Message('content', 'SendUpdate', {
            update: ''
          });
          chrome.tabs.sendMessage(activeInfo.tabId, msg);

          // update content with some metedata
          var sn = econs.GetGmServerNameFromUrl(tmd.Url.href);
          if (sn != null) {
            tmd.GmServer = bgF.GetGmServer(sn);
            tmd.GmServerJson = econs.GetServerJsonByName(sn);
            var message = new Message('content', 'GmServerUpdate', {
              gmServer: tmd.GmServer,
              gmServerName: sn
            });
            chrome.tabs.sendMessage(activeInfo.tabId, message);

            bgF.ActiveTabMetadata = tmd;
            bgF.UpdateTabMetadata(tmd);
          }
        } else if (tmd.IsDsis === true) {
          bgF.DsisTabMetadataList[tmd.Url.href] = tmd;
          return;
        } else if (tmd.IsOptions === true) {
          return;
        } else if (tmd.IsPopup === true) {
          return;
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in handleActivated:', {
        stack: true
      });
    }
  }

}
