// handles all fleet moves etc

function FleetOperations() {
  this.log = function(message) {
    lg.log('FleetOperations:' + message);
  }

  /*
   * Disperse fleets using an expanding ring algorythm
   * galaxy - galaxy to scout
   * fleets - list of fleets containing scouts in this galaxy
   * maxScouts - maximum number of scouts to use
   * maxPerRegion - maximum number of scouts to send to a region
   * Process:
   * 1. Get a ring of regions
   * 2. Find the first region in the ring with < maxPerRegion scouts enroute
   * 3. Move one scout to the region
   * 4. Add the new ScoutFleet to the region scoutsEnroute list
   * 5. Repeat from #2 until scoutsSent == maxScouts
   * 6. Call the callback with status of dispersal
   */
  this.DisperseUsingRings = function(callback) {
    try {
      mama = this;
      aScout.Dispersing = true;
      mama.callback = callback;
      var as = aScout.ActiveScout;

      this.IterateScouts(as.Galaxy, as.GmServer, function(status) {
        ctF.DisplayStatus('Fleet Dispersed:' + status);
        aScout.Dispersing = false;
        aScout.log('DisperseUsingRings:Back from IterateScouts with:' + status);
        var ret = 'DISPERSED';
        if (status.toLowerCase().includes('error')) ret = status;
        econs.CallBack(mama.callback, ret);
        return;
      });
    } catch (e) {
      lg.debug(e, 'Error in DisperseUsingRings:', {
        stack: true
      });
    }

  }

  this.GetDestination = function(scout) {
    try {
      var layer = 1;
      var nextRegion = null;
      var galaxy = safeMatch(scout.location, /([A-Z]\d\d)/, [1]);
      while (layer < 10 && nextRegion == null) {
        var ring = this.GetRing(galaxy, scout.location, aScout.ActiveScout.ScoutRegions, layer);
        nextRegion = this.GetNextUnscanned(ring);
        if (nextRegion == null) layer++;
      }
      if (nextRegion == null) {
        this.log('No more regions to scan, sending this scout:' + scout.fleetId + ', home:' +
          aScout.ActiveScout.SourceFleets[0].location);
        // send it
        scout.location = safeMatch(scout.location, /([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
        nextRegion = sru.GetRegionObj(aScout.ActiveScout.SourceFleets[0].location);
        nextRegion.location = aScout.ActiveScout.SourceFleets[0].location;
        return nextRegion;
      }
      // send scout here
      return nextRegion;
    } catch (e) {
      lg.log('Error in GetDestination:' + e.message);
    }
  }
  // find closest unscanned region to this scout
  this.GetClosestDestination = function(scout) {
    try {
      if(aScout.ActiveScout.ScoutRegions.length == 0) {
        this.log('No ScoutRegions in fo.GetClosestDestination');
        return null;
      }
      if(!scout) {
        this.log('scout is NULL in fo.GetClosestDestination');
        return null;
      }
      var cr = {
        closest: 9999999.0,
        region: null
      }

      for(var i=0;i<aScout.ActiveScout.ScoutRegions.length;i++) {
        var r = aScout.ActiveScout.ScoutRegions[i];
        if(r.location == 'unset' || r.Status != sru.UnScanned) continue;
        var dist = gHints.CalcDistance(scout.location, r.location);
        if(dist < cr.closest) {
          cr.closest = dist;
          cr.region = r;
        }
      }
      this.log('GetClosestDestination found ' + cr.region + ', at dist:' + cr.closest);
      // if still null, send home
      var sentHome = false;
      if (cr.region == null) {
        sentHome = true;
        this.log('GetClosestDestination:No more regions to scan, sending this scout:' + scout.fleetId + ', home:' +
          aScout.ActiveScout.SourceFleets[0].location);
        // send it
        scout.location = safeMatch(scout.location, /([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
        cr.region = sru.GetRegionObj(aScout.ActiveScout.SourceFleets[0].location);
        cr.region.location = aScout.ActiveScout.SourceFleets[0].location;
      }

      // check Distance
      var dist = gHints.CalcDistance(cr.region.location, scout.location);
      // adjust max dist for scouts < 10
      var maxDist = (aScout.ActiveScout.ScoutFleets.length < 10)?60:40;
      if(dist > maxDist && sentHome === false && aScout.Dispersing === false) {
        // lets sit a bit
        this.log('Distance would be too far:' + dist);
        //NEED TO CHECK OTHER LANDED SCOUTS NOW
        return null;
      }

      return cr.region;

    } catch(e) {
      lg.debug(e, 'Error in GetClosestDestination:', {
        stack: true
      });
      return null;
    }
  }

  this.GetScoutDestination = function(scout) {
    try {
      var getLowestItCanBe = function(sv, layer) {
        if(sv < 0) return 0;
        return (sv-layer<0)?0:sv;
      }
      var getMaxItCanBe = function(sv, layer) {
        if(sv > 9) return 9;
        return (sv+layer>9)?9:sv;
      }

      var rangeCheckUl = function(layer, scol, srow, reg) {
        if(reg < 0) reg += 10;
        var regStr = (reg<10)?'0'+reg:reg+'';
        var rcol = parseInt(regStr.substring(1));
        var rrow = parseInt(regStr.substring(0, 1));

        if(scol - layer < 0) { // left edge
          rrow = srow - layer;
          rcol = 0;
        }

        // calc upper left
        regStr = '' + rrow + rcol;
        var ul = parseInt(regStr);

        return ul;
      }

      var maxLayer = 2;
      var nextRegion = null;
      var galaxy = safeMatch(scout.location, /([A-Z]\d\d)/, [1]);
      var sr = parseInt(safeMatch(scout.location, /[A-Z]\d\d:(\d\d)/, [1]));
      //sr = 95;

      srStr = '' + sr;
      // get start row and column for bounds checking
      var srow = parseInt(srStr.substring(0, 1)); // 2
      var scol = parseInt(srStr.substring(1)); // 0

      // iterate layers, starting at 1
      for (var l = 1; l < maxLayer; l++) {
        var posRegions = [];
        var ul = sr - l - (10 * l);
        // check column bounds
        ul = rangeCheckUl(l,scol, srow, ul);

        // get length and height of the layer
        var len = (2 * l) + 1;
        // iterate rows
        for (r = 0; r < len; r++) {
          // iterate that row
          var rowLoc = ul + (r * 10);
          for (c = 0; c < len; c++) {

            var reg = rowLoc + c;
            if(reg > 99) continue;

            // now check validity...
            reg = (reg<10)?'0' + reg:reg;
            var regionObj = this.UseIfGoodRegion(galaxy + ':' + reg);
            if (regionObj != null) {
              posRegions.push(regionObj);
            }
          }
        }
        // pick best jg
        var jspeed = 0;
        nextRegion = null;
        for (var i = 0; i < posRegions.length; i++) {
          if (posRegions[i].jg > jspeed) {
            jspeed = posRegions[i].jg;
            nextRegion = posRegions[i];
            aScout.log('GetScoutDestination:found a gate:' + nextRegion.location);
          }
        }
        if (nextRegion != null) {
          aScout.log('GetScoutDestination:Returning a gate:' + nextRegion.location);
          break;
        }
        if(posRegions.length > 0) {
          nextRegion = posRegions[0];
          break;
        }
      }

      if (nextRegion == null) {
        // hail mary
        nextRegion = this.JustGetAnUnscannedRegion();
        aScout.log('GetScoutDestination:Trying a last gasp, found:' + (nextRegion== null)?'nada':nextRegion.region);
      } else {
        nextRegion.Status = sru.Preparing;
        sru.UpdateRegions(nextRegion);
      }

      if (nextRegion == null) {
        this.log('GetScoutDestination:No more regions to scan, sending this scout:' + scout.fleetId + ', home:' +
          aScout.ActiveScout.SourceFleets[0].location);
        // send it
        scout.location = safeMatch(scout.location, /([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
        nextRegion = sru.GetRegionObj(aScout.ActiveScout.SourceFleets[0].location);
        nextRegion.location = aScout.ActiveScout.SourceFleets[0].location;
      }
      // send scout here
      return nextRegion;
    } catch(e) {
      lg.debug(e, 'Error in GetScoutDestination:', {
        stack: true
      });
      return null;
    }

  }

  this.IterateScouts = function(galaxy, gs, callback) {
    try {
      var mama = this;
      aScout.doneSending = callback;
      if (aScout.ActiveScout.ScoutFleets.length >= aScout.ActiveScout.MaxScouts) {
        aScout.log('IterateScouts: Already using MaxScouts');
        econs.CallBack(aScout.doneSending, 'Done sending scouts');
        return;
      }
      mama.galaxy = galaxy;
      mama.gs = gs;
      this.log('Available Scouts:' + aScout.availScouts +
        ', Max:' + aScout.ActiveScout.MaxScouts +
        ', Sent:' + aScout.ActiveScout.ScoutFleets.length);
      var fl = aScout.ActiveScout.SourceFleets[0]; // this should be just one fleet probably

      var nextRegion = mama.GetClosestDestination(fl);
      // if nextReggion is still null, all have been scanned or have fleet enroute
      if (nextRegion == null) {
        mama.log('All regions scanned or have fleet enroute');
        ctF.DisplayStatus('All regions scanned or have fleet enroute');
        econs.CallBack(aScout.doneSending, 'No more regions to send to');
        return;
      }
      fl.destination = nextRegion.location;
      mama.MoveFleet(fl, function(status) {
        if(status == 'ERROR_NO_SCOUTS_IN_FLEET') {
          // ran out of scouts
          aScout.ActiveScout.MaxScouts = aScout.ActiveScout.ScoutFleets.length;
          aScout.SaveActiveScout();
          ct.PublicParsePage();
          econs.CallBack(aScout.doneSending, status);
          return;
        }
        if (status == 'ERROR_NO_MOVE_FORM') {
          // probably a bad fleetid - most likely a non-existent sourcefleet
          aScout.ActiveScout.MaxScouts = aScout.ActiveScout.ScoutFleets.length;
          aScout.SaveActiveScout();
          ct.PublicParsePage();
          econs.CallBack(aScout.doneSending, status);
          return;
        }
        mama.log('Fleet Sent');

        // update region so no more get sent here
        var reg = sru.GetRegionObj(fl.destination);
        reg.Status = sru.EnRoute;
        sru.UpdateRegions(reg);

        mama.GetLastFleetSent(galaxy, fl.destination, function(scoutFleet) {
          mama.log('Fleet Row returned');
          // set orig so we know where to send it home

          aScout.ActiveScout.ScoutFleets.push(scoutFleet);
          aScout.UpdateScoutFleets(scoutFleet);
          mama.IterateScouts(mama.galaxy, mama.gs, aScout.doneSending);
        });
      });
    } catch (e) {
      lg.debug(e, 'Error in IterateScouts:', {
        stack: true
      });
    }
  }

  this.GetLastFleetSent = function(gs_galaxy, sentDest, callback) {
    try {
      var mama = this;
      var mcallback = callback;
      // get fleet.aspx, grab last row in fleet list, get fleetId
      // get details, verify scouts present.
      ctF.DoGetAE('fleet.aspx', function(page) {
        ctF.UpdatePage($(page));
        if (parse.BadDoc(page, 'GetLastFleetSent')) return;
        var body = $(page);
        var table = body.filter('#fleets-list').find('table');
        table.find('td:nth-child(6)').remove();
        var rows = [];
        table.find('tr:gt(0)').each(function() {
          var name = $(this).children('td:first').text();
          var destTxt = $(this).children('td:eq(2)').text();
          var tdest = '';
          var loc = '';
          if (destTxt == '') {
            locTxt = $(this).children('td:eq(1)').text();
            loc = safeMatch(locTxt, /([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
          } else {
            tdest = safeMatch(destTxt, /([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
            loc = tdest;
          }


          var scoutsize = Number($(this).children('td:eq(4)').text());
          var galaxy = safeMatch(loc, /([A-Z]\d\d):\d\d:\d\d:\d\d/, [1]);
          if ((gs_galaxy.indexOf(galaxy) != -1) & (scoutsize == 40 || scoutsize == 20)) {
            var tds = $(this).children('td');
            var td1 = tds.eq(0).find('a');
            var td2 = tds.eq(1).find('a');
            var td3 = tds.eq(2).find('a');
            var td4 = tds.eq(3);
            var td5 = tds.eq(4);
            var arrival = td4.attr('title');
            if (!(arrival > 0)) arrival = 0;
            rows.push({
              fleet_url: td1.attr('href'),
              fleet_name: td1.text(),
              start_url: td2.attr('href'),
              start_name: td2.text(),
              dest_url: td3.attr('href'),
              dest_name: td3.text(),
              arrival: arrival,
              size: td5.text()
            });
            if (tdest == sentDest) {
              // found it
              var fleetId = safeMatch(td1.attr('href'), /\d+/, [0]);
              var row = {
                fleet_url: td1.attr('href'),
                fleet_name: td1.text(),
                start_url: td2.attr('href'),
                start_name: td2.text(),
                dest_url: td3.attr('href'),
                dest_name: td3.text(),
                arrival: arrival,
                size: td5.text()
              }
              var sf = new ScoutFleet(fleetId, loc, tdest, row.size);
              sf.arrival = parseInt(row.arrival) + 10;

              aScout.log('Found fleet:' + fleetId);
              econs.CallBack(mcallback, sf);
            }
          } else {
            var region = safeMatch($(this).children('td:eq(1)').text(), /[A-Z]\d\d:\d\d/, [0]);
            var gal = safeMatch(region, /[A-Z]\d\d/, [0]);
          }

        });

      });
    } catch (e) {
      lg.debug(e, 'Error in GetLastFleetSent:', {
        stack: true
      });
    }
  }

  this.UseIfGoodRegion = function(regionLoc) {
    try {
      var rg = sru.GetRegionObj(regionLoc);
      if(rg == null) return null;
      if (rg.location != 'unset' && rg.Status == sru.UnScanned) return rg;
      return null;
    } catch(e) {
      lg.debug(e, 'Error in UseIfGoodRegion:', {
        stack: true
      });
    }
  }

  this.GetRing = function(galaxy, loc, regions, layer) {
    try {
      var m = loc.match(/[A-Z]\d\d:(\d\d)/);
      var sregion = m[1];

      var ring = [];
      // center horis and vert
      var ov = sregion.substring(0, 1);
      var oh = sregion.substring(1);
      // start
      var voff = parseInt(ov) - parseInt(layer);
      var hoff = parseInt(oh) - parseInt(layer);
      var sv = (parseInt(voff) < 0) ? 0 : voff;
      var sh = (parseInt(hoff) < 0) ? 0 : hoff;
      // end
      voff = parseInt(ov) + parseInt(layer);
      hoff = parseInt(oh) + parseInt(layer);
      var ev = (parseInt(voff) > 9) ? 9 : voff;
      var eh = (parseInt(hoff) > 9) ? 9 : hoff;
      // start and end regions
      var str = '' + sv + sh;
      var sreg = parseInt(str);

      var ser = '' + ev + eh;
      var ereg = parseInt(ser);

      for (i = sreg; i < ereg; i++) {
        var reg = (i < 10) ? '0' + i : i;
        reg = this.UseIfGoodRegion(galaxy + ':' + reg, regions);
        if (reg != null) ring.push(reg);
      }
      if (ring.length == 0) {
        // nothing unscanned nearby, see if any at all
        ring[0] = this.JustGetAnUnscannedRegion();
      }
      return ring;

    } catch (e) {
      lg.debug(e, 'Error in FleetOperations.GetRing:', {
        stack: true
      });
    }
  }

  this.JustGetAnUnscannedRegion = function() {
    try {
      for (i = 0; i < aScout.ActiveScout.ScoutRegions.length; i++) {
      var rg = aScout.ActiveScout.ScoutRegions[i];

      if (typeof rg.Status == 'undefined') rg.Status = sru.UnScanned;
      if (rg.location != 'unset' && rg.Status == sru.UnScanned) return rg;
    }
      return null;
    } catch(e) {
      lg.debug(e, 'Error in JustGetAnUnscannedRegion:', {
        stack: true
      });
    }
  }

  this.GetNextUnscanned = function(ring) {
    try {
      for (var key in ring) {
      if (ring[key] != null &&
        ring[key].Status == sru.UnScanned &&
        ring[key].location != 'unset') {

        this.log('GetNextUnscanned:Found:' + ring[key].location);
        return ring[key];
      }
    }
      return null;
    } catch(e) {
      lg.debug(e, 'Error in GetNextUnscanned:', {
        stack: true
      });
    }
  }

  this.MoveFleet = function(fleet, callback) {
    try {
      coords = fleet.destination;
      ctF.DisplayStatus('moving fleet ' + fleet.fleetId + ' to ' + coords);

      var fleetMovePage = function(url, callback2) {
        ctF.DisplayStatus('Opening move page...');
        ctF.DoGetAE(url, function(page) {
          var form = $(page).find('form[method=post]');
          if (form.length == 0) {
            ctF.DisplayStatus('No move form, not supposed to happen');
            aScout.log('No move form, not supposed to happen');
            econs.CallBack(callback2, 'ERROR_NO_MOVE_FORM');
            return;
          }
          // set up to send one scout
          var pg = $(page);
          var mtab = pg.filter('#fleet_move');
          var avel = mtab.find('td[id="availScout Ship"]');
          var numScouts = Number(avel.text());
          if (numScouts > 0) {
            var sn = form.find('input[id^="quantScout"]');
            var d = form.find('#destination');
            d.val(fleet.destination);
            sn.val(1);
          } else {
            // fail!  no scouts
            ctF.DisplayStatus('No Scouts in Fleet!');
            aScout.log('MoveFleet:No Scouts in Fleet!');
            econs.CallBack(callback2, 'ERROR_NO_SCOUTS_IN_FLEET');
            return;
          }
          var post_url = form.attr('action');
          var data = {};
          form.find('input').each(function() {
            var name = $(this).attr('name');
            if (name != '') data[name] = $(this).val();
          });
          ctF.DisplayStatus('Sending fleet ' + fleet.fleetId + ' to ' + coords);
          ctF.DoGetAE(post_url, function(page) {
            var m = $(page);
            var t = m.filter(':contains(Fleet movement started)');
            var noMore = m.filter(':contains(You have reached the maximum number of campaign fleets)');
            if (noMore.length) {
              ctF.DisplayStatus('Sending unsuccessful - out of fleets');
              aScout.log('No more fleets');
              econs.CallBack(callback2, 'ERROR_NO_FLEET_SLOTS');
              return;
            }

            if (t.length) {
              ctF.DisplayStatus('Fleet sent');
              econs.CallBack(callback2, 'Fleet Move:fleet sent');
            } else {
              error_page = page;
              ctF.DisplayStatus('Sending unsuccessful');
              aScout.log(page);
              econs.CallBack(callback2, 'ERROR_UNABLE_TO_SEND');
            }

          }, undefined, data);

        });
      };
      // build url
      var url = 'fleet.aspx?fleet=' + fleet.fleetId + '&view=move';
      fleetMovePage(url, callback);
    } catch (e) {
      lg.debug(e, 'Error in MoveFleet', {
        stack: true
      });
    }
  }
}
