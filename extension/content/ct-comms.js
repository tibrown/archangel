/*
 * Manages port based comms with the background
 */
var ctComms = function () {
  var lastCallback = null;

  this.StorageReceived = false;
  this.port = null;

  this.log = function (msg) {
    lg.log('ctComms:' + msg);
  }

  this.UpdatePreferenceValues = function (data) {
    if (!data) return prefs;
    prefs.Scouting.MaxScouts = data.Scouting.MaxScouts;
    prefs.Scouting.MaxPerRegion = data.Scouting.MaxPerRegion;
    prefs.ConnectionDelay = data.ConnectionDelay;
    if (data.Scouting.PickupStrays) prefs.Scouting.PickupStrays = data.Scouting.PickupStrays;
    if (data.Scouting.HandleStrays) prefs.Scouting.HandleStrays = data.Scouting.HandleStrays;
    if (data.Colors) {
      prefs.Colors = data.Colors;
    }
    return prefs;
  }

  this.ListenForBG = function (message, sender, sendResponse) {
    try {
      comms.log('Message from BG:' + JSON.stringify(message).substring(0, 20));

      if (message.action == 'INIT') {

        ctG.TabData = message.actionArgs.tabData;
        ctG.TabData.gmServer = GmServer;
        ctG.TabData.preferences = prefs;

        ctF.SendMessage(new Message('sidebar', 'GotPreferences', {
          Preferences: prefs,
          playerId: ctG.SendingPlayerId,
          gmServerName: ServerData.GmServer.serverName,
          gmServer: ServerData.GmServer,
          activeScout: ServerData.ActiveScout,
          tabData: ctG.TabData,
          version: chrome.runtime.getManifest().version
        }));
        
        ct.PublicParsePage();
        return;

      } else if (message.action == 'ServerData') {
        bgF.log('Got NEW ServerData');
        ServerData = message.actionArgs.ServerData;
        GmServer = message.actionArgs.ServerData.GmServer;
        prefs = ServerData.Preferences;

        return;
      }

    } catch (e) {
      lg.log('Error in ListenForBG:' + e.message);
    }

  }

  this.UpdateServerData = function () {
    comms.SendMessageToBG(new Message('background', 'UpdateServerData', {
      ServerData: ServerData
    }));
  }

  this.ConnectToBG = function (sendResponse) {
    try {
      comms.port = chrome.runtime.connect();
      sendResponse('Connected');
      comms.port.onMessage.addListener(function (message, sender) {
        comms.ListenForBG(message, sender, sendResponse);
      });
    } catch (e) {
      lg.debug(e, 'Error in ConnectToBG:', {
        stack: true
      });
    }
  }

  this.SendMessageToBG = function (msg, callback = null) {
    try {
      if (ctG.TabData) {
        msg.actionArgs.from = ctG.TabData.TabKey;
        msg.actionArgs.tabData = ctG.TabData;
      }
      comms.port.postMessage(msg);
      lastCallback = callback;
    } catch (e) {
      lg.debug(e, 'Error in SendMessageToBG:', {
        stack: true
      });
    }
  }

}
