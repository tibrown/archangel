
var Preferences = function () {
  this.StorageKey = 'Preferences';
  this.Scouting = new ScoutingPrefs();
  this.ConnectionDelay = 6000;
  this.Colors = new ColorPrefs();
  // age
  this.LastSynced = null;
}

var ColorPrefs = function() {
  this.MyLandedFleet = '#654321';
  this.FleetNotVisible = '#008000';
  this.FleetVisible = '#FF0000';
  this.EnemyFleet = '#FFD0FF';
  this.AlliedFleet = '#00FFFF';
  this.GuildFleet = '#FFFF00';
}

var ScoutingPrefs = function () {
  this.MaxScouts = 10;
  this.MaxPerRegion = 1;
  this.PickupStrays = 0; // default to no
  // can be honor, all or skip
  this.HandleStrays = 'honor'; // honor max scouts by default
}
