

var currentTab = null;

var lg = new Logger(chrome.runtime.getManifest().version);

function log(msg) {
  lg.log('CTX:' + msg);
}

var StatusLog = function() {

  this.GmServer = null;

  this.DisplayLog = function(msg) {
    var h = '<tr><td>' + msg + '</td></tr>';
    $('#Log').append(h);
    $(document).scrollTop($(document).height());
  }

  this.ClearLogs = function(screenOnly = false) {
    if(screenOnly === false) {
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'UIBridge',
        actionArgs: { op: 'ClearLogs' }
      });
    }
    $('#Log').html('');
  }

  this.GetAllLogs = function(callback) {
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UIBridge',
      actionArgs: { op: 'GetAllLogs' }
    }).then(function(resp) {
      if (typeof callback == 'function') {
        callback((resp && resp.Logs) ? resp.Logs : []);
      }
    });
  }

  this.FilterInteresting = function() {
    sLog.GetAllLogs(function(logs) {
      sLog.ClearLogs(true);
      $.each(logs, function(index, log) {
        if(log.log && log.log.toLowerCase().includes('debris')) sLog.DisplayLog(log.log);
        if(log.log && log.log.toLowerCase().includes('owner')) sLog.DisplayLog(log.log);
        if(log.log && log.log.toLowerCase().includes('units')) sLog.DisplayLog(log.log);
      });
    });
  }

  this.ResetFilter = function() {
    sLog.GetAllLogs(function(logs) {
      sLog.ClearLogs(true);
      $.each(logs, function(index, log) {
        sLog.DisplayLog(log.message);
        if(log.log) sLog.DisplayLog(log.log);
      });
    });
  }

  // functions BG can run
  this.log = function(msg) {
    lg.log('SLOG:' + msg);
  }

  this.MessageFromBg = function(msg) {
    if (msg.action == 'LogData') {
      // display the fleets
      sLog.log('Got data:');
      var logs = msg.actionArgs.LogData;
      $('#Log').html('');
      $.each(logs, function(index, log) {
        sLog.DisplayLog(log.message);
        if (log.log) {
          sLog.DisplayLog(log.log);
        }
      });
      return;
    }
    if (msg.action == 'CTXFleetMoved') {
      gTh.FleetSent(msg.actionArgs.status);
      return;
    }
  }
}

var sLog = new StatusLog();

$(document).ready(function() {
  try {
    lg.log('CTX:StatusLog active');
    // MV3: background broadcasts to this popup via chrome.runtime.sendMessage.
    chrome.runtime.onMessage.addListener(function(messageJson) {
      try {
        if (messageJson && messageJson.target == 'StatusLog') {
          if (messageJson.action == 'DisplayLog') {
            var le = messageJson.actionArgs;
            sLog.DisplayLog(le.message);
            if (le.log) sLog.DisplayLog(le.log);
          } else if (messageJson.action == 'LogData') {
            var logs = messageJson.actionArgs.LogData;
            $('#Log').html('');
            $.each(logs, function(index, log) {
              sLog.DisplayLog(log.message);
              if (log.log) sLog.DisplayLog(log.log);
            });
          }
        }
      } catch (e) {
        lg.debug(e, 'Error in StatusLog.onMessage:', { stack: true });
      }
    });

    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UIBridge',
      actionArgs: { op: 'GetMenuOpener' }
    }).then(function(resp) {
      currentTab = (resp && resp.MenuOpener) ? resp.MenuOpener : null;
      lg.log('CTX: background online');
      if(currentTab != null) {
        chrome.runtime.sendMessage({
          target: 'background',
          action: 'UIBridge',
          actionArgs: { op: 'GetStatusLogs' }
        });
      }
    });
    $('#ClearLogs').unbind('click').click(function(e) {
      sLog.ClearLogs();
    });
    $('#FilterInteresting').unbind('click').click(function(e) {
      sLog.FilterInteresting();
    });
    $('#ResetFilter').unbind('click').click(function(e) {
      sLog.ResetFilter();
    });
  } catch (e) {
    lg.debug(e, 'Error in StatusLog.ready:', {
      stack: true
    });
  }
});
