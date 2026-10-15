// scout options

var opt = null;
var lg = new Logger(chrome.runtime.getManifest().version);
var Preferences = null;

$(document).ready(function() {
  try {
    opt = new Options();

    var setupMaxScouts = function () {
      // setup max scouts
      var h = '';
      for (var i = 0; i < 30; i++) {
        var v = i + 1;
        var s = '';
        if (v == 10) s = ' selected ';
        else s = '';
        h += '<option value="' + v + '"' + s + '>' + v + '</option>';
      }
      $('#optMaxScouts').html(h);

    }
    setupMaxScouts();

    // setup listener
    chrome.runtime.onMessage.addListener(function(message) {
      try {

        if (message.target == 'ScoutOptions') {
          lg.log('ScoutOptions:Message to:' + message.action);
          if (message.action == 'Preferences') {
            Preferences = message.actionArgs.Preferences;
            $('#optMaxScouts option[value=' + Preferences.Scouting.MaxScouts + ']').attr('selected', 'selected');
            $('#selHonorMax option[value=' + Preferences.Scouting.HandleStrays + ']').attr('selected', 'selected');
            $('#chkPickupStrays').prop('checked', false);
            if (Preferences.Scouting.PickupStrays == 1) $('#chkPickupStrays').trigger('click');


          }
          return;
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
        actionArgs: { op: 'GetPreferences', target: 'ScoutOptions' }
      });


      // setup eventhandlers
      $('#chkPickupStrays').click(function(e) {
        if ($(this).is(':checked')) $('.HandleStrays').show();
        else $('.HandleStrays').hide();
      });
      // update preferences
      $('#btnUpdatePreferences').click(function(e) {

        Preferences.Scouting.MaxScouts = $('#optMaxScouts').val();
        Preferences.Scouting.PickupStrays = ($('#chkPickupStrays').is(':checked')) ? 1 : 0;
        Preferences.Scouting.HandleStrays = $('#selHonorMax').val();

        chrome.runtime.sendMessage({
          target: 'background',
          action: 'UIBridge',
          actionArgs: { op: 'UpdatePreferences', preferences: Preferences, target: 'ScoutOptions' }
        });
        opt.log('Preferences Updated');
        $('.notify').text('Updating..');
        window.setTimeout(function() {
          $('.notify').text('');
        }, 3000);
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
    lg.log('ScoutOptions:' + msg);
  }

}
