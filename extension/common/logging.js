
// all debug/log messaging functions declared here in lg
var Logger = function(_v = 0) {
  var version = '[' + _v + ']:';
  var logs = [];

  this.debug = function(ex, msg, detail) {
    // temp hack
    lg.log(this.GetNow() + version + msg + ':' + ex.message);
    // need a plan for server logs
    if (typeof ctF == 'undefined') return;

    var errorReport = {
      Version: version,
      Exception: JSON.stringify(ex),
      StackTrace: JSON.stringify(lg.GetStackTrace()),
      ExMessage: ex.message,
      Message: msg,
      Detail: JSON.stringify(detail),
      Logs: logs,
      ServerData: ServerData
    };
    this.SendLogToServer(errorReport);
  }

  this.GetStackTrace = function() {
    var err = new Error();
    return err.stack;
  }

  this.SendLogToServer = function (errorReport) {
    try {
      var baseUrl = (GmServer.DsisServers.length==0)?'':GmServer.DsisServers[0].dbName;
      var sp = new ErrorPacket(GmServer.servid, ctG.SendingPlayerId, baseUrl, errorReport);
      ctF.SaveErrorPacket(sp);

    } catch (e) {
      lg.log('Error in SendLogToServer:' + e.message);
    }
  }

  this.GetNow = function () {
    return moment().format('YYYY-MM-DD HH:mm:ss ');
  }

  this.log = function (msg) {
    console.log(this.GetNow() + version + msg);
    logs.push(msg);
    if (logs.length > 25) logs.shift();
  }
}
