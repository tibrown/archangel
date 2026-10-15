/*
 * All content global variables go here
 * This is so they can be stored in local storage easily..
 */
var ctGlobals = function() {
  this.LastUrlCallback = null;
  this.IsScoutPaused = false;
  this.ParsingFromButton = false;
  this.DsisAutoScout = false;
  this.SendingPlayerId = 0;
  this.CurrentCredits = 0;
  this.httpErrors = 0;
  this.HideRCDisplay = false;
  this.CheckRecs = false;
  this.SkipFleetScan = 0;
  this.SkipLocalFleetScan = 0;
  this.CurrentWatchLocation = {};
  this.ErrorsDetected = false;
  this.TabData = null;

  this.SetTabData = function(tabData) {
    this.TabData = tabData;
  }
  this.GetTabData = function() {
    return this.TabData;
  }
}
