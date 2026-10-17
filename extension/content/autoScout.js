/* this class will handle all auto scouting type Functions
 */


var AutoScouter = function() {
  var systems = [];
  var astros = [];
  var fleets = [];

  this.GuildSystems = [];

  // used to tell fleet ops we are dispersing
  this.Dispersing = false;

  // home lz for returning scouts.
  this.HomeLz = null;
  // flag for disbanding scouts when they finish
  this.DisbandScouts = false;

  this.StartTime = 0;
  this.EndTime = 0;

  this.ActiveScout = null;
  this.ScoutTimer = null;
  this.SecondsRemaining = 0;

  this.TimerStatus = function(seconds) {
    this.SecondsRemaining = seconds;
    if (seconds == 0) this.ScoutTimer = null;
  }
  this.landed = [];
  this.eyeRegions = [];
  this.detailFleets = [];
  // array to hold stray scouts until they can be added to the scout fleets array, based on prefs
  this.SingleScouts = [];
  this.MostScouts = 0;

  this.maxScouts = prefs.Scouting.MaxScouts;
  this.maxPerRegion = prefs.Scouting.MaxPerRegion;
  this.PickupStrays = prefs.Scouting.PickupStrays;
  this.HandleStrays = prefs.Scouting.HandleStrays;

  this.availScouts = 0;
  this.sentScouts = 0;
  this.doneSending = null;
  this.IsPaused = false;
  this.PauseCount = 0;
  // set to true to seed only , not grab every system
  this.seedOnly = false;

  this.DTimer = null;

  this.SetDisbandScouts = function(disband) {
    this.DisbandScouts = disband;
    if(this.ActiveScout) {
      this.ActiveScout.DisbandScouts = disband;
      this.SaveActiveScout();
    }
  }

  this.SetHomeLz = function(homeLz) {
    this.HomeLz = homeLz;
    if(this.ActiveScout && this.ActiveScout.SourceFleets.length > 0) {
      this.ActiveScout.SourceFleets[0].location = homeLz;
      this.ActiveScout.HomeLz = homeLz;
      this.SaveActiveScout();
    }
  }

  this.log = function(msg) {
    lg.log('AS:' + msg);
  }

  this.DisplayTimer = function(seed) {
    try {

      if (aScout.DTimer != null) aScout.DTimer.stop();

      $('#DTimer').text('');
      if (seed == 0) {
        return;
      }
      aScout.DTimer = new Timer(seed, function(secs) {
        //Update display
        var distance = new Date(parseInt(secs) * 1000).getTime();
        var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        if (hours < 10) hours = '0' + hours;
        var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        if (minutes < 10) minutes = '0' + minutes;
        var seconds = Math.floor((distance % (1000 * 60)) / 1000);
        if (seconds < 10) seconds = '0' + seconds;

        var dstr = hours + ':' + minutes + ':' + seconds;
        $('#DTimer').text('Next Landing:' + dstr);
      }, function() {
        aScout.log('DTimer went off for');
        $('#DTimer').text('');
        return;
      }).start();
    } catch (e) {
      lg.debug(e, 'Error in aScout.DisplayTimer:', {
        stack: true
      });
    }
  }

  this.PauseScout = function() {
    // toggle pause flag
    aScout.IsPaused = (aScout.IsPaused === true) ? false : true;

    aScout.log('Paused:' + aScout.IsPaused);
    if (aScout.IsPaused === false) {
      aScout.PauseCount = 0;
      aScout.SendScoutStatus('Resumed');
    }
  }

  this.GetAE = function(url, callback, callback2, postdata, errHandler) {
    try {
      if (aScout.IsPaused === true) {
        aScout.gArgs = {
          url: url,
          callback: callback,
          callback2: callback2,
          postdata: postdata,
          errHandler: errHandler
        };
        if (aScout.PauseCount == 0) aScout.SendScoutStatus('Paused by User');
        aScout.PauseCount++;
        window.setTimeout(function() {
          aScout.GetAE(aScout.gArgs.url,
            aScout.gArgs.callback,
            aScout.gArgs.callback2,
            aScout.gArgs.postdata,
            aScout.gArgs.errHandler);
        }, 2000);
      } else {
        ctF.DoGetAE(url, callback, callback2, postdata, errHandler);
      }
    } catch (e) {
      lg.debug(e, 'Error in GetAE:', {
        stack: true
      });
    }
  }

  this.SaveActiveScout = function() {
    try {
      if (aScout.ActiveScout == null) return;
      // update ServerData which will trigger a save
      ServerData.ActiveScout = aScout.ActiveScout;
      comms.UpdateServerData();
      ctF.SaveActiveScoutToCentral();

    } catch (e) {
      lg.debug(e, 'Error in SaveActiveScout:', {
        stack: true
      });
    }
  }

  this.DeleteActiveScout = function() {
    try {
      // null activescout here
      aScout.ActiveScout = null;
      ServerData.ActiveScout = null;
      comms.UpdateServerData();

      ctF.DeleteActiveScout(ServerData.GmServer, function(resp) {
        aScout.log('ActiveScout deleted');
      });
      ct.PublicParsePage();
    } catch (e) {
      lg.debug(e, 'Error in DeleteActiveScout:', {
        stack: true
      });
    }
  }

  this.RemoveScout = function(scout, decreaseMax = true) {
    try {
      // find this scout and remove from array
      for (var i = 0; i < aScout.ActiveScout.ScoutFleets.length; i++) {
        if (scout.fleetId == aScout.ActiveScout.ScoutFleets[i].fleetId) {
          aScout.ActiveScout.ScoutFleets.splice(i, 1);
          break;
        }
      }
      if (decreaseMax === true) aScout.ActiveScout.MaxScouts = aScout.ActiveScout.MaxScouts - 1;
      if (aScout.ActiveScout.ScoutFleets.length == 0) {
        aScout.DeleteActiveScout();
        aScout.EndTime = Date.now();

        // save it so it can be checked later
        var sp = new StoragePacket({
          ScoutStart: aScout.StartTime,
          ScoutEnd: aScout.EndTime
        }, 'ScoutTime', ctG.SendingPlayerId);
        ctF.SaveStorage(sp);
        return;
      }
      aScout.SaveActiveScout();
    } catch (e) {
      lg.debug(e, 'Error in RemoveScout:', {
        stack: true
      });
    }
  }

  this.CheckForDeadScouts = function(callback) {
    try {
      // set up array to verify them
      aScout.ships = [];
      $.each(aScout.ActiveScout.ScoutFleets, function(index, ship) {
        aScout.ships.push({
          found: false,
          scout: ship
        });
      });
      // get fleet list and verify none are missing
      aScout.GetAE('fleet.aspx', function(page) {
        if (parse.BadDoc(page, 'CheckForDeadScouts')) return;
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
          var tds = $(this).children('td');
          var td1 = tds.eq(0).find('a');
          var fleetId = safeMatch(td1.attr('href'), /\d+/, [0]);
          for (var s = 0; s < aScout.ActiveScout.ScoutFleets.length; s++) {
            if (aScout.ActiveScout.ScoutFleets[s].fleetId == fleetId) {
              for (var j = 0; j < aScout.ships.length; j++) {
                // mark it found
                if (aScout.ships[j].scout.fleetId == fleetId) aScout.ships[j].found = true;
              }
            }
          }
        });
        for (var i = 0; i < aScout.ships.length; i++) {
          if (aScout.ships[i].found === false) {
            // don't decrease max scouts
            // RemoveScout will decreasae the scouts array which should do the trick
            aScout.RemoveScout(aScout.ships[i].scout, false);
          }
        }
        econs.CallBack(callback, 'Checked for dead scouts');
      });
    } catch (e) {
      lg.debug(e, 'Error in CheckForDeadScouts:', {
        stack: true
      });
    }
  }

  this.SendScoutStatus = function(status) {
    try {
      if (!aScout.ActiveScout) {
        aScout.log('aScout.SendScoutStatus:ActiveScout is null');
        return;
      }
      aScout.ActiveScout.status = status;
      aScout.SaveActiveScout();
      ctF.SendMessage(new Message('sidebar', 'UpdateScoutStatus', {
        status: status,
        runStatus: aScout.ActiveScout.RunStatus,
        displayText: status,
        tabData: ctG.TabData,
        from: ctG.TabData.id
      }));
      ctF.DisplayStatus(status, 'Scout Status Updated');
    } catch (e) {
      lg.debug(e, 'Error in SendScoutStatus:', {
        stack: true
      });
    }
  }

  this.SendTimerUpdate = function(secs) {
    aScout.DisplayTimer(secs);
    ctF.SendMessage(new Message('sidebar', 'UpdateScoutTimer', {
      seed: secs,
      displayText: 'Updating Timer',
      tabData: ctG.TabData,
      from: ctG.TabData.id
    }));
  }

  this.InitScoutRegions = function(galaxy) {
    try {
      aScout.ActiveScout.ScoutRegions = [];
      for (var i = 0; i < 100; i++) {
        var p = (i < 10) ? '0' + i : i;
        var r = new Region(galaxy + ':' + p);
        aScout.ActiveScout.ScoutRegions.push(r);
      }
      aScout.log('New ScoutRegions List started');
    } catch (e) {
      lg.debug(e, 'Error in InitScoutRegions:', {
        stack: true
      });
    }
  }

  this.ScanOccRegions = function() {
    var occRegions = [];

    ctF.DoGetAE('empire.aspx?view=economy', function(msg) {
      regions = [];
      occRows = $(msg).filter('#empire_economy_occupied').find('td.content table.listing tr:gt(0)');
      occRows.each(function() {
        var astro = $(this).find('td').eq(1).text();
        var region = astro.substr(0, 6);
        var url = "map.aspx?loc=" + astro;
        for (var i in regions)
          if (region == regions[i].region) return;
        var r = new Region(region);
        r.location = astro;
        regions.push(r);
      });
      if (regions.length == 0) {
        aScout.log('No Occs!');
        ctF.DisplayStatus('No Occs!');
        return;
      }
      aScout.IterateRegions(regions, function(data) {
        aScout.log('OccRegions Scanned');
        ctF.DisplayStatus('Occ Regions Scanned');

      });
    });

  }

  this.ScanList = function(txt, callback) {
    var locs = txt.match(/([A-Z]\d\d:\d\d:\d\d)/g);
    aScout.ScanSystems(locs, callback);
  }

  this.ScanSystems = function(systemList, callback) {
    $.each(systemList, function(index, loc) {
      aScout.GuildSystems.push({
        coords: loc
      });
    });

    aScout.IterateSystems(function(data) {
      ctF.DisplayStatus('Systems Scan Done');
      econs.CallBack(callback, 'Systems Scan Done');
    }, aScout.GuildSystems);
  }

  this.ScanGuildSystems = function(cluster, galaxy, gmServer) {
    try {
      var req = {
        request: {
          mode: 'getGuildSystems',
          sendingPlayerId: ctG.SendingPlayerId,
          cluster: cluster,
          gal: galaxy
        }
      }
      systems = [];
      aScout.GuildSystems = [];
      dsisReq.MakeRequest(req, gmServer.DsisServers[0], function(resp) {

        $.each(resp.data.systems, function(index, loc) {
          aScout.GuildSystems.push({
            coords: loc
          });
        });

        aScout.IterateSystems(function(data) {
          ctF.DisplayStatus('Guild Scan Done');
        }, aScout.GuildSystems);
      });
    } catch (e) {
      lg.debug(e, 'Error in ScanGuildSystems:', {
        stack: true
      });
    }
  }

  // Iterate over every known player on the current server and scan their
  // profile pages, so the profiles table is populated for players we've only
  // sighted as guildmates / base owners. Reuses the connection pool (DoGetAE),
  // so it never floods the game server. Callback fires once the whole list is
  // done (or the pool stalls on a rate-limit abort).
  var profileScanQueue = [];
  this.ScanAllProfiles = function(callback) {
    try {
      profileScanQueue = [];
      if (!GmServer || !GmServer.DsisServers || GmServer.DsisServers.length == 0) {
        ctF.DisplayStatus('No DSIS Server for profile scan');
        econs.CallBack(callback, 'No DSIS Server');
        return;
      }
      ctF.DisplayStatus('Querying players to scan...');
      var req = {
        request: {
          mode: 'getPlayers',
          sendingPlayerId: ctG.SendingPlayerId
        }
      };
      // scope to the current server so we don't scan every server's roster;
      // only when a real servid is known (not the -1 sentinel)
      if (typeof GmServer.servid != 'undefined' && GmServer.servid > 0) req.request.servid = GmServer.servid;
      dsisReq.MakeRequest(req, GmServer.DsisServers[0], function(resp) {
        try {
          var players = (resp && resp.data && resp.data.players) ? resp.data.players : [];
          aScout.log('ScanAllProfiles: ' + players.length + ' players to scan');
          ctF.DisplayStatus('Scanning ' + players.length + ' profiles');
          profileScanQueue = players.slice();
          aScout.IterateProfiles(callback);
        } catch (e) {
          lg.debug(e, 'Error in ScanAllProfiles.getPlayers:', {
            stack: true
          });
          econs.CallBack(callback, 'getPlayers failed');
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in ScanAllProfiles:', {
        stack: true
      });
      econs.CallBack(callback, 'ScanAllProfiles failed');
    }
  }

  // Scan the current guild page's members' profiles. Reads the member player
  // ids from the live guild page (same rows ParseGuildPage uses), then fetches
  // and parses each member's profile.aspx page via the shared profile-scan
  // queue. Reuses the connection pool, so it never floods the game server.
  this.ScanGuildProfiles = function(callback) {
    try {
      var rows = $('.layout.listing.sorttable tr:gt(0)');
      var ids = [];
      for (var i = 0; i < rows.length; i++) {
        var elements = $('td', rows.eq(i));
        var playerId = elements.eq(0).text();
        if (playerId) ids.push({
          playerId: playerId,
          nick: elements.eq(2).text()
        });
      }
      aScout.log('ScanGuildProfiles: ' + ids.length + ' members to scan');
      ctF.DisplayStatus('Scanning ' + ids.length + ' member profiles');
      profileScanQueue = ids;
      aScout.IterateProfiles(callback);
    } catch (e) {
      lg.debug(e, 'Error in ScanGuildProfiles:', {
        stack: true
      });
      econs.CallBack(callback, 'ScanGuildProfiles failed');
    }
  }

  this.IterateProfiles = function(callback) {
    try {
      if (aScout.IsPaused === true) {
        aScout.profileScanResume = callback;
        return;
      }
      var entry = profileScanQueue.shift();
      if (typeof entry == 'undefined') {
        aScout.log('Done with profiles in IterateProfiles');
        ctF.DisplayStatus('Profile Scan Done');
        econs.CallBack(callback, 'done');
        return;
      }
      // entry is either a bare playerId (ScanAllProfiles) or {playerId, nick}
      var pid = (typeof entry == 'object') ? entry.playerId : entry;
      var label = (typeof entry == 'object' && entry.nick) ? entry.nick + ' (' + pid + ')' : pid;
      ctF.DisplayStatus('Scanning: ' + label);
      aScout.Profile(pid, function() {
        if (profileScanQueue.length > 0) aScout.IterateProfiles(callback);
        else {
          aScout.log('Done with profiles in IterateProfiles');
          ctF.DisplayStatus('Profile Scan Done');
          econs.CallBack(callback, 'done');
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in IterateProfiles:', {
        stack: true
      });
    }
  }

  // scan one player's profile.aspx page; parse + upload the fetched HTML
  this.Profile = function(playerId, callback) {
    try {
      aScout.log('Scanning profile for player: ' + playerId);
      aScout.GetAE('profile.aspx?player=' + playerId, function(page) {
        parse.ParseProfile(null, page, playerId);
        econs.CallBack(callback, 'done');
      }, null, null, function() {
        // error handler: keep the loop moving, don't stall on one bad page
        econs.CallBack(callback, 'error');
      });
    } catch (e) {
      lg.debug(e, 'Error in Profile:', {
        stack: true
      });
      econs.CallBack(callback, 'error');
    }
  }

  // get a list of all regions with fleet
  // inventory them
  // get a list of stray scouts
  this.GetRegionsWithFleet = function(galaxy, callback) {
    try {
      this.eyeRegions = [];
      aScout.GetAE('fleet.aspx', parse.GetRegionsWithFleet, function(data) {
        var r = data.regions;
        for (var i = 0; i < r.length; i++) {
          var m = r[i].match(/([A-Z]\d\d)/);
          if (m[1] == galaxy) aScout.eyeRegions.push(r[i]);
        }
        // now limit fleets to those in this galaxy
        var flist = [];
        for (var i = 0; i < data.fleetList.length; i++) {
          var loc = data.fleetList[i].location;
          var m = loc.match(/([A-Z]\d\d)/);
          if (m[1] == galaxy) flist.push(data.fleetList[i]);
        }
        aScout.GetFleetInventory(flist, function(dfleets) {
          var mostSc = null;
          var mamt = 0;
          aScout.SingleScouts = [];
          $.each(dfleets, function(index, sourceFleet) {
            $.each(sourceFleet.details, function(index, ship) {
              var g = safeMatch(sourceFleet.location, /([A-Z]\d\d)/, [1]);
              if (ship.unit == 'Scout Ship' && parseInt(ship.amt) > parseInt(mamt) && g == galaxy) {
                mamt = ship.amt;
                mostSc = sourceFleet;
              }
              if (sourceFleet.details.length == 1 && ship.unit == 'Scout Ship' && parseInt(ship.amt) == 1) {
                aScout.SingleScouts.push(sourceFleet);
                aScout.log('Found a stray, adding to singles array:' + sourceFleet.fleetname);
                ctF.DisplayStatus('Found a stray, adding to singles array:' + sourceFleet.fleetname);
              }
            });
          });
          var f = [];
          aScout.MostScouts = parseInt(mamt); // how many scouts available in main fleet
          if (mostSc != null) f.push(mostSc);
          aScout.log('Got fleet inventory');
          econs.CallBack(callback, f);
        })
      });
    } catch (e) {
      lg.debug(e, 'Error in GetRegionsWithFleet:', {
        stack: true
      });
    }
  }
  // Get fleet detail for all fleet in a galaxy
  this.GetFleetInventory = function(fleetList, callback) {
    try {
      fleets = [];
      for (var i = 0; i < fleetList.length; i++) {
        fleets.push(fleetList[i].fleetId);
      }

      if (fleets.length > 0) {
        this.IterateFleets(fleetList, function() {
          // should have detail in detailFleets
          econs.CallBack(callback, aScout.detailFleets);
        });
      } else {
        ctF.DisplayStatus('No fleet to scout with');
        aScout.log('No fleets to scout with')
        return; // should not get here
      }
    } catch (e) {
      lg.debug(e, 'Error in GetRegionsWithFleet:', {
        stack: true
      });
    }
  }
  // galaxy AutoScouter
  this.GalaxyScout = function(fleetGalaxy, galaxy, gs, callback) {
    try {
      // check for dsis
      if (GmServer.DsisServers.length == 0) {
        aScout.log('No DSIS Active, cannot auto scout');
        ctF.DisplayStatus('No DSIS Active, cannot auto scout');
        return;
      }
      aScout.gs = gs;
      aScout.galaxy = galaxy;
      aScout.FleetGalaxy = fleetGalaxy;
      aScout.callback = callback;
      // start the clock
      aScout.StartTime = Date.now();
      // see if was previously finished  NOTE: if read from the db it will be null, if local DELETED
      if (aScout.ActiveScout == 'DELETE') aScout.ActiveScout = null;

      if (aScout.ActiveScout == null) {
        aScout.ActiveScout = new ActiveScout(galaxy, gs, prefs.Scouting.MaxScouts);
        aScout.log('New ActiveScout STARTED');
        aScout.ActiveScout.RunStatus = ActiveScout.IsRunning;
        aScout.SendScoutStatus('STARTING Galaxy scout of ' + galaxy + ', gathering information');
      }
      /*
       * 1. Get regions with fleet landed
       * 2. Get inventory of those fleets.  Basically need to know how many scouts and corvettes there are.
       * 3. Start sending fleet out to nearest & oldest regions.
       *   a. Make sure to scan the region it is landed in first if it is the only one left.
       */
      if (aScout.ActiveScout.ScoutRegions.length == 0) {
        aScout.InitScoutRegions(galaxy);


        aScout.GetRegionsWithFleet(fleetGalaxy, function(dfleets) {
          aScout.ActiveScout.SourceFleets = dfleets;
          if(dfleets.length > 0) aScout.ActiveScout.HomeLz = dfleets[0].location;

          // 1&2 satisfied
          var txt = 'Have fleet inventory:' + dfleets.length + ' fleets to scout with<br/>';
          aScout.log(txt);
          if (dfleets.length == 0) {
            aScout.log('No scouts to scout with');
            ctF.DisplayStatus('No scouts to scout with');
            aScout.ActiveScout = null;
            throw new Error('No Scouts');
          }
          for (var i = 0; i < dfleets.length; i++) {
            for (j = 0; j < dfleets[i].details.length; j++) {
              var f = dfleets[i].details[j];
              if (f.unit == 'Scout Ship') aScout.availScouts += Number(f.amt);
              txt += f.unit + ' - ' + f.amt + '<br/>';
            }
          }
          ctF.DisplayStatus('Finshed gathering fleet data from Game Server<br/>' + txt);
          // get regions from dsis
          aScout.GetRegionsFromDsis(aScout.galaxy, function(data) {
            var dsisRegions = data;
            // need to update regions with dsisRegions
            sru.UpdateRegionLocationsFromList(dsisRegions);
            // need to scan regions with eyes
            for (var i = 0; i < aScout.detailFleets.length; i++) {
              var f = aScout.detailFleets[i];
              // skip if flying
              if (f.destination != '') continue;
              var fgal = safeMatch(f.location, /([A-Z]\d\d)/, [1]);
              var freg = safeMatch(f.location, /([A-Z]\d\d:\d\d)/, [1]);
              // make sure it is in this galaxy
              if (fgal != galaxy) continue;
              var reg = sru.GetRegionObj(freg);
              reg.hasEyes = true;
              reg.Status = sru.CanScan;
              sru.UpdateRegions(aScout.ActiveScout.ScoutRegions, reg);
            }
            // update active scout
            aScout.SaveActiveScout();
            // var uat = new UAT();
            // uat.MarkScanned(1, 79, 1);
            // aScout.log('UAT ACTIVE:1, 79, 1');
            if (prefs.Scouting.PickupStrays == 1) {
              $.each(aScout.SingleScouts, function(index, scout) {
                // check to see if we are skipping busy scouts
                if (scout.fleetname.toLowerCase().includes('busy') && prefs.Scouting.HandleStrays == 'skip') return;
                if (aScout.ActiveScout.ScoutFleets.length >= aScout.ActiveScout.MaxScouts && prefs.Scouting.HandleStrays == 'honor') return;
                aScout.ActiveScout.ScoutFleets.push(scout);
                aScout.log('Choosing stray:' + scout.fleetname);
                ctF.DisplayStatus('Choosing stray:' + scout.fleetname);
              });
              aScout.SingleScouts = [];
            }

            // fake stop
            //return;
            aScout.DisperseTheScouts(function(status) {
              if (status != 'DISPERSED') {
                aScout.log('Error dispersing scouts');
                return;
              }

              aScout.ScanLanded(galaxy, aScout.gs, function(status) {
                // landed are and re-launched
                aScout.log('ScanLanded status:' + status);
                aScout.ScoutTillDone(galaxy, aScout.gs);
              });
            });
          });
        });
      } else {
        if (aScout.ActiveScout.ScoutFleets.length < aScout.maxScouts) {
          // disperse them
          aScout.DisperseTheScouts(function(status) {
            if (status != 'DISPERSED') {
              aScout.log('Error dispersing scouts');
              return;
            }
            aScout.ScanLanded(galaxy, function(status) {
              // landed are scanned and re-launched
              aScout.log('ScanLanded status:' + status);
            });
          });
        }
      }
    } catch (e) {
      lg.debug(e, 'Error in GalaxyScout:', {
        stack: true
      });
    }
  }

  /*
   * call ScanLanded, the loop or done based on whether there are
   * still unscanned regions
   */
  this.ScoutTillDone = function(galaxy, gs, callback) {
    try {
      if (sru.ScoutRegionsAllScanned() === false) {
        ct.PublicParsePage();
        ctF.DisplayStatus('All Regions NOT scanned, continuing');
        if (aScout.eyeRegions.length > 0) {
          aScout.log('ScoutTillDone: Scanning not finished yet, waiting...');
          //return;
        }

        // check for killed scouts
        aScout.CheckForDeadScouts(function(msg) {
          ctF.DisplayStatus('CheckForDeadScouts:' + msg);
          // see if max scouts has been bumped
          if (aScout.ActiveScout.MaxScouts > aScout.ActiveScout.ScoutFleets.length) {
            aScout.log('Max Scouts increased, dispersing more..');
            ctF.DisplayStatus('Max Scouts increased, dispersing more..');
            aScout.SendScoutStatus('Dispersing more scouts');

            aScout.DisperseTheScouts(function(status) {
              var txt = status;
              if (status == 'ERROR_NO_MOVE_FORM') {
                txt = 'Source Fleet probably not there, need new one..Max Scouts decremented';

              }
              aScout.SendScoutStatus(txt);
              aScout.ScoutTillDone(aScout.ActiveScout.Galaxy, aScout.ActiveScout.GmServer, callback);
            });
            return;
          }
          // still not all scanned, call scan landed
          aScout.SendScoutStatus('Checking for landed scouts');
          aScout.ScanLanded(galaxy, gs, function(status) {
            if (status == 'COMPLETE') {
              aScout.DeleteActiveScout();
              ct.PublicParsePage();
              aScout.SendScoutStatus('COMPLETE');
              // all scanned
              econs.CallBack(callback, "COMPLETE");
              aScout.EndTime = Date.now();

              // save it so it can be checked later
              var sp = new StoragePacket({
                ScoutStart: aScout.StartTime,
                ScoutEnd: aScout.EndTime
              }, 'ScoutTime', ctG.SendingPlayerId);
              ctF.SaveStorage(sp);
              return;
            }
            // scan landed done, relaunched if unscanned
            // get soonest arrival
            aScout.SendScoutStatus('Landed scouts scanned, waiting');
            var soon = aScout.GetSoonestArrival();
            if (soon == 0) soon = 300;
            if (aScout.ScoutTimer != null) {
              aScout.log('ScoutTillDone(after ScanLanded): Timer running already, waiting...');
              return;
            }

            aScout.ScoutTimer = new Timer(soon, function(secs) {
              aScout.TimerStatus(secs);
            }, function() {
              aScout.log('Timer went off, checking for landed scouts');
              aScout.SaveActiveScout();
              aScout.ScoutTillDone(galaxy, gs, callback);
              return;
            }).start();

            aScout.SendTimerUpdate(soon);
            aScout.log('Starting timer');
          });
        });
      } else {
        // all scanned
        aScout.DeleteActiveScout();
        econs.CallBack(callback, "COMPLETE");
      }
    } catch (e) {
      lg.debug(e, 'Error in ScoutTillDone:', {
        stack: true
      });
    }
  }

  this.GetSoonestArrival = function() {
    try {
      var soon = 9999999;
      $.each(aScout.ActiveScout.ScoutFleets, function(index, scout) {
        if (scout.arrival != 0 && scout.arrival < soon) soon = scout.arrival;
      });
      return (soon == 9999999) ? 0 : soon;
    } catch (e) {
      lg.debug(e, 'Error in GetSoonestArrival:', {
        stack: true
      });
    }
  }

  this.DisperseTheScouts = function(callback) {
    var cb = callback;

    // disperse them
    var fo = new FleetOperations(aScout.ActiveScout.SourceFleets, aScout.ActiveScout.ScoutRegions, aScout.gs);

    fo.DisperseUsingRings(function(status) {
      aScout.log('DisperseTheScouts:Back from DisperseUsingRings:' + status);
      // scouts dispersed

      // need to save state here
      aScout.SaveActiveScout();
      econs.CallBack(cb, status);

    });
  }

  this.ScanLanded = function(galaxy, gs, callback) {
    try {
      ct.PublicParsePage();
      if (aScout.ActiveScout == null || aScout.ActiveScout.ScoutFleets.length == 0) {
        // done
        ctF.DisplayStatus('Done, all scouts sent home');
        aScout.EndTime = Date.now();
        econs.CallBack(callback, 'COMPLETE');
        return;
      }
      ctF.DisplayStatus('Ready to start scanning landed scouts');
      aScout.SendScoutStatus('Checking for landed scouts');

      // get a list of all landed scouts
      aScout.GetLandedScouts(galaxy, aScout.ActiveScout.ScoutFleets, function(landed) {
        aScout.nextRegion = null;
        aScout.landedScouts = landed;
        aScout.SendScoutStatus('Found some landed scouts:' + landed.length);
        // populate eyeRegions and scan
        aScout.eyeRegions = [];

        // go through the landed scouts and see which regions need to be scanned
        for (var i = 0; i < landed.length; i++) {
          var sc = landed[i];
          var region = sru.GetRegionObj(sc.location);
          if (region.Status != sru.Scanned) aScout.eyeRegions.push(region);
        }
        aScout.landed = landed;

        var getScannedLanded = function() {
          for (var l = 0; l < aScout.landed.length; l++) {
            var reg = sru.GetRegionObj(aScout.landed[l].location);
            if (reg != null && reg.Status == sru.Scanned) return aScout.landed[l];
          }
          return null;
        }

        var doOneCanScan = function(callback) {
          try {
            var r = null;
            for (var i = 0; i < aScout.ActiveScout.ScoutRegions.length; i++) {
              if (aScout.ActiveScout.ScoutRegions[i].Status == sru.CanScan) {
                r = aScout.ActiveScout.ScoutRegions[i];
                break;
              }
            }
            if (r == null) {
              econs.CallBack(callback, 'NoMoreCanScan');
              return;
            }
            aScout.Region(r, function(regionObj) {
              regionObj.Status = sru.Scanned;
              sru.UpdateRegions(aScout.ActiveScout.ScoutRegions, regionObj);
              ct.PublicParsePage(); // update sidebar
              econs.CallBack(callback, 'Scanned 1 CanScan:' + regionObj.location);
              return;
            });
          } catch (e) {
            lg.debug(e, 'Error in doOneCanScan:', {
              stack: true
            });
          }
        }

        // Iterate over regions needing to be scanned, sending as we go
        var scanRegions = function(callback) {
          try {
            if (aScout.eyeRegions.length == 0) {
              aScout.log('No More Eye Regions');
              econs.CallBack(callback, 'No More Eye Regions');
              return;
            }
            var r = aScout.eyeRegions.shift();
            aScout.Region(r, function(regionObj) {
              aScout.log('scanRegions:Back from Region:');
              regionObj.Status = sru.Scanned;
              sru.UpdateRegions(aScout.ActiveScout.ScoutRegions, regionObj);
              ct.PublicParsePage(); // update sidebar
              // send this scout on
              var scout = getScoutInRegion(regionObj);
              if (scout == null) {
                // big problem
                aScout.eyeRegions = [];
                econs.CallBack(callback, 'ScanRegions Done -- eyeRegions ended early, scout was null');
                return;
              }
              var fo = new FleetOperations();
              aScout.nextRegion = fo.GetClosestDestination(scout);
              if (aScout.nextRegion == null) {
                // no where to send it
                aScout.log('NextRegion is null in ScanRegions');
                econs.CallBack(callback, 'ScanRegions Done');
                return;
              }

              scout.destination = aScout.nextRegion.location;

              fo.MoveFleet(scout, function(status) {
                aScout.log(status);
                if (status.includes('ERROR')) {
                  // if no fleet slots, decrement maxScouts
                  if (status == 'ERROR_NO_FLEET_SLOTS') {
                    //aScout.NoFly = true;
                  }
                  econs.CallBack(callback, status);
                  return;
                }
                aScout.nextRegion.Status = sru.EnRoute;
                sru.UpdateRegions(aScout.nextRegion);

                // if he is sent home, remove from array
                if (scout.destination == aScout.ActiveScout.HomeLz) {
                  aScout.RemoveScout(scout); // iterate
                  scanRegions(callback);
                  return; // so no fall through
                }

                // update arrival
                fo.GetLastFleetSent(galaxy, scout.destination, function(scoutFleet) {
                  if (aScout.eyeRegions.length > 0) scanRegions(callback);
                  else {
                    aScout.log('Done with regions in scanRegions');
                    econs.CallBack(callback, 'done');
                  }
                });
              });
            });
          } catch (e) {
            lg.debug(e, 'Error in scanRegions:', {
              stack: true
            });
          }
        }

        var getScoutInRegion = function(region) {
          for (var i = 0; i < aScout.ActiveScout.ScoutFleets.length; i++) {
            if (aScout.ActiveScout.ScoutFleets[i].location == region.location) return aScout.ActiveScout.ScoutFleets[i];
          }
          return null;
        }

        // send all landed scouts to next unscanned region
        var sendLanded = function(sendResponse) {
          aScout.SendScoutStatus('Sending landed scouts');

          // get landed scout in a region that has already been scanned
          var scout = getScannedLanded();
          // if scout == null, no landed scouts on scanned regions, no more to send
          if (scout == null) {
            econs.CallBack(sendResponse, 'SendLandedDone');
            return;
          }
          var fo = new FleetOperations();
          aScout.nextRegion = fo.GetClosestDestination(scout);
          if (aScout.nextRegion == null) {
            // no where to send it
            aScout.log('NextRegion is null in ScanLanded');
            econs.CallBack(sendResponse, 'SendLandedDone');
            return;
          }
          scout.destination = aScout.nextRegion.location;

          fo.MoveFleet(scout, function(status) {
            aScout.log(status);
            if (status.includes('ERROR')) {
              aScout.ScanLanded(galaxy, gs, callback, status);
              return; // so no fall through
            }
            aScout.nextRegion.Status = sru.EnRoute;
            sru.UpdateRegions(aScout.nextRegion);

            // if he is sent home, remove from array
            if (scout.destination == aScout.ActiveScout.SourceFleets[0].location) {
              aScout.RemoveScout(scout); // iterate
              aScout.ScanLanded(galaxy, gs, callback);
              return; // so no fall through
            }

            // update arrival
            fo.GetLastFleetSent(galaxy, scout.destination, function(scoutFleet) {
              // need to update this scout in ActiveScout.ScoutFleetsif(aScout.ActiveScout.SourceFleets[0].location == aScout.nextRegion.location) {
              // iterate
              aScout.ScanLanded(galaxy, gs, callback);
            });
          });
        }

        sendLanded(function(status) {
          aScout.SendScoutStatus('Scouts sent, scanning');
          doOneCanScan(function(status) {
            aScout.log(status);
            if (aScout.eyeRegions.length == 0) {
              aScout.log('All regions of landed scouts are scanned');
              econs.CallBack(callback, 'Done');
              return;
            }
            scanRegions(function(data) {
              aScout.log('Done scanning Regions');
              aScout.SendScoutStatus('Done scanning Regions');
              aScout.SaveActiveScout();
              // iterate - ScanLanded has the proper exit
              aScout.ScanLanded(galaxy, gs, callback);
            });
          });
        });
      });
    } catch (e) {
      lg.debug(e, 'Error in ScanLanded:', {
        stack: true
      });
    }
  }

  this.UpdateScoutFleets = function(scout) {
    try {
      $.each(aScout.ActiveScout.ScoutFleets, function(key, sc) {
        if (sc.fleetId == scout.fleetId) {
          aScout.ActiveScout.ScoutFleets[key] = scout;
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in UpdateScoutFleets:', {
        stack: true
      });
    }
  }


  this.GetLandedScouts = function(galaxy, scoutList, callback) {
    try {
      aScout.callback = callback;

      var GetScoutFromList = function(fleetId) {
        for (var i = 0; i < aScout.ActiveScout.ScoutFleets.length; i++) {
          var s = aScout.ActiveScout.ScoutFleets[i];
          if (s.fleetId == fleetId) return s;
        }
        return null;
      }
      var url = 'fleet.aspx';
      aScout.GetAE(url, function(page) {
        if (parse.BadDoc(page, 'GetLandedScouts')) return;
        var body = $(page);
        var table = body.filter('#fleets-list').find('table');
        table.find('td:nth-child(6)').remove();
        var landedScouts = [];

        table.find('tr:gt(0)').each(function() {
          var tds = $(this).children('td');
          var td1 = tds.eq(0).find('a'); // fleet url inc fleetid
          var td2 = tds.eq(1).find('a'); // start location url
          var td3 = tds.eq(2).find('a'); // dest location url
          var td4 = tds.eq(3); // arrival text
          var td5 = tds.eq(4); // size text
          var arrival = td4.attr('title');
          if (!(arrival > 0)) arrival = 0;
          var td1a = td1.attr('href');
          var td2a = td2.attr('href');
          var fGal = safeMatch(td2a, /loc=([A-Z]\d\d):\d\d:\d\d:\d\d/, [1]);
          if (fGal != galaxy) return;
          var td3a = (td3 != null) ? td3.attr('href') : null;
          var destLoc = (td3a == null) ? '' : safeMatch(td3a, /loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
          row = {
            fleetUrl: td1a,
            fleetId: safeMatch(td1a, /fleet=(\d+)/, [1]),
            fleetName: td1.text(),
            startLocation: safeMatch(td2a, /loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]),
            startName: td2.text(),
            destLocation: destLoc,
            destinationName: td3.text(),
            arrival: arrival,
            size: td5.text()
          }
          var scout = GetScoutFromList(row.fleetId);
          if (scout != null) {
            // landed
            if (row.destLocation == '') {
              scout.location = row.startLocation;
              scout.destination = '';
              landedScouts.push(scout);

            } else {
              // in flight
              scout.arrival = parseInt(row.arrival);
            }
            aScout.UpdateScoutFleets(scout);
          }
        });
        econs.CallBack(aScout.callback, landedScouts);
        return;
      });
    } catch (e) {
      lg.debug(e, 'Error in GetLandedScouts:', {
        stack: true
      });
    }
  }

  this.RefreshScoutList = function(page, gs_galaxy, callback) {
    try {
      if (parse.BadDoc(page, 'RefreshScoutList')) return;
      var body = $(page);
      var table = body.filter('#fleets-list').find('table');
      table.find('td:nth-child(6)').remove();
      var rows = [];
      gs_ignore_regions = [];
      table.find('tr:gt(0)').each(function() {
        var name = $(this).children('td:first').text();
        var dest = $(this).children('td:eq(2)').text();
        if (dest == '') var loc = $(this).children('td:eq(1)').text();
        else
          var loc = dest;
        var scoutsize = Number($(this).children('td:eq(4)').text());
        var galaxy = safeMatch(loc, /\(([A-Z]\d\d):\d\d:\d\d:\d\d\)$/, [1]);
        // need to see if scouts are on scoutlist... not check size
        if ((gs_galaxy.indexOf(galaxy) != -1) && (scoutsize == 40 || scoutsize == 20)) {
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
        } else {
          var region = safeMatch($(this).children('td:eq(1)').text(), /[A-Z]\d\d:\d\d/, [0]);
          var gal = safeMatch(region, /[A-Z]\d\d/, [0]);
          if (gs_galaxy.indexOf(gal) != -1) gs_ignore_regions.push(region);
        }
      });
      if (rows.length == 0) {
        ctF.DisplayStatus('Galaxy Scouting Done');
        //clearScoutTimer();
        return;
      }
      landed_scouts = [];
      var min_arrival;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.dest_name == '') landed_scouts.push(row);
        if (typeof min_arrival == 'undefined' || Number(min_arrival) > Number(row.arrival)) min_arrival = Number(row.arrival);
        ctF.DisplayStatus(row.fleet_name + ',' + row.start_name + ',' + row.dest_name + ',' + row.arrival);
        this.log(row.fleet_name + ',' + row.start_name + ',' + row.dest_name + ',' + row.arrival);
      }
      var regions = [];
      if (landed_scouts.length > 0) {
        $('#gs_timer_div').hide();
        for (var i in landed_scouts) {
          var fleet = landed_scouts[i];
          var astro = safeMatch(fleet.start_name, /[A-Z]\d\d:\d\d:\d\d:\d\d/, [0]);
          var region = safeMatch(astro, /[A-Z]\d\d:\d\d/, [0]);
          regions.push(region);
          ctF.DisplayStatus('Region:' + region + ', astro:' + astro + ',Url' + fleet.start_url);
          this.log('Region:' + region + ', astro:' + astro + ',Url' + fleet.start_url);
        }
        econs.CallBack(callback, regions);

      } else {
        // return NO regions to scan
        econs.CallBack(callback, regions);
      }
    } catch (e) {
      lg.debug(e, 'Error in RefreshScoutList:', {
        stack: true
      });
    }
  }

  this.GetFleetWithScouts = function() {
    try {
      // fleet must be landed
      for (var i = 0; i < aScout.detailFleets.length; i++) {
        var f = aScout.detailFleets[i];
        if (f.destination != '') continue;
        for (j = 0; j < f.details.length; j++) {
          if (f.details[j].unit == 'Scout Ship') return f;
        }
      }
      return null;
    } catch (e) {
      lg.debug(e, 'Error in GetFleetWithScouts:', {
        stack: true
      });
    }
  }

  // get the longest number of days an astro was scouted in each region
  this.GetRegionsFromDsis = function(galaxy, callback) {
    try {
      var dsisRegions = [];
      //ctG.SendingPlayerId = $('#account').next().text();
      var req = {
        request: {
          //mode: 'getOldestInGalaxyByRegion',
          mode: 'getFastestJgByRegion',
          galaxy: galaxy,
          sendingPlayerId: ctG.SendingPlayerId
        }
      }
      var gs = GmServer;
      var dsisServer = gs.DsisServers[0];
      dsisReq.MakeRequest(req, dsisServer, function(resp) {
        dsisRegions = resp.data.regions;
        var jg = 0;
        for (var i = 0; i < dsisRegions.length; i++) {
          dsisRegions[i].Status = 0;
        }
        econs.CallBack(callback, dsisRegions);
      });
    } catch (e) {
      lg.debug(e, 'Error in GetRegionsFromDsis:', {
        stack: true
      });
    }
  }

  this.SortGalaxyAlpha = function(a, b) {
    var ar = safeMatch(a, /([A-Z]\d\d)/, [1]);
    var br = safeMatch(b, /([A-Z]\d\d)/, [1]);
    return ((ar < br) ? -1 : ((ar > br) ? 1 : 0));
  }

  this.SortAstrosAlpha = function(a, b) {
    var ar = safeMatch(a, /([A-Z]\d\d:\d\d:\d\d)/, [1]);
    var br = safeMatch(b, /([A-Z]\d\d:\d\d:\d\d)/, [1]);
    return ((ar < br) ? -1 : ((ar > br) ? 1 : 0));
  }

  this.BaseRegions = function(callback) {
    try {

      aScout.GetAE('base.aspx', parse.GetBaseRegions, function(regionList) {
        var baseRegionLocs = sru.GetUniqueRegionsList(regionList);
        // need list of region objs
        var baseRegions = [];
        $.each(baseRegionLocs, function(index, loc) {
          var r = safeMatch(loc, /([A-Z]\d\d:\d\d)/, [1]);
          baseRegions.push(new Region(r));
        });
        aScout.IterateRegions(baseRegions, function(data) {
          aScout.log('Done with Base Regions');
          econs.CallBack(callback, 'Regions Scanned');
        });
      });
    } catch (e) {
      lg.debug(e, 'Error in BaseRegions:', {
        stack: true
      });
    }
  }

  this.RegionsWithFleet = function(callback) {
    try {
      var fleetRegions = [];
      aScout.GetAE('fleet.aspx', parse.GetRegionsWithFleet, function(data) {
        var ur = sru.GetUniqueRegionsList(data.regions);
        $.each(ur, function(index, region) {
          fleetRegions.push(new Region(region));
        });
        aScout.IterateRegions(fleetRegions, function(data) {
          aScout.log('Done with Fleet Regions');
          ctF.DisplayStatus('Done with Fleet Regions');
          econs.CallBack(callback, 'Fleet Regions Scanned');
        });
      });
    } catch (e) {
      lg.debug(e, 'Error in RegionsWithFleet:', {
        stack: true
      });
    }
  }
  // send scouts to all regions, start scouting regions where scouts are present
  this.Galaxy = function(gal, gs, callback, seedOnly = false) {
    try {
      this.seedOnly = seedOnly;
      this.log('Starting scout of Galaxy:' + gal);
      if (aScout.ActiveScout == null) aScout.ActiveScout = new ActiveScout(gal, gs);
      if (aScout.ActiveScout.ScoutRegions.length == 0) {
        this.InitScoutRegions(gal);
      }

      this.log('Regions found:' + aScout.ActiveScout.ScoutRegions.length);
      this.IterateRegions(aScout.ActiveScout.ScoutRegions, function(data) {
        aScout.log('Done with regions in Galaxy');
        econs.CallBack(callback, 'Galaxy Completed');
      });
    } catch (e) {
      lg.debug(e, 'Error in Galaxy:', {
        stack: true
      });
    }
  }

  this.IterateRegions = function(regions, callback) {
    try {
      var r = regions.shift();
      aScout.Region(r, function(regionObj) {
        if (aScout.ActiveScout != null) {
          regionObj.Status = sru.Scanned;
          sru.UpdateRegions(aScout.ActiveScout.ScoutRegions, regionObj);
        }

        if (regions.length > 0) aScout.IterateRegions(regions, callback);
        else {
          aScout.log('Done with regions in IterateRegions');
          econs.CallBack(callback, 'done');
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in IterateRegions:', {
        stack: true
      });
    }
  }
  // scout this region, get system list and go down it
  this.Region = function(regionObj, callback) {
    try {
      if (aScout.ActiveScout != null) {
        regionObj.Status = sru.InProgress;
        sru.UpdateRegions(aScout.ActiveScout.ScoutRegions, regionObj);
      }

      aScout.log('Starting scout of Region:' + regionObj.region);
      systems = [];
      aScout.GetAE('map.aspx?loc=' + regionObj.region, function(data) {
        var body = $(data);
        systems = parse.ParseRegion(data);
        aScout.log('Systems found:' + systems.length);
        aScout.IterateSystems(function(data) {
          aScout.log('Done with systems in Region, region marked as scanned');
          if (aScout.ActiveScout != null) {
            regionObj.Status = sru.Scanned;
            sru.UpdateRegions(aScout.ActiveScout.ScoutRegions, regionObj);
          }
          econs.CallBack(callback, regionObj);
        });
      });
    } catch (e) {
      lg.debug(e, 'Error in Region:', {
        stack: true
      });
    }
  }

  var cnt = 0;
  this.IterateSystems = function(callback, guildSystems) {
    try {
      if (guildSystems && cnt == 0) {
        systems = aScout.GuildSystems;
        cnt = 1;
      }

      var s = systems.shift();
      if (!s) {
        aScout.log('Done with systems in IterateSystems: s is undefined');
        econs.CallBack(callback, 'done');
        return;
      }
      if (aScout.seedOnly === true) systems = [];
      this.System(s.coords, function(data) {
        if (systems.length > 0) aScout.IterateSystems(callback, guildSystems);
        else {
          aScout.log('Done with systems in IterateSystems');
          econs.CallBack(callback, 'done');
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in IterateSystems:', {
        stack: true
      });
    }
  }

  this.IterateAstros = function(callback) {
    try {
      aScout.log('Parsing astro');
      var a = astros.shift();
      this.Astro(a, function(didUpload) {
        aScout.log(a.coord + ' Parsed');
        if (astros.length > 0) aScout.IterateAstros(callback);
        else {
          aScout.log('Done with astros in IterateAstros');
          econs.CallBack(callback, 'done');
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in IterateAstros:', {
        stack: true
      });
    }
  }
  // iterate over a fleet list and get details
  this.IterateFleets = function(dfleets, callback) {
    try {
      aScout.log('Parsing fleet');
      if (fleets.length == 0) return;
      var fleetId = fleets.shift();
      var dfleet = null;
      for (var i = 0; i < dfleets.length; i++) {
        if (fleetId == dfleets[i].fleetId) {
          dfleet = dfleets[i];
          break;
        }
      }
      if (dfleet == null) {
        this.log('Error finding detail fleet for fleetId:' + fleetId);
        econs.CallBack(callback, 'done: Error finding detail fleet for fleetId:' + fleetId);
        return;
      }
      this.Fleet(fleetId, dfleet, function(fl) {
        // NOTE: fl is the filled in fleet..
        aScout.log('Fleet Detail Parsed for:' + fl.fleetname);
        aScout.detailFleets.push(fl);
        if (fleets.length > 0) {
          aScout.IterateFleets(dfleets, callback);
        } else {
          if (typeof callback == 'function') {
            aScout.log('Done with fleets in IterateFleets');
            econs.CallBack(callback, 'done');
          }
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in IterateFleets:', {
        stack: true
      });
    }
  }
  // scout this system, each astro and base, call Fleet if there are any
  this.System = function(loc, callback) {
    try {
      aScout.log('Starting System scout of:' + loc);
      aScout.GetAE('map.aspx?loc=' + loc, parse.ParseSystem, function(astroList) {
        ctF.DisplayStatus('Done parsing:' + loc);
        if (aScout.seedOnly === true && astroList.length > 0) {
          econs.CallBack(callback);
          return;
        }
        astros = astroList;
        if (astros.length > 0) {
          aScout.IterateAstros(function(didUpload) {
            econs.CallBack(callback, didUpload);
          });
        } else econs.CallBack(callback, 'done');

      });
    } catch (e) {
      lg.debug(e, 'Error in System:', {
        stack: true
      });
    }

  }
  // scout this system, each astro and base, call Fleet if there are any
  this.Astro = function(astro, callback) {
    try {
      this.log('Starting Astro scout of:' + astro.coord);
      var fn = parse.ParseAstro;
      var url = 'map.aspx?loc=' + astro.coord;
      if (astro.baseId != 0) {
        fn = parse.ParseBase;
        url = 'base.aspx?base=' + astro.baseId;
      }
      aScout.GetAE(url, fn, function(fleetList, didUpload) {
        try {
          ctF.DisplayStatus('Done parsing:' + astro.coord);
          if (aScout.seedOnly === true) fleetList = [];
          fleets = [];
          for (var i = 0; i < fleetList.length; i++) {
            fleets.push(fleetList[i].fleetId);
          }

          if (fleets.length > 0) {
            aScout.IterateFleets(fleetList, function() {
              econs.CallBack(callback, 'done');
            });
          } else {
            aScout.log('Done with fleets in Astro');
            econs.CallBack(callback, didUpload);
          }
        } catch (e) {
          lg.debug(e, 'Error in ascout.Astro:GetAE', {
            stack: true
          });
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in Astro:', {
        stack: true
      });
    }

  }

  this.Fleet = function(fleet, dfleet, callback) {
    try {
      aScout.log('Starting fleet scout of:' + fleet);
      var handler = function(fleetObj) {
        try {
          if (typeof fleetObj == 'undefined') {
            aScout.log('Fleet: fleet undefined, coming from doGetAe');
            return;
          }
          ctF.DisplayStatus('Done parsing:' + fleetObj.fleetId + ', ' + fleetObj.fleetname);
          econs.CallBack(callback, fleetObj);
          return;
        } catch (e) {
          lg.debug(e, 'Error in Fleet.handler:', {
            stack: true
          });
        }
      }
      var fn = parse.ParseFleetDetails;
      var url = 'fleet.aspx?fleet=' + fleet;
      aScout.GetAE(url, function(msg) {
        fn(msg, dfleet, handler);
      });
    } catch (e) {
      lg.debug(e, 'Error in Fleet:', {
        stack: true
      });
    }
  }
}
