/*
 * This namespace has all of the port based comms functions.
 * each gm content page will have a dedicated port to send/receive messages
 */

var bgComms = function() {

  this.tabDataList = [];
  this.MaxLogEntries = 100;
  this.LastTabId = -1;

  this.log = function(msg) {
    lg.log('bgComms:' + msg);
  }
  // return port from Key
  this.GetTabDataById = function(id) {
    for (var p = 0; p < comms.tabDataList.length; p++) {
      tabData = comms.tabDataList[p];
      if (tabData.tabId == id) {
        return tabData;
        break;
      }
    }
    return null;
  }
  // return port from Key
  this.GetTabDataByKey = function(key) {
    for (var p = 0; p < comms.tabDataList.length; p++) {
      tabData = comms.tabDataList[p];
      if (tabData.id == key) {
        return tabData;
        break;
      }
    }
    return null;
  }

  this.GetTabDataByGmServerName = function(gmServerName) {
    var td = null;
    for (var i = 0; i < comms.tabDataList.length; i++) {
      var tabData = comms.tabDataList[i];
      if (tabData.gmServer.serverName == gmServerName) td = tabData;
    }
    return td;
  }

  // listen for closed tabs so can cleanup ports array
  this.TabRemovedListener = function(tabId, removeInfo) {
    comms.RemovePortFromList(removeInfo.windowId + '-' + tabId);
  }

  this.RemovePortFromList = function(key) {
    for (var p = 0; p < comms.tabDataList.length; p++) {
      tabData = comms.tabDataList[p];
      if (tabData.id == key) {
        tabData = null;
        comms.tabDataList.splice(p, 1);
        comms.log('Tab Removed: ' + key);
        return;
      }
    }
    comms.log('Tab Not on ports list: ' + key);
  }

  this.AddPortToList = function(tdata) {
    // see if port already on list, add it if not
    for (var i = 0; i < comms.tabDataList.length; i++) {
      if (tdata.id == comms.tabDataList[i].id) return;
    }
    comms.tabDataList.push(tdata);

  }

  this.PortConnectionListener = function(port) {
    try {
      var tabData = new TabData(port);
      port.onMessage.addListener(comms.PortOnMessageListener);

      comms.log('Tab Data:' + JSON.stringify(tabData).substring(0, 50));
      // determine which ae server this port is talking to
      //if page is null, not logged in yet
      var page = port.sender.url.match(/\/(\w+)\.aspx/);
      if (page == null) return;

      var sn = bgF.GetGmServerNameFromUrl(port.sender.url);

      tabData.gmServer = bgF.GetServerData(sn).GmServer.serverName;
      comms.AddPortToList(tabData);
      // send tabData to content
      port.postMessage(new Message('content', 'INIT', {
        tabData: {
          id: tabData.id,
          tabId: tabData.tabId,
          windowId: tabData.windowId,
          gmServer: tabData.gmServer,
          preferences: tabData.preferences
        }
      }));

    } catch (e) {
      lg.debug(e, 'Error in PortConnectionListener:', {
        stack: true
      });
    }
  }

  this.PortDisconnectListener = function(port) {
    if (p.error) {
      comms.log(`Disconnected due to an error: ${p.error.message}`);
    }
    var key = port.tab.windowId + '-' + port.tab.id;
    RemovePortFromList(key);
  }

  // notify of no dsis, content can decide what to do.
  this.NotifyOfNoDsis = function(state, tabId) {
    chrome.tabs.sendMessage(tabId, new Message('content', 'NODSIS', {
      state: state
    }));
  }

  // handles data uploads and other requests from the content side
  // Uploads start here
  this.PortOnMessageListener = function(msg, sender) {
    try {
      comms.LastTabId = sender.sender.tab.id;
      var tabKey = sender.sender.tab.windowId + '-' + sender.sender.tab.id;
      comms.log('PortOnMessageListener:' + JSON.stringify(msg).substring(0, 50));
      comms.log('Port Key:' + tabKey);
      var tabData = comms.GetTabDataByKey(tabKey);

      if (msg.action == 'SyncToDb') {
        comms.log('Got sync request:' + msg.action);
        bgF.SyncServerData(msg.actionArgs.GmServer, msg.action);
        return;
      }

      // called from content.comms
      if(msg.action == 'UpdateServerData') {
        bgF.UpdateLocalFromServerDataList(msg.actionArgs.ServerData);
        //chrome.storage.local.set(data);
        comms.log('saved ServerData');
      }

      // called to update the status log
      if (msg.action == 'StatusLog') {
        // pop the top and add to bottom if over max
        if (tabData.logEntries.length == comms.MaxLogEntries) tabData.logEntries.shift();
        tabData.logEntries.push(msg.actionArgs.logEntry);
        if (msg.actionArgs.logEntry) {
          chrome.runtime.sendMessage(new Message('StatusLog', 'DisplayLog', msg.actionArgs.logEntry));
        }
        return;
      }

      // get gmserver, dsis server(s)
      if (msg.action == 'UploadData' || msg.action == 'FlushUpload') {
        var sn = econs.GetGmServerNameFromUrl(sender.sender.tab.url);
        var gs = bgF.GetGmServer(sn);
        if (gs == null) {
          // error!
          comms.log('Error in port listener, unable to find gm server');
          comms.NotifyOfNoDsis({status: 'ERROR', message: 'Error in port listener, unable to find gm server'}, sender.sender.tab.id);
          return;
        }
        if (bgF.HasDsisServer(gs) === false) {
          comms.log('No DSIS Site active');
          econs.DisplayStatus('No DSIS Site is Active');
          comms.NotifyOfNoDsis({status: 'ERROR', message: 'No DSIS Site is Active'}, sender.sender.tab.id);
          return;
        }
        if (msg.action == 'UploadData') {
          if(bgF.HasDsisServer(gs) === false) {
            comms.log('UploadData:No DSIS Server');
            return;
          }
          upL.DoUploadUserData(msg.actionArgs.data, gs);
          return;
        } else if (msg.action == 'FlushUpload') {
          comms.log('FlushUpload called');
          upL.FlushUserUpload(gs, function(resp) {
            comms.log('FlushUpload complete:' + resp.displayText);
          });
          return;
        }

      }

    } catch (e) {
      lg.debug(e, 'Error in PortOnMessageListener:', {
        stack: true
      });
    }
  }

}
