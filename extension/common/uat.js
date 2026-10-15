var UAT = function() {

  // marks all but numRegions as scanned
  this.MarkScanned = function(numRegions, startRegion, maxScouts) {
    try {
      for (var i = 0; i < aScout.ActiveScout.ScoutRegions.length; i++) {
        aScout.ActiveScout.ScoutRegions[i].Status = sru.Scanned;
        if (i < startRegion) continue;
        if (i >= parseInt(startRegion) + parseInt(numRegions)) continue;
        aScout.ActiveScout.ScoutRegions[i].Status = sru.UnScanned;
      }
      aScout.ActiveScout.MaxScouts = maxScouts;
      aScout.SaveActiveScout();
    } catch (e) {
      lg.debug(e, 'Error in UAT.MarkScanned:', {
        stack: true
      });
    }
  }
}
