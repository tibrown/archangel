 /*
* this class will handle storing active scout data
*
*/

var ActiveScout = function(
    _galaxy, 
    _gmServer,
    _maxScouts = 0) {
  
  this.GmServer = _gmServer;
  this.StorageKey = 'ActiveScout';
  this.Galaxy = _galaxy;
  this.StartGalaxy = _galaxy;
  this.HomeLz = '';
  this.ScoutFleets = [];
  this.ScoutRegions = [];
  this.DisbandScouts = false;
  // fleets in this galaxy with scout ships
  this.SourceFleets = [];
  this.MaxScouts = _maxScouts;
  this.FleetSlots = 0;
  this.ServerName = _gmServer.serverName;
  this.UserId = _gmServer.playerId;
  this.status = '';
  this.RunStatus = ActiveScout.IsStopped;
  this.ScoutTimerVal = null;
}

// globals, works like static vars
ActiveScout.IsStopped = 0;
ActiveScout.IsRunning = 1;
ActiveScout.IsFinished = 2;
ActiveScout.IsErrored = 3;
ActiveScout.StorageKey = 'ActiveScout';
