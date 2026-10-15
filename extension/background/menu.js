
// base menu class
var DsisMenu = function (_globalName) {
  var gn = _globalName;

  this.log = function(msg) {
    lg.log('Menu:' + gn + ':' + msg);
  }

  this.onCreated = function(e) {
    if (chrome.runtime.lastError) {
      this.log(`Error: ${chrome.runtime.lastError}`);
    } else {
      this.log("Item created successfully");
    }
  }

  this.OnRemoved = function(e) {
    this.log('Removed');
  }

  this.OnError = function(error) {
    this.log('OnError' + error);
  }

  this.Create = function(properties) {
    chrome.contextMenus.create(properties, this.OnCreated);
  }

}
/*
Create all the context menu items.
*/
// pageMenu will be used for all of the context menu items
var pageMenu = new DsisMenu('PageMenu');
pageMenu.Create({
  id: "status-log",
  title: 'Status Log',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var statuslog = 0;

pageMenu.Create({
  id: "mail-room",
  title: 'Mail Room',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var mailroom = 0;

pageMenu.Create({
  id: "add-bookmark",
  title: 'Bookmark',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});

pageMenu.Create({
  id: "fleet-menu",
  title: 'Fleet',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});

pageMenu.Create({
  parentId: 'fleet-menu',
  id: "gather",
  title: 'Gather',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var gather = 0;

pageMenu.Create({
  parentId: "fleet-menu",
  id: "super-scanners",
  title: 'Super Scanners',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var superscanners = 0;

pageMenu.Create({
  id: "options-menu",
  title: 'Options',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});

pageMenu.Create({
  parentId: "options-menu",
  id: "scout-options",
  title: 'Scout Options',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var scoutoptions = 0;

pageMenu.Create({
  parentId: "options-menu",
  id: "misc-options",
  title: 'Misc Options',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var miscoptions = 0;


pageMenu.Create({
  id: "open-sidebar",
  title: 'Toggle Sidebar',
  contexts: ["page", "image", "link"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});

// tools menu, for the top tools menu items
var toolsMenu = new DsisMenu('ToolsMenu');


toolsMenu.Create({
  id: "help-menu",
  title: 'Archangel Help',
  contexts: ["all"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
toolsMenu.Create({
  id: "reload",
  title: 'Reload Archangel',
  contexts: ["all"],
  documentUrlPatterns: ["*://*.astroempires.com/*"]
});
var helpmenu = 0;


// this keeps the user from opening more than one menuitem at a time
chrome.windows.onRemoved.addListener(function(windowId) {
  if (windowId == statuslog) statuslog = 0;
  if (windowId == gather) gather = 0;
  if (windowId == superscanners) superscanners = 0;
  if (windowId == miscoptions) miscoptions = 0;
  if (windowId == scoutoptions) scoutoptions = 0;
  if (windowId == mailroom) mailroom = 0;
});

/*
The click event listener, where we perform the appropriate action given the
ID of the menu item that was clicked.
*/
chrome.contextMenus.onClicked.addListener((info, tab) => {
  bgF.MenuOpener = tab;
  switch (info.menuItemId) {
    case "add-bokmark":
            
    case "status-log":
      if (statuslog > 0) return;
      var popupURL = chrome.runtime.getURL("contextMenu/StatusLog.html");
      var creating = chrome.windows.create({
        url: popupURL,
        type: "popup",
        height: 600,
        width: 800
      });
      creating.then(function(windowInfo) {
        pageMenu.log('Created:' + windowInfo.id);
        statuslog = windowInfo.id;
      }, function(error) {
        pageMenu.log('Error Creating window:' + error);
      });
      break;
    case "mail-room":
      if (mailroom > 0) return;
      var popupURL = chrome.runtime.getURL("contextMenu/MailRoom.html");
      var creating = chrome.windows.create({
        url: popupURL,
        type: "popup",
        height: 600,
        width: 800
      });
      creating.then(function(windowInfo) {
        pageMenu.log('Created:' + windowInfo.id);
        mailroom = windowInfo.id;
      }, function(error) {
        pageMenu.log('Error Creating window:' + error);
      });
      break;
    case "gather":
      if (gather > 0) return;
      var popupURL = chrome.runtime.getURL("contextMenu/EmpireFleet.html");
      var creating = chrome.windows.create({
        url: popupURL,
        type: "popup",
        height: 768,
        width: 1024
      });
      creating.then(function(windowInfo) {
        pageMenu.log('Created:' + windowInfo.id);
        gather = windowInfo.id;
      }, function(error) {
        pageMenu.log('Error Creating window:' + error);
      });
      break;
    case "super-scanners":
      if (superscanners > 0) return;
      var popupURL = chrome.runtime.getURL("contextMenu/SuperScanners.html");
      var creating = chrome.windows.create({
        url: popupURL,
        type: "popup",
        height: 768,
        width: 1024
      });
      creating.then(function (windowInfo) {
        pageMenu.log('Created:' + windowInfo.id);
        superscanners = windowInfo.id;
      }, function (error) {
        pageMenu.log('Error Creating window:' + error);
      });
      break;
    case "open-sidebar":
      pageMenu.log("Opening my sidebar");
      break;
    case "misc-options":
      try {
        if (miscoptions > 0) return;
        toolsMenu.log("Clicked the misc options menu item");

        var popupURL = chrome.runtime.getURL("options/options.html");
        var creating = chrome.windows.create({
          url: popupURL,
          type: "popup",
          height: 400,
          width: 300
        });
        creating.then(function(windowInfo) {
          toolsMenu.log('Created:' + windowInfo.id);
          miscoptions = windowInfo.id;
        });
      } catch (e) {
        lg.debug(e, 'Error in menus.misc-options:', {
          stack: true
        });
      }
      break;
    case "scout-options":
      try {
        if (scoutoptions > 0) return;
        toolsMenu.log("Clicked the scout options menu item");

        var popupURL = chrome.runtime.getURL("options/scout/options.html");
        var creating = chrome.windows.create({
          url: popupURL,
          type: "popup",
          height: 280,
          width: 250
        });
        creating.then(function(windowInfo) {
          toolsMenu.log('Created:' + windowInfo.id);
          scoutoptions = windowInfo.id;
        });
      } catch (e) {
        lg.debug(e, 'Error in menus.scout-options:', {
          stack: true
        });
      }
      break;
    case 'sync-options-from-db':
      chrome.tabs.sendMessage(tab.id, new Message('content', 'SyncFromDb', {
        ConfirmText: 'Load options from DB?'
      }));
      break;
    case 'sync-options-to-db':
      chrome.tabs.sendMessage(tab.id, new Message('content', 'SyncToDb', {
        ConfirmText: 'Save options to DB?'
      }));
      break;
    case 'reload':
      chrome.runtime.reload();
      break;
    case "help-menu":

      toolsMenu.log("Clicked the help menu item");
      var popupURL = chrome.runtime.getURL("options/help.html");

      var creating = chrome.tabs.create({
        url: popupURL
      });
      creating.then(function(tab) {
        toolsMenu.log('Created:' + tab.id);
      }, function(error) {
        toolsMenu.log('Error Creating tab:' + error);
      });
      break;
  }
});


// chrome.contextMenus.create({
//   id: "greenify",
//   type: "radio",
//   title: 'Make borders green',
//   contexts: ["all"],
//   checked: true,
//   icons: {Dispers
//     "16": "icons/paint-green-16.png",
//     "32": "icons/paint-green-32.png"
//   }
// }, onCreated);

// chrome.contextMenus.create({
//   id: "check-uncheck",
//   type: "checkbox",
//   title: 'Checkbox',
//   contexts: ["all"],
//   checked: checkedState
// }, onCreated);

// chrome.contextMenus.create({
//   id: "bluify",
//   type: "radio",
//   title: 'Make borders blue',
//   contexts: ["all"],
//   checked: false,
//   icons: {
//     "16": "icons/paint-blue-16.png",
//     "32": "icons/paint-blue-32.png"
//   }
// }, onCreated);
//
// chrome.contextMenus.create({
//   id: "separator-2",
//   type: "separator",
//   contexts: ["all"]
// }, onCreated);
