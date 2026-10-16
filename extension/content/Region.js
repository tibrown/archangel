/*
This class and its utility class take care of Regions
*/


// regions
var Region = function(region) {
  this.location = 'unset';
  this.region = region;
  this.jg = 0;
  this.Status = 0;

  this.hasEyes = false;
}

var ScoutRegionUtil = function() {

  // possible statuses
  this.UnScanned = 0;
  this.Scanned = 1;
  this.InProgress = 2;
  this.EnRoute = 3;
  // getting ready to send
  this.Preparing = 4;
  // used to mark for scanning in place, no scout needed, have eyes
  this.CanScan = 5;

  this.log = function(msg) {
    lg.log('SRU:' + msg);
  }
  
  this.AnyCanScan = function () {
    for (var i = 0; i < aScout.ScoutRegions.length; i++) {
      if (aScout.ScoutRegions.Status == sru.CanScan) return true;
    }
    return false;
  }

  this.SetStatusInProgress = function(region) {
    region.Status = this.InProgress;
    this.UpdateRegions(region);
  }

  this.SetStatusEnRoute = function(region) {
    region.Status = this.EnRoute;
    this.UpdateRegions(region);
  }

  this.SetStatusPreparing = function(region) {
    region.Status = this.Preparing;
    this.UpdateRegions(region);
  }

  this.SetStatusScanned = function(region) {
    region.Status = this.Scanned;
    this.UpdateRegions(region);
  }

  this.SetStatusUnScanned = function(region) {
    region.Status = this.UnScanned;
    this.UpdateRegions(region);
  }

  this.GetUniqueRegionsList = function(lst) {
    try {
      // sort by region
      lst.sort(this.SortRegionsAlpha); // var IsOnScoutList = function(fleetId) {
      //   for (var i = 0; i < scoutList.length, i++) {
      //     if (scoutList[i].fleetId == fleetId) return true;
      //   }
      //   return false;
      // };
      var lastOne = null;
      var nlst = [];
      for (var i = 0; i < lst.length; i++) {
        if (i == 0) {
          nlst.push(lst[i]);
          lastOne = lst[i];
        } else {
          var ar = safeMatch(lastOne, /([A-Z]\d\d:\d\d)/, [1]);
          var br = safeMatch(lst[i], /([A-Z]\d\d:\d\d)/, [1]);
          if (ar == br) continue;
          nlst.push(lst[i]);
          lastOne = lst[i];
        }
      }
      return nlst;
    } catch (e) {
      lg.debug(e, 'Error in GetUniqueRegionsList:', {
        stack: true
      });
    }
  }

  // see if all regions have been scanned
  this.ScoutRegionsAllScanned = function() {
    try {
      if(!aScout.ActiveScout) {
        sru.log('sru.ScoutRegionsAllScanned:' + aScout.ActiveScout + 'is null');
        return true;
      }
      for (var i = 0; i < aScout.ActiveScout.ScoutRegions.length; i++) {
        var r = aScout.ActiveScout.ScoutRegions[i];
        // return any not scanned yet
        if (r.Status != r.Scanned) return false;
      }
      return true;
    } catch (e) {
      lg.debug(e, 'Error in ScoutRegionsAllScanned:', {
        stack: true
      });
    }
  }

  // update the region list with this chnaged region
  this.UpdateRegions = function(region) {
    try {
      for (var i = 0; i < aScout.ActiveScout.ScoutRegions.length; i++) {
        if (aScout.ActiveScout.ScoutRegions[i].region == region.region) {
          aScout.ActiveScout.ScoutRegions[i] = region;
          aScout.SaveActiveScout();
          sru.log('Regions updated with:' + region.region + ', status:' + region.Status);
          // caller can know we found it
          return region;
        }
      }
      return null;
    } catch (e) {
      lg.debug(e, 'Error in UpdateRegions:', {
        stack: true
      });
    }
  }

  // get region by location from the list
  this.GetRegionObj = function(rloc) {
    try {
      var regLoc = rloc.match(/([A-Z]\d\d:\d\d)/);
      if (regLoc == null || regLoc.length == 0) return null;
      regLoc = regLoc[1];
      for (var i = 0; i < aScout.ActiveScout.ScoutRegions.length; i++) {
        var r = aScout.ActiveScout.ScoutRegions[i];
        if (regLoc == r.region) return r;
      }
      return null;
    } catch (e) {
      lg.debug(e, 'Error in GetRegionObj:', {
        stack: true
      });
    }
  }

  this.SortRegionsAlpha = function(a, b) {
    var ar = safeMatch(a, /([A-Z]\d\d:\d\d)/, [1]);
    var br = safeMatch(b, /([A-Z]\d\d:\d\d)/, [1]);
    return ((ar < br) ? -1 : ((ar > br) ? 1 : 0));
  }

  // used by GalaxyScout to sync regions with dsis
  this.UpdateRegionList = function(regList, dregion) {
    try {
      var idx = -1;
      for (var i = 0; i < regList.length; i++) {
        if (regList[i].region == dregion.region) {
          // identify dsis region
          if (typeof dregion.region.UnScanned == 'undefined') regList[i].location = dregion.location;
          else regList[i].location = dregion;
          return;
        }
      }
      this.log('UpdateRegionList:Failed to find region:' + region.region);
    } catch (e) {
      lg.debug(e, 'Error in UpdateRegionList:', {
        stack: true
      });
    }
  }

  this.UpdateRegionLocationsFromList = function(rlist) {
    for (var i = 0; i < rlist.length; i++) {
      var r = sru.GetRegionObj(rlist[i].region);
      r.jg = rlist[i].jg;
      r.location = rlist[i].location;
      sru.UpdateRegions(r);
    }
  }

}
