/*
 * Handles the UI for the user
 */

var lg = new Logger(chrome.runtime.getManifest().version);
var dp = new DPanel();

$(document).ready(function() {
  try {
    // MV3: no getBackgroundPage(). The background pushes state to this panel
    // via chrome.runtime.sendMessage broadcasts (see onMessage listener below).

    // generic menuitem selector
    $('.menuItem').click(function(e) {
      var menuItem = $(e.target).attr('menuItem');
      lg.log('DP: Menu Item Selected:' + menuItem);
      $('.DSISIOState').html('<b>WORKING...</b>');
      if (menuItem == 'GetRoute') {
        $('#RouteDetails').html('<tr><th>Working</th></tr>');
      }
      if (menuItem == 'ScanGalaxyReport') {
        dp.SendMenuSelected(menuItem, { ReportLimit: $('#galRepLimit').val() });
      } else {
        dp.SendMenuSelected(menuItem);
      }
    });

    $('#DisperseScouts').click(function(e) {
      dp.SendToActiveTab(new Message('content', 'DisperseScouts', {
        FleetGalaxy: $('#cFleetGalaxy').val(),
        HomeLz: $('#cHomeLz').val()
      }));
    });

    $('#PauseScout').click(function() {
      var msg = new Message('content', 'PauseScout', {
        Message: 'Pause Scout Clicked'
      });
      var m = $('#PauseScout').text();
      if(m == 'Pause Scout') $('#PauseScout').text('Resume Scout');
      else $('#PauseScout').text('Pause Scout');
      dp.SendToActiveTab(msg);
      dp.log('Sent Pause Scout');
    });

    // reset Scout
    $('#btnResetScout').unbind('click').click(function(e) {
      lg.log('Reset');
      $('.ActiveScoutMsg').text('No Active Scout - Reset by User');
      dp.SendToActiveTab(new Message('content', 'ResetAutoScout', {
        // send tabkey for extra verification
        TabKey: dp.ActiveTab.TabKey
      }));
    });
    
    $('#cDisbandScouts').click(function(e) {
      var c = $(this).prop('checked');
      $(this).prop('checked', c);
      dp.SendToActiveTab(new Message('content', 'DisbandScouts', {
        DisbandScouts: c
      }));
    });

    $('#cHomeLz').change(function(e) {
      var loc = $(this).val();
      if(loc == '') return;
      var m = loc.match(/[A-Z]\d\d:\d\d:\d\d:\d\d/);
      if(m == null) {
        $(this).val('BAD LOC');
        return;
      }
      var msg = new Message('content', 'HomeLz', {
        HomeLz: $('#cHomeLz').val()
      });
      dp.SendToActiveTab(msg);
      dp.log('Sent New LZ to content');
    });

    $('#btnStartLauncher').click(function(e) {
      var ltime = $('#LaunchTime').val();
      var msg = new Message('content', 'Launcher', {
        Mode: $('#LaunchType').val(),
        LaunchStr: $('#LaunchTime').val(),
        TimerType: $('#TimeType').val()
      });
      dp.SendToActiveTab(msg);
      dp.log('Sent Set Launcher');
    });

    $('.menuSelect').click(function(e) {
      $('#gsGalaxy').html('');
      $('#gsRegion').html('');
      var menuItem = $(e.target).attr('menuItem');
      switch (menuItem) {
        case 'ScanGuildSystems':
          var ch = '<option value="all">All</option>';
          var gh = '<option value="all">All</option>';
          for (var i = 0; i < 10; i++) {
            ch += '<option value="' + i + '">' + i + '</option>';
            gh += '<option value="' + i + '">' + i + '</option>';
          }
          $('#gsCluster').html(ch);
          $('#gsGalaxy').html(gh);
          $('#divGuildSystems').show();
          break;
        case 'ScanList':
          $('.ScanList').show();
          $('#btnScanList').click(function(e) {
            // submit the list
            $('.DSISIOState').html('<b>WORKING...</b>');
            var txt = $('#txtScanList').val();
            dp.SendToActiveTab(new Message('content', 'ScanList', {
              ListText: txt
            }));
          });
          break;
      }
    });

    $('#btnScanGuildSystems').click(function(e) {
      $('.DSISIOState').html('<b>WORKING...</b>');
      var cluster = $('#gsCluster').val();
      var galaxy = $('#gsGalaxy').val();
      dp.SendToActiveTab(new Message('content', 'ScanGuildSystems', {
        Cluster: cluster,
        Galaxy: galaxy
      }));
    });

    $('#btnScanGuildProfiles').click(function(e) {
      $('.DSISIOState').html('<b>WORKING...</b>');
      dp.SendToActiveTab(new Message('content', 'ScanGuildProfiles', {}));
    });

  } catch (e) {
    lg.debug(e, 'Error in dpanel.ready:', {
      stack: true
    });
  }
});

function DisplayLaunchTimer(secs) {
  DisplayTimer(secs, 'LaunchTimer');
}

function DisplayScoutTimer(secs) {
  DisplayTimer(secs, 'ScoutTimer');
}

function DisplayTimer(seed, elId) {
  try {

    if (dp.Timer != null) dp.Timer.stop();

    $('#' + elId).text('');
    if (seed == 0) {
      return;
    }
    dp.Timer = new Timer(seed, function(secs) {
      //Update display
      var distance = new Date(parseInt(secs) * 1000).getTime();
      var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (hours < 10) hours = '0' + hours;
      var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      if (minutes < 10) minutes = '0' + minutes;
      var seconds = Math.floor((distance % (1000 * 60)) / 1000);
      if (seconds < 10) seconds = '0' + seconds;

      var dstr = hours + ':' + minutes + ':' + seconds;
      $('#' + elId).text(dstr);
    }, function() {
      dp.log('Timer went off for:' + elId);
      $('#' + elId).text('Ring!');
      return;
    }).start();
  } catch (e) {
    lg.debug(e, 'Error in DisplayTimer:', {
      stack: true
    });
  }
}

function DisplayStatus(message) {
  try {
    var from = 'UNKNOWN:';
    if (message.actionArgs.from) from = message.actionArgs.from;
    var msg = '[' + from + '] ' + message.actionArgs.displayText;
    from = '' + from;
    if (from && from.match(/^C/)) $('.DSISIOState').html('');
    $("#divStatus").append('<div class="container mstatus"><div class="row">' +
      '<div class="xs-col-12">' +
      msg + '</div></div></div>');
    window.setTimeout(function() {
      $('.mstatus:first').remove();
    }, 5000);
  } catch (e) {
    lg.debug(e, 'Error in DisplayStatus:', {
      stack: true
    });
  }
}

function DisplayDsisServer(gmServer) {
  try {
    // make sure dsis server(s) are present
    var dbName = '';
    if (gmServer && gmServer.DsisServers) {
      for (var i = 0; i < gmServer.DsisServers.length; i++) {
        dbName += gmServer.DsisServers[i].dbName + ' ';
      }
    }
    if (dbName == '') {
      $('span.DSISHeartBeat').text('[NOT READY]').css('color', 'lightred');
      return;
    }
    $('span.DSISHeartBeat').text('[READY]').css('color', 'lightgreen');
    $('.DSISActive').show();
    $('span.DSISActiveMsg').text(dbName).css('color', 'yellow');
  } catch (e) {
    lg.debug(e, 'Error in DisplayDsisServer:', {
      stack: true
    });
  }
}

function GetNumScouted() {
  try {
    var n = 0;
    $.each(dp.ActiveTab.ActiveScout.ScoutRegions, function(index, region) {
      n += (region.Status == 1 && region.location != 'unset') ? 1 : 0;
    });
    return n;
  } catch (e) {
    lg.debug(e, 'Error in GetNumScouted:', {
      stack: true
    });
  }
}

function GetNumRemaining() {
  try {
    var n = 0;
    $.each(dp.ActiveTab.ActiveScout.ScoutRegions, function(index, region) {
      n += (region.Status != 1 && region.location != 'unset') ? 1 : 0;
    });
    return n;
  } catch (e) {
    lg.debug(e, 'Error in GetNumRemaining:', {
      stack: true
    });
  }
}

function DisplayActiveScout() {
  try {
    if (dp.ActiveTab == null || dp.ActiveTab.ActiveScout == null || dp.ActiveTab.ActiveScout.SourceFleets.length == 0) {
      $('.ActiveScout').hide();
      $('.HideActiveScout').show();
      return;
    }
    var scouted = GetNumScouted();
    var remaining = GetNumRemaining();
    $('#acStartLocation').text(dp.ActiveTab.ActiveScout.SourceFleets[0].location);
    $('#acRegionsScouted').text(scouted);
    $('#acRegionsRemaining').text(remaining);
    $('#acGalaxy').text(dp.ActiveTab.ActiveScout.Galaxy);
    $('#acStartLocation').text(dp.ActiveTab.ActiveScout.StartLocation);
    $('#acScoutsDeployed').text(dp.ActiveTab.ActiveScout.ScoutFleets.length);
    $('#acMaxScouts').text(dp.ActiveTab.ActiveScout.MaxScouts);
    var txt = (dp.ActiveTab.ActiveScout.status == '') ? '' : dp.ActiveTab.ActiveScout.status;
    $('#ScoutStatus').text(txt);
    $('.ActiveScout').show();
    $('.IfStopped').show();
    $('.HideActiveScout').hide();
    $('#pScoutComplete').hide();
  } catch (e) {
    lg.debug(e, 'Error in DisplayActiveScout:', {
      stack: true
    });
  }
}

function DisplayPlayerSummary(args) {
  try {
    $('#lblTechArmour').text(args.Tech[0].armour);
    $('#lblTechDisruptor').text(args.Tech[0].disruptor);
    $('#lblTechIon').text(args.Tech[0].ion);
    $('#lblTechLaser').text(args.Tech[0].laser);
    $('#lblTechMissiles').text(args.Tech[0].missiles);
    $('#lblTechPhoton').text(args.Tech[0].photon);
    $('#lblTechPlasma').text(args.Tech[0].plasma);
    $('#lblTechShielding').text(args.Tech[0].shielding);

    var bobUrl = 'http://www.rockymoon.com/bob/Charts/' +
      dp.ActiveTab.GmServer.serverName + '/Player/index/' + args.PlayerId;
    var h = '<a href="' + bobUrl + '">bob</a>';
    $('#bob').html(h);

    var header = '<tr><th>Location</th>' +
      '<th>Econ</th>' +
      '<th>Max Econ</th>' +
      '<th>JG</th>' +
      '<th>P-Rings</th>' +
      '<th>P-Shields</th>' +
      '</tr>';
    $('#tblBases').html(header);

    $.each(args.Bases, function(index, base) {
      var url = 'https://' + dp.ActiveTab.GmServer.serverName +
        dp.ActiveTab.GmServer.baseUrl +
        '/map.aspx?loc=' + base.coords;

      var h = '<tr><td>' +
        '<a href="' + url + '" >' + base.coords + '</a>' +
        '</td>' +
        '<td>' + base.current_econ + '</td>' +
        '<td>' + base.max_econ + '</td>' +
        '<td>' + base.jump_gate + '</td>' +
        '<td>' + base.p_ring + '</td>' +
        '<td>' + base.p_shield + '</td>' +
        '</tr>';
      $('#tblBases').append(h);
    });

    header = '<tr><th>Location</th>' +
      '<th>Size</th>' +
      '<th>Arrival</th></tr>';
    $('#tblFleet').html(header);

    $.each(args.Fleets, function(index, fleet) {
      var url = 'https://' + dp.ActiveTab.GmServer.serverName +
        dp.ActiveTab.GmServer.baseUrl +
        '/map.aspx?loc=' + fleet.coords;
      var h = '<tr><td>' +
        '<a href="' + url + '" >' + fleet.coords + '</a>' +
        '</td>' +
        '<td>' + fleet.size + '</td>' +
        '<td>' + fleet.arrival + '</td>' +
        '</tr>';
      $('#tblFleet').append(h);
    });

  } catch (e) {
    lg.debug(e, 'Error in DisplayPlayerSummary:', {
      stack: true
    });
  }
}

function DisplayRoute(data) {
  $('#RouteDetails').html('');

  var mins = Math.round(data.bestpathtime / 60);
  var hours = (mins > 60) ? Math.round(mins / 60) : 0;
  //var days = (hours>24)?Math.round(hours/24):0;
  var used = hours * 60 * 60;
  mins = Math.round((data.bestpathtime - used) / 60);
  //var dstr = (days>0)?'Days:' + days:'';
  var ds = hours + ' hrs ' + mins + ' mins';
  var h = '<tr>' +
    '<th colspan="4">Trip Time:' + ds + '</th></tr>' +
    '<tr>' +
    '<th>' +
    '<a href="#" id="btnUseRoute">Use Route Start</a>' +
    '</th>' +
    '</tr>' +
    '<tr>' +
    '<th>Location</th>' +
    '<th>Name</th>' +
    '<th>Owner</th>' +
    '<th>JG</th>' +
    '</tr>';
  $.each(data.details, function(index, base) {
    h += '<tr>' +
      '<td>' + base.location + '</td>' +
      '<td>' + base.name + '</td>' +
      '<td>' + base.nick + '</td>' +
      '<td>' + base.jumpgate + '</td>' +
      '</tr>';
  });
  $('#RouteDetails').html(h);
  $('#btnUseRoute').click(function(e) {
    var msg = new Message('content', 'UseRoute', {
      RouteStart: data.details[0]
    });
    dp.SendToActiveTab(msg);
    dp.log('Using Route');
  });
}

chrome.runtime.onMessage.addListener(function(messageJson) {
  try {
    lg.log('Message to:' + messageJson.target);
    if (messageJson.target == 'sidebar') {
      if(messageJson.action == 'IncomingBookmark') {
        var href = messageJson.actionArgs.Href;
        var txt = messageJson.actionArgs.Text;
        var h = 'Add it? <a href="#" id="btnAddBookmark">' + txt + '</a>';
        $('#divAddBookmark').html(h);
        $('#btnAddBookmark').click(function(e) {
          // add it
          var h = '<tr><td>'
            + '<a target="_blank" href="' + href + '">'
            + txt + '</a>'
            + '</td></tr>';
          $('#tblBookmarks').append(h);
          $('.BookmarksTable').show();
        });
        window.setTimeout(function () {
          $('#divAddBookmark').html('');
        }, 5000);
      }
      if (messageJson.action == 'JgDetails') {
        $('.JgDetails').text(messageJson.actionArgs.JgDetails);
        return;
      }
      if (messageJson.action == 'LaunchInfo') {
        var launch = messageJson.actionArgs.SecondsTillLaunch;
        DisplayLaunchTimer(launch);
        return;
      }
      if (messageJson.action == 'ShowMenuAction') {
        dp.UpdateTabs(messageJson);
        dp.UpdatePrefernces(messageJson.actionArgs.preferences);

        dp.HideAllMenus();
        DisplayDsisServer(messageJson.actionArgs.gmServer);
        dp.ShowMenuAction(messageJson.actionArgs);
        return;
      }
      if (messageJson.action == 'PlayerSummary') {
        DisplayPlayerSummary(messageJson.actionArgs);
        return;
      }
      if (messageJson.action == 'DisplayStatus') {
        if (dp.IsActiveTab(messageJson) === true) DisplayStatus(messageJson);
        else dp.log('Message from other tab:' + JSON.stringify(messageJson));
        return;
      }
      if (messageJson.action == 'DisplayRoute') {
        DisplayRoute(messageJson.actionArgs.Result);
        return;
      }
      if (messageJson.action == 'DSISActive') {
        DisplayStatus(messageJson);
        DisplayDsisServer(messageJson.actionArgs.gmServer);
        // LOCAL PORT: angeldsis.com battle calculator is gone; use the public one.
        $('#BattleCalcUrl').prop('href', 'https://aebits.win/aeBattleCalc').prop('target', '_blank');
        return;
      }
      if (messageJson.action == 'GotPreferences') {
        dp.UpdateTabs(messageJson);
        return;
      }
      if (messageJson.action == 'UpdateScoutStatus') {
        DisplayStatus(messageJson);
        if (dp.ActiveTab.TabKey == messageJson.actionArgs.tabData.id) {
          $('.ActiveScoutMsg').text(messageJson.actionArgs.status);
          $('#ScoutStatus').text(messageJson.actionArgs.status);
          DisplayTimer(0);
          if (messageJson.actionArgs.status == 'COMPLETE') {
            $('#pScoutComplete').show();
          }
        }
      }
      if (messageJson.action == 'UpdateScoutTimer') {
        dp.UpdateTabs(messageJson);
        DisplayStatus(messageJson);
        if (dp.ActiveTab.TabKey == messageJson.actionArgs.tabData.id) {
          DisplayScoutTimer(messageJson.actionArgs.seed);
        }
      }
    }
  } catch (e) {
    lg.debug(e, 'Error in dsis-panel.addListener:', {
      stack: true
    });
  }
});
