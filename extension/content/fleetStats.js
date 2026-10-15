var FleetStats = function() {
  var fleetStatsQ = [];

  this.Results = {
    fleets: [],
    free: false,
    fleet: null,
    status: 'working'
  }

  this.GetEmpireFleets = function() {
    try {
      fStats.Results.free = false;
      fStats.Results.fleets = [];
      ctF.DoGetAE('empire.aspx?view=fleets', function(page) {
        var obj = $(page);
        var free = obj.find('center:contains(This feature is only for upgraded accounts)');
        if (free.length) {
          fStats.GetFleetStats();
          return;
        }
        var obj = $(page);
        var empTbl = obj.filter('#empire_fleets');
        var rows = $('tr:gt(2)', empTbl);
        rows.each(function(index, row) {
          var fleet = new Fleet();
          var cols = $('td', row);
          cols.each(function(cindex, col) {
            switch (cindex) {
              case 0:
                // fleet info
                var h = $(col).html();
                fleet.Fleetname = $(col).text();
                fleet.FleetId = h.match(/fleet=(\d+)/)[1];
                break;
              case 1:
                var h = $(col).html();
                fleet.LocationName = $(col).text();
                fleet.Location = h.match(/loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/)[1];
                break;
              case 2: // FT
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Fighters');
                  fleet.Details.push(ship);
                }
                break;
              case 3: // BO
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Bombers');
                  fleet.Details.push(ship);
                }
                break;
              case 4: // HB
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Heavy Bombers');
                  fleet.Details.push(ship);
                }
                break;
              case 5: // IB
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Ion Bombers');
                  fleet.Details.push(ship);
                }
                break;
              case 6: // CV
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Corvette');
                  fleet.Details.push(ship);
                }
                break;
              case 7: // RC
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Recycler');
                  fleet.Details.push(ship);
                }
                break;
              case 8: // DE
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Destroyer');
                  fleet.Details.push(ship);
                }
                break;
              case 9: // FR
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Frigate');
                  fleet.Details.push(ship);
                }
                break;
              case 10: // IF
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Ion Frigate');
                  fleet.Details.push(ship);
                }
                break;
              case 11: // SS
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Scout Ship');
                  fleet.Details.push(ship);
                }
                break;
              case 12: // OS
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Outpost Ship');
                  fleet.Details.push(ship);
                }
                break;
              case 13: // CR
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Cruiser');
                  fleet.Details.push(ship);
                }
                break;
              case 14: // CA
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Carrier');
                  fleet.Details.push(ship);
                }
                break;
              case 15: // HC
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Heavy Cruiser');
                  fleet.Details.push(ship);
                }
                break;
              case 16: // BS
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Battleship');
                  fleet.Details.push(ship);
                }
                break;
              case 17: // FC
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Fleet Carrier');
                  fleet.Details.push(ship);
                }
                break;
              case 18: // DN
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Dreadnought');
                  fleet.Details.push(ship);
                }
                break;
              case 19: // TI
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Titan');
                  fleet.Details.push(ship);
                }
                break;
              case 20: // LE
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Leviathan');
                  fleet.Details.push(ship);
                }
                break;
              case 21: // DS
                var amt = $(col).text();
                if (amt != '') {
                  var ship = new Ship(cindex - 2, amt, 'Death Star');
                  fleet.Details.push(ship);
                }
                break;
              case 22: // Size
                var h = $(col).html();
                fleet.Size = $(col).text();
                break;
            }
          });
          fStats.Results.fleets.push(fleet);
        });
        // done, send
        fStats.SendToContext();
      });
    } catch (e) {
      lg.debug(e, 'Error in FleetStats.GetEmpireFleets:', {
        stack: true
      });
    }
  }

  this.IsVisibleFor = function(flightTimeRemaining, size) {
    var s = ctF.ReplaceAll(size, ',', '');
    var fleetSize = parseInt(s);
    var detectionTime = 172800 * ((-200000 / (fleetSize + 200000)) + 1);
    var diff = detectionTime - parseInt(flightTimeRemaining);
    // > 0 means its detectable
    return {
      DetectionTime: detectionTime,
      Remaining: diff
    };
  }

  this.SecToTime = function(secs) {
    var x = secs;
    var seconds = Math.floor(x % 60);
    x = Math.floor(x / 60);
    var minutes = x % 60;
    x = Math.floor(x / 60);
    var hours = x % 24;
    x = Math.floor(x / 24);
    var days = x;
    var msg = '';
    if (days > 0) msg += days + 'd ';
    if (hours > 0) msg += hours + 'h ';
    if (minutes > 0) msg += minutes + 'm ';
    if (seconds > 0) msg += seconds + 's';
    return msg;
  }

  // send to context menu - empirefleets
  this.SendToContext = function(one = false) {
    GmServer.playerId = ctG.SendingPlayerId;
    var action = (one === true) ? 'EFDataChunk' : 'EFData';
    ctF.SendMessage(new Message('background', action, {
      Results: fStats.Results,
      GmServer: GmServer
    }));
  }

  this.GetFleetStats = function() {
    try {
      fStats.Results.free = true;
      fStats.Results.fleets = [];
      ctF.DoGetAE('fleet.aspx', function(page) {
        var body = $(page);
        var ftable = body.filter('#fleets-list');
        var frows = $('table tbody tr', ftable);
        frcnt = frows.length;
        frows.each(function() {
          var cells = $(this).children('td');
          if (cells.length != 6) return;
          var loctxt = cells.eq(1).text();
          var lurl = cells.eq(1).children('a').attr('href');
          var loc = lurl.match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)[0];
          var dest = cells.eq(2).text();
          var sortkey = loc;
          if (dest != '') {
            var durl = cells.eq(2).children('a').attr('href');
            var dloc = durl.match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)[0];
            loctxt = loctxt + '(->' + dloc + ')*';
            sortkey = 'ZZ' + loc;
          }
          var size = cells.eq(4).text();
          var fleetname = cells.eq(0).text();
          var fleetId = cells.eq(0).children('a').attr('href').match(/\d+/)[0];
          var url = cells.eq(0).children('a').attr('href');
          var fleet = new Fleet();
          fleet.FleetId = fleetId;
          fleet.Url = url;
          fleet.Fleetname = fleetname;
          fleet.Index = frcnt;
          fleet.Destination = dloc;
          fleet.Location = loc;
          fleet.LocationName = loctxt;
          fleet.Arrival = '';
          fleet.Size = size;
          fleetStatsQ.push(fleet);
        });

        fStats.ProcessFleetStatsQ();
      });
    } catch (e) {
      lg.debug(e, 'Error in FleetStats.GetFleetStats:', {
        stack: true
      });
    }
  }

  this.ProcessFleetStatsQ = function() {
    try {
      if (fleetStatsQ.length > 0) {
        var fParams = fleetStatsQ.shift();
        fStats.log('Processing: ' + fParams.FleetId);
        fStats.GetOneFleetDetail(fParams);
      } else {
        // send Result to EmpireFleetObj
        fStats.Results.status = 'DONE';
        fStats.SendToContext(true);
        fStats.Results.status = 'working';
      }
    } catch (e) {
      lg.debug(e, 'Error in FleetStats.ProcessFleetStatsQ:', {
        stack: true
      });
    }
  }

  this.GetOneFleetDetail = function(fParams) {
    try {
      ctF.DoGetAE(fParams.Url, function(page) {
        parse.ParseFleetDetails(page, fParams, function(fleet) {
          // add to results

          fParams.Details = [];
          $.each(fleet.details, function(index, ship) {
            var sindex = ships.GetShipIndex(ship.unit);
            var s = new Ship(sindex, ship.amt, ship.unit);
            fParams.Details.push(s);
          });
          fStats.Results.fleet = fParams;
          fStats.SendToContext(true);
          fStats.ProcessFleetStatsQ();
        });
      });
    } catch (e) {
      lg.debug(e, 'Error in FleetStats.GetOneFleetDetail:', {
        stack: true
      });
    }
  }


  this.log = function(msg) {
    lg.log('FStats:' + msg);
  }
}
