// represents one tab.  Use to track particulars about one tab
var dTabData = function(tabData) {
  this.TabKey = tabData.id;
  this.TabId = tabData.tabId;
  this.WindowId = tabData.windowId;
  this.GmServer = tabData.gmServer;
  this.Preferences = tabData.preferences;
}

var DPanel = function() {
  this.Timer = null;
  this.Tabs = [];
  this.ActiveTab = null;
  this.bg = null;
  this.ServerTimeOffset = 0;


  this.log = function(msg) {
    lg.log('DP:' + msg);
  }

  // an error at server has occured
  this.SetDSISErrorState = function(msg) {
    $('.DSISErrorState').html('<br/>SERVER ERROR:' + msg);
  }

  this.ClearDSISErrorState = function() {
    $('.DSISErrorState').text('');
  }

  this.UpdatePrefernces = function(prefs) {
    if(typeof prefs == 'undefined') {
      dp.log('UpdatePreferences:prefs undefined');
      return;
    }
    $('#optMaxScouts option[value=' + prefs.Scouting.MaxScouts + ']').attr('selected', 'selected');
    $('#optConnectionDelay option[value=' + prefs.ConnectionDelay + ']').attr('selected', 'selected');
    $('#selHonorMax option[value=' + prefs.Scouting.HandleStrays + ']').attr('selected', 'selected');
    $('#chkPickupStrays').prop('checked', false);
    if(prefs.Scouting.PickupStrays == 1) $('#chkPickupStrays').trigger('click');

  }

  // FIXME need to send active tabdata to sidebar during connect
  this.UpdateTabs = function(msg) {
    try {
      var ret = false;
      if (typeof msg.actionArgs.tabData == 'undefined') {
        dp.log('UpdateTabs: no tab data');
        this.ActiveTab = null;
        return false;
      }
      var t = msg.actionArgs.tabData;
      var tb = new dTabData(t);
      tb.ActiveScout = msg.actionArgs.activeScout;
      this.Tabs[tb.TabKey] = tb;
      dp.ActiveTab = tb;

    } catch (e) {
      lg.debug(e, 'Error in DP.UpdateTabs:', {
        stack: true
      });
    }
  }

  this.IsActiveTab = function(msg) {
    if (typeof msg.actionArgs.tabData == 'undefined') {
      dp.log('IsActiveTab: no tab data');
      this.ActiveTab = null;
      return false;
    }
    var t = msg.actionArgs.tabData;
    var tb = new dTabData(t);
    if (dp.ActiveTab != null && tb.TabKey == dp.ActiveTab.TabKey) return true;
    return false;
  }

  this.DisplayStatus = DisplayStatus;

  this.SendMenuSelected = function(menuItem) {
    try {
      var msg = new Message('content', 'NotifyActiveTab', {
        actionType: 'MenuItemSelected',
        menuItem: menuItem,
        dTabData: this.ActiveTab
      });
      chrome.tabs.sendMessage(dp.ActiveTab.TabId, msg);
      lg.log('********************  MENU ITEM:' + msg.actionArgs.menuItem);
    } catch (e) {
      lg.debug(e, 'Error in DP.SendMenuSelected:', {
        stack: true
      });
    }
  }

  this.SendMenuSelectedIndirect = function(menuItem) {
    try {
      var msg = new Message('background', 'NotifyActiveTab', {
        actionType: 'MenuItemSelected',
        menuItem: menuItem,
        dTabData: this.ActiveTab
      });
      dp.SendMessage(msg);
      lg.log('********************  MENU ITEM:' + msg.actionArgs.menuItem);
    } catch (e) {
      lg.debug(e, 'Error in DP.SendMenuSelected:', {
        stack: true
      });
    }
  }

  this.SendMessage = function(msg) {
    chrome.runtime.sendMessage(msg);
  }

  this.ClearTimers = function() {
    if(dp.Timer) dp.Timer.stop();
    clearInterval(TheInterval);
    dp.Timer = null;
    $('.timer').text('');
  }

  this.SetDefaultPrefs = function(prefs) {
    $('#cMaxScouts').text(prefs.Scouting.MaxScouts);
    var t = (prefs.ConnectionDelay/1000) + ' Seconds';
    $('#cConnectionDelay').text(t);
    t = (prefs.Scouting.PickupStrays==1)?'Yes':'No';
    $('#cPickupStrays').text(t);
    t = 'Honor Max';
    if(prefs.Scouting.HandleStrays == 'skip') t = 'Skip Busy';
    if(prefs.Scouting.HandleStrays == 'all') t = 'Send all';
    $('#cHandleStrays').text(t);
  }

  this.ShowMenuAction = function(args) {
    try {
      dp.ServerTimeOffset = args.ServerTimeOffset;
      var v = chrome.runtime.getManifest().version;
      dp.ClearTimers();
      $('.version').text(v);
      DisplayActiveScout();
      $('.FleetGates').hide();
      $('.launcher, .ScanList').hide();
      $('#divGuildSystems').hide();
      $('#divFleetSummary').html('');
      $('.DSISIOState').html('');
      $('#txtScanList').val('');
      //$('#divHints').hide();
      $('#lblPlayerId').text(args.playerId);
      // MV3: SendingPlayerId is tracked in the background service worker via
      // the HandShake message; there is no background page to write to here.
      var gs = args.gmServer;
      if (dp.ActiveTab != null) {
        dp.ActiveTab.Preferences = args.preferences;
      }
      $('#optMaxScouts').val(args.preferences.Scouting.MaxScouts);
      $('#optConnectionDelay').val(args.preferences.ConnectionDelay);

      if (args.page == 'empire') {
        if (args.subPage == 'events') {
          $('#divEmpireEvents').show();

        } else if (args.subPage == 'production') {
          $('#divEmpireProduction').show();
        } else if (args.subPage == 'economy') {
          $('#divEmpireEconomy').show();
        } else if (args.subPage == 'trade') {
          $('#divEmpireTrade').show();
        } else if (args.subPage == 'capacities') {
          $('#divEmpireCapacities').show();
        } else if (args.subPage == 'structures') {
          $('#divEmpireStructures').show();
        } else if (args.subPage == 'fleets') {
          $('#divEmpireFleets').show();
        } else if (args.subPage == 'units') {
          $('#divEmpireUnits').show();
        } else if (args.subPage == 'scanners') {
          $('#divEmpireScanners').show();
        } else if (args.subPage == 'technologies') {
          $('#divEmpireTechnologies').show();
        }
        $('#lblNumBases').text('Bases: ' + args.bases);
        //$('#divEmpireEvents').show();
      } else if (args.page == 'map') {
        var galaxy = true;
        var region = args.search.match(/loc=([A-Z]\d\d:\d\d)/);
        var system = args.search.match(/loc=([A-Z]\d\d:\d\d:\d\d)/);
        var astro = args.search.match(/loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/);
        if (astro != null) {
          $('#divAstro').show();
          this.AddFleetSummary(args.fleetSummary, args.gmServerName);
        } else if (system != null) {
          $('#divSystem').show();
        } else if (region != null) {
          $('#divRegion').show();
        } else if (galaxy === true) {
          $('#divGalaxy').show();
          dp.SetDefaultPrefs(args.preferences);
          var m = args.FleetGalaxy.match(/([A-Z])(\d\d)/);
          dp.FleetGalaxy = args.FleetGalaxy;
          dp.GPrefix = m[1];
          dp.MaxGalaxy = args.MaxGalaxy;
          dp.HomeLz = args.HomeLz;
          var h = '';
          for(var i=0;i<dp.MaxGalaxy+1;i++) {
            gn = (i<10)?'0' + i:i;
            h += '<option value="' + dp.GPrefix + gn + '">' + dp.GPrefix + gn + '</option>';
          }
          $('#cFleetGalaxy').html(h);
          $('#cFleetGalaxy').val(dp.FleetGalaxy);
          $('#cHomeLz').val(dp.HomeLz);
          // show active scout if we have any
          if (args.activeScout != null) {
            dp.ActiveScout = args.activeScout;
            DisplayActiveScout();
            $('#cHomeLz').val(args.activeScout.SourceFleets[0].location);
            //$('#acStartLocation').text(args.activeScout.SourceFleets[0].location);
          }
        }
      } else if (args.page == 'base') {
        $('#divBase').show();
        this.AddFleetSummary(args.fleetSummary, args.gmServerName);

      } else if (args.page == 'guild') {
        var bobUrl = 'http://www.rockymoon.com/bob/Charts/'
          + args.gmServerName + '/Player/index/';

        var h = '<a href="' + bobUrl + '">bob</a>';
        $('#guildBob').html(h);
        $('#divGuild').show();
      } else if (args.page == 'fleet') {
        $('#divFleet').show();
        var m = args.search.match(/=(\d+)/);
        if (m == null) {
          dp.log('No Fleet Selected fleetid');
          return;
        }
        $('#lblFleetId').text(m[1]);
        if(args.subPage == 'move') {
          $('#RouteDetails').html('');
          $('.FleetGates').show();
          $('#LaunchTime').val(lg.GetNow());
          $('.launcher').show();
          $('#LaunchType').change(function(e) {
            dp.log('Dropdown:' + $(this).val());
          });
          $('#TimeType').val('Local');
          $('#TimeType').change(function(e) {
            // change time in time box
            var t = $(this).val();
            if(t == 'Local') {
              // display local
              $('#LaunchTime').val(lg.GetNow());
            } else {
              // display server time
              var st = moment().add(dp.ServerTimeOffset, 'hours').format('YYYY-MM-DD HH:mm:ss ');
              $('#LaunchTime').val(st);
            }
          });
        }
      } else if (args.page == 'profile') {
        $('#divProfile').show();
        var m = args.search.match(/=(\d+)/);
        if (m == null) {
          dp.log('Error getting playerid');
          return;
        }
        $('#lblProfilePlayerId').text(m[1]);
      } else if (args.page == 'credits') {
        $('#divCredits').show();

      } else if (args.page == 'account') {
        $('#divAccount').show();

      }

    } catch (e) {
      lg.debug(e, 'Error in ShowMenuAction:', {
        stack: true
      });
    }
  }

  this.AddFleetSummary = function(h, serverName) {
    if(typeof h == 'undefined' || h == '') return;
    h = h.replace('guild.aspx', 'https://' + serverName + '.astroempires.com/guild.aspx');
    h = '<small>' + h + '</small>';
    $('#divFleetSummary').html(h).show();
  }

  this.HideAllMenus = function() {
    $('.dsis-functions').hide();
  }

  this.SendToActiveTab = function(msg) {
    try {
      if (dp.ActiveTab == null) {
        // not found...should not happen
        dp.log('Error finding Tab');
        return;
      }
      //tabData.port.posMessage(msg);
      chrome.tabs.sendMessage(dp.ActiveTab.TabId, msg);
    } catch (e) {
      lg.debug(e, 'Error in DP.SendToActiveTab:', {
        stack: true
      });
    }
  }

}
