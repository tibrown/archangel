var opt = null;
var lg = new Logger(chrome.runtime.getManifest().version);
var Preferences = null;
var TextBased = false;

$(document).ready(function() {
  try {
    opt = new Options();

    // setup listener
    chrome.runtime.onMessage.addListener(function(message) {
      try {
        if (message.target == 'MiscOptions') {
          lg.log('Message to MiscOptions:' + message.action);
          if (message.action == 'Preferences') {
            Preferences = message.actionArgs.Preferences;
            $('#optConnectionDelay').val(Preferences.ConnectionDelay);
            if (Preferences.Colors) {
              if (typeof $('#MyLandedFleetColor').spectrum != 'function' || TextBased === true) {
                $('#MyLandedFleetColor').val(Preferences.Colors.MyLandedFleet);
                $('#FleetNotVisibleColor').val(Preferences.Colors.FleetNotVisible);
                $('#FleetVisibleColor').val(Preferences.Colors.FleetVisible);
                $('#GuildFleetColor').val(Preferences.Colors.GuildFleet);
              } else {
                $('#MyLandedFleetColor').spectrum({
                  color: Preferences.Colors.MyLandedFleet
                });
                $('#FleetNotVisibleColor').spectrum({
                  color: Preferences.Colors.FleetNotVisible
                });
                $('#FleetVisibleColor').spectrum({
                  color: Preferences.Colors.FleetVisible
                });
                $('#GuildFleetColor').spectrum({
                  color: Preferences.Colors.GuildFleet
                });
              }
            }
            return;
          }
        }

      } catch (e) {
        opt.log('Error in OnMessage:' + e.message);
      }
    });

    // MV3: no getBackgroundPage(). Get the current tab + wire prefs through
    // the UIBridge message the background handles.
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UIBridge',
      actionArgs: { op: 'GetMenuOpener' }
    }).then(function(resp) {
      opt.CurrentTab = (resp && resp.MenuOpener) ? resp.MenuOpener : null;
      opt.log('Got background bridge');

      // request prefernces, will return as a message from bg
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'UIBridge',
        actionArgs: { op: 'GetPreferences', target: 'MiscOptions' }
      });

      // update preferences
      $('#btnUpdatePreferences').click(function(e) {
        if (typeof $('#MyLandedFleetColor').spectrum != 'function' || TextBased === true) {
          Preferences.Colors.MyLandedFleet = $('#MyLandedFleetColor').val();
          Preferences.Colors.FleetNotVisible = $('#FleetNotVisibleColor').val();
          Preferences.Colors.FleetVisible = $('#FleetVisibleColor').val();
          Preferences.Colors.GuildFleet = $('#GuildFleetColor').val();
        }
        chrome.runtime.sendMessage({
          target: 'background',
          action: 'UIBridge',
          actionArgs: { op: 'UpdatePreferences', preferences: Preferences, target: 'MiscOptions' }
        });
        opt.log('Preferences Updated');
        $('.notify').text('Updating..');
        window.setTimeout(function() {
          $('.notify').text('');
        }, 3000);
      });

      $('#TextBased').click(function(e) {
        var c = $('#TextBased').is(':checked');
        if(c === true) {
          TextBased = true;
          $('.color').spectrum({disabled: true});
        } else {
          TextBased = false;
          $('.color').spectrum({disabled: false});
        }
      });

      // pickup connection delay change
      $('#optConnectionDelay').change(function(e) {
        Preferences.ConnectionDelay = $(this).val();
      });

      // colors
      $("#MyLandedFleetColor").on('change.spectrum', function(e) {
        Preferences.Colors.MyLandedFleet = $(this).spectrum('get').toHexString();
      }).spectrum({
        color: "lightblue"
      });

      $("#FleetVisibleColor").on('change.spectrum', function(e) {
        Preferences.Colors.FleetVisible = $(this).spectrum('get').toHexString();
      }).spectrum({
        color: "lightred"
      });

      $("#FleetNotVisibleColor").on('change.spectrum', function(e) {
        Preferences.Colors.FleetNotVisible = $(this).spectrum('get').toHexString();
      }).spectrum({
        color: "lightgreen"
      });

      $("#GuildFleetColor").on('change.spectrum', function(e) {
        Preferences.Colors.GuildFleet = $(this).spectrum('get').toHexString();
      }).spectrum({
        color: "lightcyan"
      });

    }, function(error) {
      opt.log('Error getting background:' + error);
    });

  } catch (e) {
    lg.debug(e, 'Error in Options.ready:', {
      stack: true
    });
  }
});

var Options = function() {
  this.Preferences = null;
  this.CurrentTab = null;

  this.log = function(msg) {
    lg.log('MiscOptions:' + msg);
  }

}
