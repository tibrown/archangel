
// persistent data for one server

var ServerData = function(gmServer = null, prefs = null, activeScouts = []) {

  this.Preferences = prefs;
  this.GmServer = gmServer;
  this.GmServersJson = null;
  this.ActiveScouts = activeScouts;
  this.ActiveScout = null;
  this.Errors = [];
  this.LastUpdated = Date.now();
  this.LastSaved = null;
}
