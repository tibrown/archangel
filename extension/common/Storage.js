
var StoragePacket = function(_data, _key, _servid, _userId, _storageType = 1) {
  this.servid = _servid;
  this.userId = _userId;
  this.storageType = _storageType; // default random
  this.storageData = _data;
  this.storageKey = _key;
  this.LastUpdated = Date.now();

  this.StoragePreferences = 0;
  this.StorageRandom = 1;
  this.StorageScouting = 2;
}

StoragePacket.StoragePreferences = 0;
StoragePacket.StorageRandom = 1;
StoragePacket.StorageScouting = 2;

var ErrorPacket = function(_servid, _userid, _baseUrl, _errorReport) {
  this.servid = _servid;
  this.userId = _userid;
  this.baseUrl = _baseUrl;
  this.errorReport = _errorReport;
}
