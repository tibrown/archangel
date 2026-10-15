/*
 * This is the root of the background scripts (MV3 service worker).
 *
 * In MV2 the load order was declared in manifest.json `background.scripts`.
 * MV3 replaces that array with a single service_worker, so we reproduce the
 * exact same order here with importScripts() (classic worker, NOT module).
 * jQuery is intentionally omitted — a service worker has no DOM or XHR, so
 * dsis-io.js / dsisRequests.js use fetch() instead.
 */
importScripts(
  '../common/bridge-config.js',
  '../js/moment.js',
  '../common/classes.js',
  '../common/preferences.js',
  '../common/ActiveScout.js',
  '../common/ServerDataUtil.js',
  '../common/Timer.js',
  '../common/ext-constants.js',
  '../common/logging.js',
  '../common/Storage.js',
  '../common/ServerData.js',
  'storage-mgr.js',
  'bg-comms.js',
  'dsis-io.js',
  '../common/dsisRequests.js',
  'uploader.js',
  'menu.js',
  'BgFuncs.js'
);
// This set of initializations mitigates the JS rule of precedence, ie in order to 'see"
// a function in a file, it must be loaded first
// By declaring refs to them at beginning of execution, all are  equally visible to all files
var lg = new Logger(chrome.runtime.getManifest().version);
var comms = new bgComms();
var econs = new eConstants();
var sdu = new ServerDataUtil();
var dsisioF = new dsisIoFuncs();
var dsisReq = new DsisRequests();
var upL = new upload();
var store = new Store();
var bgF = new BgFuncs();

var PopupWindowInfo = null;

bgF.init();


// stArt the port listener
chrome.runtime.onConnect.addListener(comms.PortConnectionListener);

function onPopupCreated(windowInfo) {
  try {
    bgF.log(`Created window: ${windowInfo.id}`);
    PopupWindowInfo = windowInfo;
    chrome.windows.onRemoved.addListener(function(windowId) {
      if (PopupWindowInfo.id == windowId) {
        PopupWindowInfo = null;
        bgF.log('Popup Closed');
      }
    });
  } catch (e) {
    lg.debug(e, 'Error in onPopupCreated:', {
      stack: true
    });
  }
}

function onPopupError(error) {
  bgF.log(`Error in OnPopup: ${error}`);
}

chrome.action.onClicked.addListener((tab) => {
  if (PopupWindowInfo != null) {
    bgF.log('Popup Already Open');
    return;
  }

  var popupURL = chrome.runtime.getURL("sidebar/panel.html");

  var creating = chrome.windows.create({
    url: popupURL,
    type: "popup",
    height: 400,
    width: 400
  });
  creating.then(onPopupCreated, onPopupError);

});

bgF.log('Version: ' + econs.version);
// listeners for tab activated and removed (closed)
chrome.tabs.onActivated.addListener(bgF.HandleActivated);
chrome.tabs.onRemoved.addListener(comms.TabRemovedListener);

// broadcast message listener
// messageJson is the Message class used by the ext as a whole to send messages, in a json format
chrome.runtime.onMessage.addListener(function(messageJson, sender, sendResponse) {
  try {
    if (messageJson.target == 'background') {
      var action = messageJson.action;

      if(action == 'ReloadDsis') {
        bgF.CheckDsisSession(messageJson.actionArgs.DsisServer, function(resp) {
          bgF.log('DSIS RELOAD Session Status:' + resp.status + ',' + resp.error);
        });
        return;
      }

      // LOCAL PORT: HTTP relay for content scripts (mixed-content bypass).
      // Body is already form-encoded by the caller.
      if(action == 'BridgeFetch') {
        fetch(messageJson.actionArgs.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: messageJson.actionArgs.body || ''
        }).then(function (resp) {
          return resp.json();
        }).then(function (data) {
          sendResponse({ status: 'OK', data: data });
        }).catch(function (err) {
          lg.debug('BridgeFetch error', 'error', { details: { url: messageJson.actionArgs.url, error: String(err) } });
          sendResponse({ status: 'error', errorText: String(err) });
        });
        return true; // MV3: keep channel open for async sendResponse
      }

      // LOCAL PORT / MV3: UI panels (sidebar, options, context menus) can no
      // longer call getBackgroundPage(). They reach bgF through this bridge.
      if(action == 'UIBridge') {
        var op = (messageJson.actionArgs && messageJson.actionArgs.op) || '';
        if(op == 'GetMenuOpener') {
          sendResponse({ MenuOpener: bgF.MenuOpener, SendingPlayerId: econs.SendingPlayerId });
          return;
        }
        if(op == 'GetGmServer') {
          sendResponse({ GmServer: bgF.GetGmServer(messageJson.actionArgs.serverName) });
          return;
        }
        if(op == 'GetPreferences') {
          bgF.GetPreferences(messageJson.actionArgs.target);
          return;
        }
        if(op == 'UpdatePreferences') {
          bgF.UpdatePreferences(messageJson.actionArgs.preferences, messageJson.actionArgs.target);
          return;
        }
        if(op == 'ClearLogs') {
          bgF.ClearLogs();
          return;
        }
        if(op == 'GetAllLogs') {
          sendResponse({ Logs: bgF.GetAllLogs() });
          return;
        }
        if(op == 'GetStatusLogs') {
          bgF.GetStatusLogs();
          return;
        }
        if(op == 'Log') {
          bgF.log(messageJson.actionArgs.msg);
          return;
        }
      }

      if(action == 'HandShake') {
        var gs = bgF.GetGmServer(messageJson.actionArgs.ServerName);

        gs.playerId = messageJson.actionArgs.SendingPlayerId;
        econs.SendingPlayerId = messageJson.actionArgs.SendingPlayerId;
        // LOCAL PORT: attach the bridge to the specific player id for this tab
        bgF.EnsureLocalDsis(gs, messageJson.actionArgs.SendingPlayerId);
        bgF.UpdateServerDataFromDb(gs, function(resp) {
          var m = new Message('content', 'HandShake', {
            Status: resp.Status,
            ServerData: resp.ServerData,
            Player: resp.Player
          });
          chrome.tabs.sendMessage(sender.tab.id, m);
        });
        return;
      }

      if(action == 'DeleteActiveScout') {
        sdu.SetItem(ActiveScout.StorageKey, messageJson.actionArgs.GmServer.serverName, 'DELETE');
        store.DeletePacket(ActiveScout.StorageKey, messageJson.actionArgs.GmServer.servid, function(status) {
          sendResponse('ActiveScout deleted:' + status);
        });
        return true; // MV3: keep channel open for async sendResponse
      }

      if(action == 'SaveCentralStorage') {
        store.SavePackets(messageJson.actionArgs.Packets, sendResponse);
        return true; // MV3: keep channel open for async sendResponse
      }

      if(action == 'SaveErrorPacket') {
        bgF.SaveErrorPacket(messageJson.actionArgs);
        return;
      }

      if(action == 'SyncFromDb') {
        bgF.UpdateServerDataFromDb(messageJson.actionArgs.GmServer, function(sdata) {
          if (sdata == 'ERROR') {
            bgF.log('Error Getting ServerData');
            return 'ERROR';

          } else bgF.log('Got ServerData');
          // update prefs last synced
          //sdata.Preferences.LastSynced = Date.now();
          return sdata;

        });
      }

      if(action == 'EFData' || action == 'EFDataChunk' || action == 'CTXFleetMoved') {
        // foreward it on to EmpireFleetObj via broadcast (MV3: no page refs)
        chrome.runtime.sendMessage(new Message('EmpireFleet', messageJson.action, messageJson.actionArgs));
        return;
      }

      if(action == 'SSFleet') {
        chrome.runtime.sendMessage(new Message('SuperScanners', messageJson.action, messageJson.actionArgs));
        return;
      }

      if (action == 'GuildMembers') {
        chrome.runtime.sendMessage(new Message('MailRoom', messageJson.action, messageJson.actionArgs));
        return;
      }

      if (action == 'MailSent') {
        chrome.runtime.sendMessage(new Message('MailRoom', messageJson.action, messageJson.actionArgs));
        return;
      }

      if (action == 'MailSentToGuild') {
        chrome.runtime.sendMessage(new Message('MailRoom', messageJson.action, messageJson.actionArgs));
        return;
      }

      if (action == 'NotifyActiveTab') {
        // tabKey is set in tab activated...so we know current tab that has focus
        var tmd = bgF.ActiveTabMetadata;
        var key = tmd.WindowId + '-' + tmd.TabId;
        var port = comms.GetTabDataByKey(key);

        messageJson.target = 'content';
        messageJson.actionArgs.gmServer = port.gmServer;
        // sending this message to only one tab, the one that contacted us, just an ACK
        chrome.tabs.sendMessage(tmd.TabId, messageJson);
        return;
      }

      // this is sent by dsis-content when a dsis site is opened in a tab
      // this begins the dsis linkage to its gm server and thus "activates" the link
      // uploads can proceed
      if (action == 'DSISSiteFound') {
        // need to update via sdu
        var gs = bgF.GetGmServer(messageJson.actionArgs.dsisServer.gmServerName);
        var gu = new GmServerUtil(gs);
        gu.AddDsisServer(messageJson.actionArgs.dsisServer);
        sdu.SetItem(sdu.GmServer, gs.serverName, gs);
        // updaate sdu
        bgF.log('Message from dsis-content: DSISSiteFound');

        var message = {
          target: 'dsisContent',
          action: 'ArchangelInstalled',
          actionArgs: {
            angelVersion: econs.AngelVersion,
            gmServer: gs
          }
        }
        // notify sidebar that the linkage took place so it can declare it to the user
        chrome.tabs.sendMessage(sender.tab.id, message);
        // notify sidebar
        message.target = 'sidebar';
        message.action = 'DSISActive';
        message.actionArgs = {
          displayText: 'DSIS Site Open',
          gmServer: gs,
          from: sender.tab.id
        }
        chrome.runtime.sendMessage(message);
        // get port and get storageData

        message.target = 'content';
        var sd = bgF.GetServerData(gs);
        sd.GmServer = gs;
        message.actionArgs.ServerData = sd;

        var tabData = comms.GetTabDataByGmServerName(gs.serverName);
        chrome.tabs.sendMessage(tabData.tabId, message).then(function(resp) {
          bgF.log('Reloading tab:' + tabData.tabId);
          chrome.tabs.reload(tabData.tabId);
        });

        return;
      }
    }
  } catch (e) {
    lg.debug(e, 'Error in BG.OnMessage:', {
      stack: true
    });
  }
});
