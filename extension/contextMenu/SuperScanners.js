var currentTab = null;

var lg = new Logger(chrome.runtime.getManifest().version);

function GetCurrentTab(onGot, onError) {
  var gettingCurrent = chrome.tabs.getCurrent();
  gettingCurrent.then(onGot, onError);
}


var SuperScanners = function() {

  this.GmServer = null;

  // functions BG can run
  this.log = function(msg) {
    lg.log('SS:' + msg);
  }

  this.MessageFromBg = function(msg) {
    if (msg.action == 'SSFleet') {
      this.GmServer = msg.actionArgs.GmServer;
      // display the fleets
      this.log('Got SS data:');
      this.RenderScanners(msg.actionArgs.Fleets);
      $('#loading').hide();
      return;
    }
  }


  this.RenderScanners = function(fleets) {
    try {
      var tbl = $('#tblScanners');
      tbl.find("tr:gt(0)").remove();
      var baseUrl = 'http://' + this.GmServer.serverName + '.astroempires.com/';
      var h = '';
      var lastGal = '';
      $.each(fleets, function(index, fleet) {
        var gal = fleet.location.substring(0,3);
        if(gal != lastGal) {
          h += '<tr><td colspan="6">=========================</td></tr>';
          lastGal = gal;
        }
        var player = fleet.nick + '[' + fleet.guildTag + ']';
        h +=
          '<tr><td>'
          + '<a target="_blank"  href="' + baseUrl + 'fleet.aspx?fleet=' + fleet.fleetId + '">'
          + fleet.name + '</a></td>'
          + '<td>'
          + '<a target="_blank" href="' +  baseUrl + 'profile.aspx?player=' + fleet.playerId + '">'
          + player + '</a>'
          + '</td>'
          + '<td>'
          +  '<a target="_blank" href="' + baseUrl + 'map.aspx?loc=' + fleet.location + '">'
          + fleet.location + '</a></td>'
          + '<td>' + fleet.landing_time + '</td>'
          + '<td>' + fleet.size + '</td>'
          + '<td>' + fleet.lastupdated + '</td>'
          + '</tr>';
          tbl.append(h);
          h = '';
      });


    } catch (e) {
      lg.debug(e, 'Error in ss.RenderScanners:', {
        stack: true
      });
    }
  }

}
var ss = new SuperScanners();

$(document).ready(function() {
  try {
    // MV3: background broadcasts to this popup via chrome.runtime.sendMessage.
    chrome.runtime.onMessage.addListener(function(messageJson) {
      if (messageJson && messageJson.target == 'SuperScanners') {
        ss.MessageFromBg(messageJson);
      }
    });

    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UIBridge',
      actionArgs: { op: 'GetMenuOpener' }
    }).then(function(resp) {
      currentTab = (resp && resp.MenuOpener) ? resp.MenuOpener : null;
      ss.log('background online');

      if (currentTab) {
        chrome.tabs.sendMessage(currentTab.id, new Message('content', 'SendScanners', {
          from: 'SuperScanners'
        }));
      }

      chrome.runtime.sendMessage(new Message('sidebar', 'DisplayMessage', {
        displayText: 'Scanners Active',
        from: 'context'
      }));
    });
    $('#btnRefresh').click(function(e) {
      if (currentTab) {
        chrome.tabs.sendMessage(currentTab.id, new Message('content', 'SendScanners', {
          from: 'SuperScanners'
        }));
      }
    });
  } catch (e) {
    lg.debug(e, 'Error in ss.RenderScanners:', {
      stack: true
    });
  }
});
