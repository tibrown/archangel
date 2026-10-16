
var ships = new Ships();
var dsisReq = new DsisRequests();
var gTh = new Gather();

var lg = new Logger(chrome.runtime.getManifest().version);

function GetCurrentTab(onGot, onError) {
  var gettingCurrent = chrome.tabs.getCurrent();
  gettingCurrent.then(onGot, onError);
}

function log(msg) {
  lg.log('CTX:' + msg);
}

var EmpireFunctions = function() {

  this.GmServer = null;
  this.CurrentTab = null;

  // functions BG can run
  this.log = function(msg) {
    lg.log('EMF:' + msg);
  }

  this.MessageFromBg = function(msg) {
    if (msg.action == 'EFData') {
      this.GmServer = msg.actionArgs.GmServer;
      // display the fleets
      this.log('Got fleet data:');
      this.RenderFleets(msg.actionArgs.Results.fleets);
      $('#loading').hide();
      return;
    }
    if (msg.action == 'EFDataChunk') {
      this.GmServer = msg.actionArgs.GmServer;
      // display the fleets
      this.log('Got fleet data chunk:');
      if(msg.actionArgs.Results.status == 'DONE') $('#loading').hide();
      else this.RenderOneFleet(msg.actionArgs.Results.fleet);

      return;
    }
    if (msg.action == 'CTXFleetMoved') {
      gTh.FleetSent(msg.actionArgs.status);
      return;
    }
  }

  this.RenderOneFleet = function(fleet) {
    var baseUrl = 'https://' + this.GmServer.serverName + '.astroempires.com';
    var tbl = $('#FleetStats');
    var tr = '<tr "align="center" class="FleetRow">' +
      '<td slyle=""><small>' +
      '<a target="blank" href="' + baseUrl + '/fleet.aspx?fleet=' +
      fleet.FleetId + '">' +
      fleet.Fleetname +
      '</a>' +
      '</td><td slyle=""><small>' +
      '<a target="blank" href="' + baseUrl + '/map.aspx?loc=' + fleet.Location + '">' + fleet.LocationName + '</a></td>';

    var td = '<td style="text-align: center;border: 1px solid rgb(0, 0, 102);"><small>';

    var cols = 2;
    var mxcols = 22;
    // loop over details
    $.each(fleet.Details, function(index, dship) {
      var sindex = ships.GetShipIndex(dship.Unit);
      var cindex = sindex + 2;
      for (var c = cols; c < cindex; c++) {
        tr += td + '</small></td>';
      }
      cols = cindex + 1;
      tr += td + dship.Amount + '</small></td>';
    })
    cols = (tr.split("<small>").length - 1);
    for (var c = cols; c < mxcols; c++) {
      tr += td + '</small></td>';
    }
    tr += td + fleet.Size + '</small></td></tr>';
    // add the row
    tbl.append(tr);
  }

  this.RenderFleets = function(fleets) {
    try {
      var tbl = $('#FleetStats');
      tbl.find("tr:gt(0)").remove();

      var baseUrl = 'https://' + this.GmServer.serverName + '.astroempires.com';
      $.each(fleets, function(index, fleet) {
        emF.RenderOneFleet(fleet);
      });
    } catch (e) {
      lg.debug(e, 'Error in emF.RenderFleets:', {
        stack: true
      });
    }
  }

}
var emF = new EmpireFunctions();

$(document).ready(function() {
  try {
    lg.log('CTX:context active');
    // MV3: background broadcasts to this popup via chrome.runtime.sendMessage.
    chrome.runtime.onMessage.addListener(function(messageJson) {
      if (messageJson && messageJson.target == 'EmpireFleet') {
        emF.MessageFromBg(messageJson);
      }
    });

    // get the current tab the user opened this menu from
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UIBridge',
      actionArgs: { op: 'GetMenuOpener' }
    }).then(function(resp) {
      emF.CurrentTab = (resp && resp.MenuOpener) ? resp.MenuOpener : null;
      lg.log('CTX: background online');

      if (emF.CurrentTab) {
        chrome.tabs.sendMessage(emF.CurrentTab.id, new Message('content', 'SendFleets', {
          from: 'EmpireFleet'
        }));
      }

      chrome.runtime.sendMessage(new Message('sidebar', 'DisplayMessage', {
        displayText: 'Context Active',
        from: 'context'
      })).catch(function () {});
    });

    $('#btnGather').unbind('click').click(function(e) {
      gTh.GatherUIAction();
    });
    $('#btnReset').unbind('click').click(function(e) {
      // remove all rows but header, reset fleet array
      $('#btnGather').show();
      $('#btnReset').hide();
      $('#loading').show();
      $('#FleetStats').find("tr:gt(0)").remove();
      chrome.tabs.sendMessage(emF.CurrentTab.id, new Message('content', 'SendFleets', {
        from: 'EmpireFleet'
      }));
    });

  } catch (e) {
    lg.debug(e, 'Error in context.ready:', {
      stack: true
    });
  }
});
