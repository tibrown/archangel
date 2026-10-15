var BaseData = function () {
  this.BaseId = -1;
  this.OwnerNick = '';
  this.OwnerPlayerId = '';
  this.GuildId = -1;
  this.JumpGateLevel = -1;
  this.BaseName = '';
  this.Location = '';
  this.Vacation = 0;
}

var Gate = function () {
  // indexed by location
  this.BaseData = [];
  this.Stamp = Date.now();
  this.GuildId = -1;
}

var GateHints = function () {

  this.Gates = new Gate();

  this.RouteCache = [];
  this.DistCache = [];

  this.GetGates = function (callback) {
    try {
      var req = {
        request: {
          mode: 'getGates',
          playerId: ctG.SendingPlayerId,
          sendingPlayerId: ctG.SendingPlayerId
        }
      }
      dsisReq.MakeRequest(req, GmServer.DsisServers[0], function (resp) {
        var r = JSON.stringify(JSON.stringify(resp).substring(0, 100));
        lg.log('Gates Data:' + r);
        // trap server error here
        if (resp.status == 'OK') {
          gHints.Gates.BaseData = resp.data.gates;
          econs.CallBack(callback, resp.data.gates);
        }
      });
    } catch (e) {
      lg.debug(e, 'Error in gHints.GetGates', {
        stack: true
      });
    }
  }

  this.log = function (msg) {
    lg.log('gHints:' + msg);
  }

  this.CalcDuration = function (distance, speed, jumpgate, logistics) {
    var duration = 0;
    if ((distance > 0) && (speed > 0)) {
      tspeed = (speed * (1 + jumpgate));
      duration = Math.ceil((distance / tspeed) * 3600);
      if (logistics) duration = Math.ceil(duration * (1 - logistics * 0.01))
    }
    return duration;
  }
  /*
  Find base speed before jg so we have an accurate multiplier
  Find start to end totaltime
  Provide jg level of start
  */
  this.FindFastestRoute = function (start, end, speed, jumpgate, logistics) {
    var gates = gHints.Gates.BaseData;
    var dist = gHints.CalcDistance(start, end);
    var startTimeToEnd = gHints.CalcDuration(dist, speed, jumpgate, logistics);
    //(dist / (speed * (1 + jumpgate))) * 3600;
    // calc time to start and end for each gate
    $.each(gates, function (index, base) {
      if (base.location == start || base.location == end) return;
      dist = gHints.CalcDistance(start, base.location);
      base.TimeToStart = gHints.CalcDuration(dist, speed, jumpgate); //(dist / (speed * (1 + base.jumpgate))) * 3600;
      dist = gHints.CalcDistance(end, base.location);
      base.TimeToEnd = gHints.CalcDuration(dist, speed, jumpgate); //(dist / (speed * (1 + base.jumpgate))) * 3600;
    });

    // now see if time to start + time to end is better than start to end
    var startBase = null;
    $.each(gates, function (index, base) {
      if (base.location == start || base.location == end) return;
      if (base.TimeToStart + base.TimeToEnd < startTimeToEnd) startBase = base;
    });
    var path = start + ',' + end;
    var bestTime = startTimeToEnd;
    if (startBase != null) {
      path = start + ',' + startBase.location + ',' + end;
      bestTime = startBase.TimeToStart + startBase.TimeToEnd;
    }
    var bases = [];
    if (startBase) bases.push(startBase);
    else bases.push({
      location: start,
      name: 'Orig Best',
      nick: '',
      jumpgate: jumpgate
    });
    bases.push({
      location: end,
      name: '',
      nick: '',
      jumpgate: 0
    });
    var result = {
      bestpath: path,
      bestpathtime: bestTime,
      details: bases
    };
    return result;
  }

  this.FindBestRoute = function (start, end, speed, misc) {
    try {
      //var key = start + '.' + end + '.' + speed + '.' + guildids + '.' + gHints.Gates[servid].Stamp;
      //if (gHints.RouteCache[key] != null) return gHints.RouteCache[key];

      var temp = gHints.CopyGates(start.substring(0, 3), end.substring(0, 3));
      gHints.AddFakeCord(temp, start);
      gHints.AddFakeCord(temp, end);

      // gates indexed by servid - this.Gates[servid]...
      var start2, end2, result;

      start2 = Date.now();
      result = gHints.RealFindBestRoute(start, end, speed, temp);
      end2 = Date.now();
      //}
      gHints.log('js result: ' + result.bestpath);
      gHints.log('js time: ' + (end2 - start2), 'timing');
      //gHints.RouteCache[key] = result;
      return result;
    } catch (e) {
      lg.debug(e, 'Error in gHints.FindBestRoute', {
        stack: true
      });
    }
  }

  this.FlushRouteCache = function () {
    gHints.RouteCache = new Array();
  }

  this.CopyGates = function (origingalaxy, destgalaxy) {
    try {
      var out = [];
      var input = gHints.Gates.BaseData; //need to provide gates

      var gates_added = 0;
      var key;
      for (var x = 0; x < input.length; x++) {
        input[x].guildid = parseInt(input[x].guildid);
        //if (guildids.indexOf(input[x].GuildId) != -1) {
        if (input[x].vacation != '1') {
          var use = false;
          key = x;
          if ((input[x].location.substring(0, 3) == origingalaxy) && (destgalaxy == origingalaxy)) {
            // traveling within the galaxy and gate is within
            use = true;
          } else if (destgalaxy != origingalaxy) {
            // traveling outside the galaxy
            use = true;
            // and the gate is outside
            if (input[x].location.substring(0, 3) != origingalaxy) key = input[x].location.substring(0, 4);
          }
          var addit = false;

          if (use) {
            // filter out any gates at the same key that are worse
            if (out.length == 0) addit = true;

            for (var o = 0; o < out.length; o++) {
              var ogal = out[o].location.substring(0, 3);
              var dgal = input[x].location.substring(0, 3);
              if (ogal == dgal && out[o].jumpgate < input[x].jumpgate) addit = true;
              if (ogal != dgal) addit = true;
            }
          }
          if (addit) {
            var rec = {
              location: input[x].location,
              jumpgate: parseInt(input[x].jumpgate),
              totaltime: -1,
              baseid: input[x].baseid,
              guildid: parseInt(input[x].guildid)
            }
            out.push(rec);
          }
          //}

        }
      }
      gHints.log('added ' + gates_added + ' gates to out, returning');
      return out;
    } catch (e) {
      lg.debug(e, 'Error in gHints.CopyGates', {
        stack: true
      });
    }
  }

  this.AddFakeCord = function (list, cord) {
    list.push({
      location: cord,
      gate: 0,
      totaltime: -1
    });
  }

  this.RealFindBestRoute = function (start, end, speed, temp) {
    try {
      gHints.log('finding best route from ' + start + ' to ' + end);

      var pass = 1,
        changes, gate1, gate2, bits = 0,
        legtime, legdist, gate1level, gate2level, newtotaltime;

      for (gate2 in temp) {
        gHints.InitRouteEntry(temp, start, gate2, speed, 0);
      }

      var last_event = Date.now();
      do {
        changes = 0;
        for (gate1 in temp) {
          gate1 = parseInt(gate1);
          gate1level = temp[gate1].jumpgate;
          //if (debugoutput) debug('working movement from ' + gate1 + ' ' + changes);
          for (gate2 in temp) {
            gate2 = parseInt(gate2);
            gate2level = temp[gate2].jumpgate;
            if ((Date.now() - last_event) > 50) {

              last_event = Date.now();
            }
            bits = bits + 1;
            //if (debugoutput) debug('to ' + gate2 + ' ' + temp[gate2].location + ' ' + temp[gate2].gate);
            if (gate1 != gate2) {
              legdist = gHints.CalcDistance(temp[gate1].location, temp[gate2].location);
              legtime = (legdist / (speed * (1 + gate1level))) * 3600;
              // add 30 seconds for the stop over
              legtime = legtime + 30;
              newtotaltime = Math.round(temp[gate1].totaltime + legtime, 2);
              if (newtotaltime < temp[gate2].totaltime) {
                temp[gate2].totaltime = newtotaltime;
                temp[gate2].path = temp[gate1].path + ',' + temp[gate2].location;
                //if (debugoutput) debug(gate1+' is a better way to get to '+temp[gate2]+', drops trip from '+temp[gate2].totaltime+' to '+(temp[gate1].totaltime + legtime) + ' ' + temp[gate2].path);
                changes++;
              } // leg saves time
            } // not a->a
          } // inner for
        } // outer for
        //if (debugoutput)
        //debug('made '+changes+' changes in pass# '+pass,'router');
        pass++;
      } while (changes > 5);
      /*for (x in temp) {
			debug('best distance to '+x+' '+temp[x].location+' is '+temp[x].totaltime + ' ' + temp[x].path);
		}*/
      var x = 0; // supposed to be end
      for (x = 0; x < temp.length; x++) {
        if (temp[x].location == end) break;
      }
      var gate_count = 0;
      for (var dont_crash in temp) gate_count++;
      gHints.log('bits:' + bits + ' pass:' + pass + ' gates:' + gate_count);
      var ret = new Object;
      ret.bestpath = temp[x].path;
      ret.bestpathtime = temp[x].totaltime;
      ret.internal = temp;
      return ret;
    } catch (e) {
      lg.debug(e, 'Error in gHints.RealFindBestRoute', {
        stack: true
      });
    }
  }

  this.InitRouteEntry = function (list, start, cord, speed, changes) {
    try {
      if (list[cord].totaltime == -1) {
        //debug(gate2+' isnt init\'d, entering raw distance');
        var dist1 = gHints.CalcDistance(start, list[cord].location);
        list[cord].totaltime = (dist1 / speed) * 3600;
        if (start == list[cord].location) list[cord].path = start;
        else list[cord].path = start + ',' + list[cord].location;
        changes++;
      }
      return changes;
    } catch (e) {
      lg.debug(e, 'Error in gHints.InitRouteEntry', {
        stack: true
      });
    }
  }
  // called by ae.js to check the gates

  this.CalcDistance = function (cord1, destination) { // Calc Distance Start-Target
    try {
      if (gHints.DistCache[cord1 + destination]) return gHints.DistCache[cord1 + destination];
      var start = "";
      var distance = 0;
      var s_gal0 = "";
      var sgal1 = 0;
      var sgal2 = 0;
      var s_reg0 = 0;
      var s_reg1 = 0;
      var s_sys0 = 0;
      var s_sys1 = 0;
      var s_ast0 = 0;
      var s_ast1 = 0;
      var t_gal0 = "";
      var t_gal1 = 0;
      var t_gal2 = 0;
      var t_reg0 = 0;
      var t_reg1 = 0;
      var t_sys0 = 0;
      var t_sys1 = 0;
      var t_ast0 = 0;
      var t_ast1 = 0;
      var s_sys_x = 0;
      var s_sys_y = 0;
      var t_sys_x = 0;
      var t_sys_y = 0;
      var var_gal = 0;
      var var_sys = 0;
      var var_ast0 = 0;
      var var_ast1 = 0;

      start = cord1;
      s_gal0 = String(start.charAt(0));
      s_gal1 = Number(start.charAt(1));
      s_gal2 = Number(start.charAt(2));
      s_reg0 = Number(start.charAt(4));
      s_reg1 = Number(start.charAt(5));
      s_sys0 = Number(start.charAt(7));
      s_sys1 = Number(start.charAt(8));
      s_ast0 = Number(start.charAt(10));
      s_ast1 = Number(start.charAt(11));

      t_gal0 = String(destination.charAt(0));
      t_gal1 = Number(destination.charAt(1));
      t_gal2 = Number(destination.charAt(2));
      t_reg0 = Number(destination.charAt(4));
      t_reg1 = Number(destination.charAt(5));
      t_sys0 = Number(destination.charAt(7));
      t_sys1 = Number(destination.charAt(8));
      t_ast0 = Number(destination.charAt(10));
      t_ast1 = Number(destination.charAt(11));

      s_sys_x = s_reg1 * 10 + s_sys1;
      s_sys_y = s_reg0 * 10 + s_sys0;
      t_sys_x = t_reg1 * 10 + t_sys1;
      t_sys_y = t_reg0 * 10 + t_sys0;

      var_gal = Math.abs((s_gal1 - t_gal1) * 19 + s_gal2 - t_gal2);

      var_sys = Math.ceil(Math.sqrt(Math.pow(t_sys_x - s_sys_x, 2) + Math.pow(t_sys_y - s_sys_y, 2)));
      var_ast0 = Math.abs(t_ast0 - s_ast0);
      var_ast1 = Math.abs(t_ast1 - s_ast1);

      if (var_gal) {
        if (t_gal1 == s_gal1) distance = var_gal * 200;
        if (t_gal1 > s_gal1) distance = (9 - s_gal2) * 200 + 2000 + t_gal2 * 200;
        if (t_gal1 < s_gal1) distance = s_gal2 * 200 + 2000 + (9 - t_gal2) * 200;
      } else {
        if (var_sys) distance = var_sys;
        else {
          if (var_ast0) distance = var_ast0 / 5;
          else distance = 0.1;
        }
      }

      if (start == destination) distance = 0;

      gHints.DistCache[cord1 + destination] = distance;

      return distance;
    } catch (e) {
      lg.debug(e, 'Error in gHints.CalcDistance', {
        stack: true
      });
    }
  }

  this.DistFunc = function (args) {
    try {
      var a = args.getString(0);
      var b = args.getString(1);
      var dist = gHints.CalcDistance(a, b);
      return dist;
    } catch (e) {
      lg.debug(e, 'Error in DistFunc');
      gHints.log('DistFunc' + e.lineNumber);
    }
  }
}
