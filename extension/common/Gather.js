// Gather them prods up and move em out

var Gather = function() {

  this.gIgnore = false;

  this.log = function(msg) {
    lg.log('gTh:' + msg);
  }

  this.Fillall = function(index) {
    var lbl = $('#SHLBL' + index);
    var rows = $('#FleetStats tr:gt(0)');
    rows.each(function() {
      var inp = $('td:eq(' + index + ') input', this);
      inp.trigger('dblclick');
    });
  }

  this.sindex = 1;

  this.GatherUIAction = function() {
    try {
      $('#inpUI').hide();
      var lindex = gTh.sindex + 19;
      $('#FleetStats tr:eq(0) th:gt(' + gTh.sindex + ')').each(function() {
        var t = $(this).html();
        var sh = $(this).text();

        if (sh == 'Size') return;

        var row = $(this).parent();
        var index = $('th:gt(' + gTh.sindex + '):lt(' + lindex + ')', row).index(this);
        var pos = index + gTh.sindex + 1;

        var t = '<label title="Double click to fill all this column" ' +
          'class="dsis" id="SHLBL' + pos + '" >' + t + '</label>';

        var radio = '<br/><input name="bFavor" id="bFavor" type="radio" value="' + pos + '" ' +
          'title="Click to load these in hangers FIRST"/>';
        if (pos < 6) t += radio;
        $(this).html(t);
        $('#SHLBL' + pos).dblclick(function() {
          gTh.Fillall(pos);
        });
      });
      var radios = $('input:radio[name="bFavor"]');
      if (radios.is(':checked') === false) {
        radios.filter('[value="2"]').attr('checked', true);
      }
      $('#FleetStats tr:gt(0)').each(function() {
        var fleetA = $('td:eq(0) a', this);
        if (gTh.sindex == 2 && fleetA.length == 0) {
          return;
        }
        var fleetId = $(fleetA).attr('href').match(/\d+/)[0];
        // var gTh.sindex = 1;
        var destCell = $('td:eq(' + gTh.sindex + ')', this);
        var dest = destCell.text();
        var dmatch = dest.match(/Move/);
        // make sure aebits not a base named Move
        if (dmatch) dmatch = dest.match(/Attack/);
        var transitCell = $('td:eq(' + gTh.sindex + ') small', this);
        var tmatch = transitCell.text().match(/In transit/);
        if (gTh.sindex == 1 && (dmatch || tmatch)) {
          gTh.sindex = 2;
          destCell = $('td:eq(' + gTh.sindex + ')', this);
          dest = destCell.text();
        }

        if (gTh.sindex == 2) {
          var abcell = $('td:eq(0)', this);
          var abt = abcell.text();
          if (abt.match(/Mobile Fleets/)) return;
        }
        if (dest.match(/\*$/)) return; // skip fleets in flight
        var destA = $('td:eq(' + gTh.sindex + ') a', this);
        var destCell = $('td:eq(' + gTh.sindex + ')', this);
        var loc = $(destA).attr('href').match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)[0];
        var htxt = $(destA).text();
        if (!htxt.match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)) {
          htxt = htxt + '(' + loc + ')';
        }
        $(destA).text(htxt);
        var h = destCell.html();
        var tbody = $(this).parent();
        var ridx = $(this).prevAll().length;
        // LOCAL PORT: the angeldsis.com icon is gone; use an inline glyph.
        h += '<span class="IDL" id="IDL' + ridx + '" ' +
          'title="Click this to add a custom destination for this fleet" ' +
          'style="cursor:pointer;display:inline-block;width:20px;text-align:center;">&#x2316;</span>';
        destCell.html(h);
        $('#IDL' + ridx).click(function() {
          gTh.GetDest(ridx, fleetId);
        });

        $('td:gt(' + gTh.sindex + '):lt(' + lindex + ')', this).each(function() {
          var row = $(this).parent();
          var index = $('td:gt(' + gTh.sindex + '):lt(' + lindex + ')', row).index(this);
          gTh.CellUI(this, index, gTh.sindex);
        });
      });

      // add row to FleetStats
      var nrow = '<tr><td colspan="22"><table class="dsis"><tbody>' +
        '<tr><td>Destination</td><td><input style="width: 80px;" class="dsis fleetDest Location" type="text" id="fleetDest"/></td>' +
        '<td><input class="dsis"  type="button" value="Fill Hangers" ' +
        'id="btnGFillHangers"/></td>' +
        '</td><td><input class="dsis"  type="button" value="Submit" ' +
        'id="btnDoGather"/></td>' +
        '</tr>' +
        '<tr><td><a href="#" id="gMJgSearchClosest">Closest</a></td>' +
        '<td><a href="#" id="gMJgSearchFastest">Fastest</a></td>' +
        '<td>&nbsp;</td>' +
        '<tr><td colspan="3"><label class="dsis" id="LJGDfleetDest"></label></td></tr>' +
        '</tr></tbody></table></td></tr>';

      $('#FleetStats').append(nrow);
      $('#btnGFillHangers').click(function() {
        gTh.FillHangers();
      });
      $('#btnDoGather').click(function() {
        gTh.DoGather();
      });
      $('#gMJgSearchClosest').click(function() {
        gTh.MJgSearch('closest');
      });
      $('#gMJgSearchFastest').click(function() {
        gTh.MJgSearch('fastest');
      });

      var tbl = $('#FleetStats table:eq(0)');

      fastloc = gTh.Fastloc;

      $('#fleetDest').click(function() {
        gFleetDest = 'fleetDest';
        $(this).css('background-color', 'green');
      });
      $('.fleetDest').blur(function() {
        $(this).css('background-color', 'blue');
      });

      $('#btnGather').hide();
      $('#btnReset').show();

    } catch (e) {
      lg.debug(e, 'Error in gTh.GatherUIAction', {
        stack: true
      });
    }
  }

  this.CellUI = function(cell, index, sindex) {
    try {
      if (this.gIgnore) {
        this.gIgnore = false;
        return;
      }
      var txt = $(cell).text();
      // debug('Cell:' + txt + '/index:' + index);
      if (txt == '') return;
      txt = parseInt(gTh.ReplaceAll(txt, ',', ''));

      $('small', cell).remove();
      $(cell).unbind('click');
      var f = $(cell).parent();
      var ftd = $('td:eq(0)', f);
      var loc = $('td:eq(' + sindex + ')', f).html().match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)[0];

      var fa = $('a', ftd).attr('href');
      var fleetId = fa.match(/\d+/)[0];
      var id = 'inpF_SH' + index + '_FL' + fleetId;
      var avhangers = (ships.ShipTypes[index].hangers > 0) ? parseInt(txt) * ships.ShipTypes[index].hangers : 0;

      /*
       * fleet id = inpF_SH[shiptypeindex]_FL+fleetid NU + id == starting
       * value/not used - visible OR + id == orig value, never changes,
       * used to reset UH + id == used hangers AH + id == avail hangers -
       * never changes id is text input
       *
       * inp.val() = OR - NU always UH <= AH always
       */

      var html = '<label id="NU' + id + '" >' + txt + '</label>' +
        '<input title="Double click to select entire amount" class="INPF dsis shinp" id="' +
        id + '" type="text" size="5" value="0"/>' + '<input class="dsis"  id="OR' +
        id + '" type="hidden" value="' + txt + '"/>' + '<input class="dsis"  id="UH' +
        id + '" type="hidden" value="0"/>' + '<input class="dsis"  id="AH' +
        id + '" type="hidden" value="' + avhangers + '"/>';
      $(cell).append(html);
      $('#' + id).css('background-color', 'blue').css('color', 'white');

      $('#' + id).change(function() {
        if ($(this).val() > 0 - 0) $(this).css('background-color', 'green').css('color', 'white');
        else
          $(this).css('background-color', 'blue').css('color', 'white');

        var val = $(this).val();
        if (val < 0) {
          $(this).val(0);
          return;
        }
        var id = $(this).attr('id');
        var Hval = $('#OR' + id).val();
        // check for valid number
        if (!((val - 0) == val && val.length > 0)) {
          alert('You must enter a number');
          $('#' + id).val(0);
          $('#NU' + id).text(Hval);
          return;
        }
        // check for number in bounds
        if (val - 0 > Hval - 0) {
          alert('Not that many available');
          $('#' + id).val(0);
          $('#NU' + id).text(Hval);
          return;
        }
        var fval = Hval - val - 0;
        fval = (fval - 0 < 0) ? 0 : fval;
        $('#NU' + id).text(fval);
        // $('#O' + id).val(Hval - val);
      });
      $('#' + id).click(function() {
        $(this).select();
      });
      $('#' + id).dblclick(function() {
        var id = $(this).attr('id');
        $(this).val($('#NU' + id).text());
        $(this).select();
        $(this).trigger('change');
      });
    } catch (e) {
      lg.debug(e, 'Error in gTh.CellUI', {
        stack: true
      });
    }

  }

  this.MJgSearch = function(method) {
    try {
      var destC = $('#fleetDest');
      var dest = destC.val().toUpperCase();

      var start = dest;

      dsisReq.MakeRequest({
        request: {
          mode: "jg_search",
          sloc: start,
          dloc: dest,
          method: method,
          sendingPlayerId: emF.GmServer.playerId,
          universeId: 'z'
        }
      }, emF.GmServer.DsisServers[0], function(data) {
        data = data.data;
        if (data.result != dest && data.result != start) {
          $('#fleetDest').val(data.result).css('background-color', '#008800').css('color', 'white');
          $('#LJGDfleetDest').text(data.jgDetails);
        } else
          $('#LJGDfleetDest').css('background-color', '#880000').css('color', 'white');

        $('#fleetDest').focus();

      });
      return;
    } catch (e) {
      lg.debug(e, 'Error in gTh.MJgSearch', {
        stack: true
      });
    }
  }

  this.Fastloc = function(loc) {
    $('#' + gFleetDest).val(loc);
  }

  this.gFleetDest = 'fleetDest';

  this.GetDest = function(ridx, fleetId) {
    try {
      //ridx++;
      var row = $('#FleetStats tr:eq(' + ridx + ')');
      var imgid = '#IDL' + (ridx);// - 1);
      $(imgid).remove();
      var destCell = $('td:eq(' + gTh.sindex + ')', row);
      var h = $(destCell).html() + 'Dest:<input style="width: 80px;" class="Location fleetDest dsis" type="text" id="LDEST' + fleetId + '" />';
      $(destCell).html(h);
      $('#LDEST' + fleetId).click(function() {
        gFleetDest = 'LDEST' + fleetId;
        $(this).css('background-color', 'green');
      });

      var curlocA = $('td:eq(' + gTh.sindex + ') a:eq(0)', row);
      var startC = $(curlocA);
      var startA = startC.attr('href');
      var start = startA.match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)[0];

      var cid = 'fJGC' + fleetId;
      var fid = 'fJGF' + fleetId;
      var lbl = 'LJGD' + fleetId;
      var inp = 'LDEST' + fleetId
      $('#' + inp).select().parent().append("<br>Find JG: <a href='#' id='" + cid + "'>Closest</a> |" +
        "<a href='#' id='" + fid + "'>Fastest</a>" + " :: <label id='" + lbl + "'>Details</label>");

      $('#LDEST' + fleetId).val(start);

      $('#' + cid).click(function() {
        gTh.JgSearch('closest', start, fleetId);
        return false;
      });
      $('#' + fid).click(function() {
        gTh.JgSearch('fastest', start, fleetId);
        return false;
      });

      $('.fleetDest').blur(function() {
        $(this).css('background-color', 'blue');
      });
    } catch (e) {
      lg.debug(e, 'Error in gTh.GetDest', {
        stack: true
      });
    }
  }

  this.JgSearch = function(method, start, fleetId) {
    try {
      var destC = $('#LDEST' + fleetId);
      var dest = destC.val();

      dsisReq.MakeRequest({
        request: {
          mode: "jg_search",
          sloc: start,
          dloc: dest,
          method: method,
          sendingPlayerId: emF.GmServer.playerId,
          universeId: 'z'
        }
      }, emF.GmServer.DsisServers[0], function(data) {
        data = data.data;
        if (data.result != dest && data.result != start) {
          $('#LDEST' + fleetId).val(data.result).css('background-color', '#008800').css('color', 'white');
          $('#LJGD' + fleetId).text(data.jgDetails);
        } else
          $('#LDEST' + fleetId).css('background-color', '#880000').css('color', 'white');
      });
    } catch (e) {
      lg.debug(e, 'Error in gTh.JgSearch', {
        stack: true
      });
    }
  }

  this.FillHangers = function() {
    try {
      $('#FleetStats tr:gt(0) input[id^="inpF"]').each(
        function() {
          if ($(this).attr('type') == 'hidden') return;

          var id = $(this).attr('id');
          var shIndex = id.match(/SH(\d+)/)[1];
          var fleetId = id.match(/FL(\d+)/)[1];

          var ship = ships.ShipTypes[shIndex];
          if (typeof ship == 'undefined') return;
          if (ship.hangers == 0) return;

          var shipsToMove = parseInt($(this).val());
          if (shipsToMove == 0) return;
          var totHangers = $('#AH' + id).val();
          var usedHangers = $('#UH' + id).val();
          var availHangers = (ship.hangers * shipsToMove) - usedHangers;
          if (availHangers < 1) return;
          var favor = parseInt($('input[name="bFavor"]:checked').val()) - 2;

          // handle favored hanger unit first
          usedHangers = gTh.GetUsedHangers(id, ship, fleetId, shipsToMove, availHangers, favor);
          $('#UH' + id).val(usedHangers);
          availHangers = availHangers - usedHangers;
          if (availHangers < 1) return;

          // loop thru ft/bo/hb/ib
          for (var s = 0; s < 4; s++) {
            if (s == favor) continue;
            usedHangers = gTh.GetUsedHangers(id, ship, fleetId, shipsToMove, availHangers, s);
            availHangers = availHangers - usedHangers;

            if (availHangers < 1) {
              gTh.log('Out of hangers');
              return;
            }
          }
        });
    } catch (e) {
      lg.debug(e, 'Error in gTh.FillHangers', {
        stack: true
      });
    }
  }

  this.IsNumeric = function(input) {
    return (input - 0) == input && input.length > 0;
  }

  this.GetUsedHangers = function(caId, caShip, caFleetId, toMove, availHangers, shipType) {
    var ship = ships.ShipTypes[shipType];
    var hangerFactor = Math.abs(ship.hangers);
    var fbValInput = $('#inpF_SH' + shipType + '_FL' + caFleetId);
    var fbNotUsedLabel = $('#NUinpF_SH' + shipType + '_FL' + caFleetId);
    var fbUsed = (gTh.IsNumeric(fbValInput.val())) ? parseInt(fbValInput.val()) : 0;
    var fbMax = (gTh.IsNumeric($('#ORinpF_SH' + shipType + '_FL' + caFleetId).val())) ? parseInt($('#ORinpF_SH' + shipType + '_FL' + caFleetId).val()) : 0;
    var fbAvail = fbMax - fbUsed;
    if (fbAvail == 0) return 0;

    var willHold = availHangers / hangerFactor;
    var fbTake = (willHold >= fbAvail) ? fbAvail : willHold;

    // update fb
    fbValInput.val(fbUsed + fbTake);
    fbNotUsedLabel.text(fbMax - fbUsed - fbTake);
    var newUsed = fbTake * hangerFactor;
    return newUsed;
  }

  this.gFleetList = [];
  this.gFleetIndex = 0;

  this.DoGather = function() {
    try {
      var maindest = $('#fleetDest').val();
      var gates = null; //bridge.get_gates();
      $('tr input[id*="FL' + '"][id^="inpF"][value!="0"]').css('background-color', 'blue');
      $('label').css('background-color', 'black').css('color', 'white');
      var rows = $('.FleetRow');
      gTh.gFleetIndex = 0;
      gTh.gFleetList = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var row = $(r);
        if (gTh.sindex == 2) {
          var abcell = $('td:eq(0)', row);
          var abt = abcell.text();
          if (abt.match(/Mobile/) || abt.match('In transit') || abt.match('Total')) continue;
        }
        var lhtml = row.html();
        //gTh.log('row:' + i + ', maxrows=' + rows.length);
        var loc = lhtml.match(/[A-Z]\d\d\:\d\d\:\d\d\:\d\d/)[0];

        var hasGate = true;

        // make sure landed
        var dest = $('td:eq(' + gTh.sindex + ')', row).text();
        if (dest.match(/\*$/)) continue; // skip fleets in flight
        // make sure not last row
        var last = $('td table tbody', row);
        if (last.length) continue;

        // make sure some are selected
        var inputs = $('.INPF', row);
        if (inputs.length == 0) continue;
        var shipList = [];
        for (var s = 0; s < inputs.length; s++) {
          var sh = {
            ship: null,
            amount: 0
          };

          var inp = inputs[s];
          var num = $(inp).val();

          if (num == 0) continue;
          gTh.log('id:' + inp.id + ', val:' + num);

          var fid = $(inp).attr('id');
          var shIndex = fid.match(/SH(\d+)/)[1];

          var fleetId = fid.match(/FL(\d+)/)[1];
          sh.ship = ships.ShipTypes[shIndex];

          var ndcell = $('#LDEST' + fleetId);
          var curloc = loc;
          var ndest = loc;
          if (ndcell.length > 0) ndest = ndcell.val();
          // see if this ship needs a gate, not checking ft,bo,hb,ib
          if (shIndex > 3) {
            var locGal = ndest.substring(0, 3);
            var destGal = dest.substring(0, 3);
          }
          sh.amount = num;
          shipList.push(sh);
        }
        if (maindest == ndest || shipList.length == 0) continue;

        var fleet = {
          fleetId: fleetId,
          shipList: shipList,
          dest: ndest,
          loc: curloc
        };
        gTh.gFleetList.push(fleet);
      }
      gTh.DisplayStatus('Got fleet data.. Processing');
      gTh.ProcessGather();
    } catch (e) {
      lg.debug(e, 'Error in gTh.DoGather', {
        stack: true
      });
    }
  }

  this.DisplayStatus = function(message) {
    try {

      $(".GatherStatus").append('<div class="container mstatus"><div class="row">'
          + '<div class="xs-col-12">'
          + message + '</div></div></div>').css('color', 'yellow').show();
      window.setTimeout(function() {
        $('.mstatus:first').remove();
        var l = $('.mstatus');
        if(l.length == 0) $('.GatherStatus').hide();
      }, 5000);
    } catch (e) {
      lg.debug(e, 'Error in DisplayStatus:', {
        stack: true
      });
    }
  }

  this.ReplaceAll = function(txt, replace, with_this) {
    return txt.replace(new RegExp(replace, 'g'), with_this);
  }

  this.gFleetList = [];
  this.gFleetIndex = 0;

  this.ProcessGather = function() {
    try {
      //ctF.DisplayStatus('Processing Gather Fleets');
      if (gTh.gFleetIndex < gTh.gFleetList.length) {
        gTh.DisplayStatus('Sending a fleet:' + gTh.gFleetList[gTh.gFleetIndex].fleetId);
        gTh.log('Sending a fleet:' + gTh.gFleetList[gTh.gFleetIndex].fleetId);
        var fleet = gTh.gFleetList[gTh.gFleetIndex];
        gTh.gFleetIndex++;
        gTh.SendFleet(fleet);
        return;
      }
      gTh.DisplayStatus('Gather: Completed');
      gTh.log('Gather: Completed');
      $('#btnReset').trigger('click');
    } catch (e) {
      lg.debug(e, 'Error in gTh.ProcessGather', {
        stack: true
      });
    }
  }


  this.SendFleetContent = function(fleet, callback) {
    try {
      var fleetMovePage = function(url) {
        ctF.DoGetAE(url, function(msg) {
          var form = $(msg).find('form[method=post]');
          if (form.length == 0) {
            ctF.DisplayStatus('Gather:No move form, not supposed to happen');
            gTh.log(msg);
            return;
          }
          var post_url = form.attr('action');
          var inputs = form.find('input');
          var data = {};
          for (var i = 0; i < inputs.length; i++) {
            var input = inputs.eq(i);
            if (input.attr('name') != '') data[input.attr('name')] = input.attr('value');
          }
          for (var s = 0; s < fleet.shipList.length; s++) {
            var sh = fleet.shipList[s];
            var row = form.find('tr:contains(' + sh.ship.name + ')');
            if (row.length == 0) ctF.DisplayStatus('No ship:' + sh.ship.name);
            else {
              var input = row.find('input');
              if (input.length > 0) {
                data[input.attr('name')] = sh.amount;
              }
            }
          }
          data['destination'] = fleet.destination;
          ctF.DoGetAE(post_url, function(msg) {
            var status = 'Sent';
            var m = $(msg);
            var t = m.filter(':contains(Fleet movement started)');
            var noMore = m.filter(':contains(You have reached the maximum number of campaign fleets)');
            if (noMore.length) {
              ctF.DisplayStatus('Sending unsuccessful - out of fleets');
              status = 'FAIL out of fleets';
            }

            if (t.length > 0) ctF.DisplayStatus('Fleet sent');
            var data = {
              status: status,
              fleetId: fleet.fleetId
            }
            econs.CallBack(callback, data);

          }, undefined, data);

        });
      };
      // build url
      var url = 'fleet.aspx?fleet=' + fleet.fleetId + '&view=move';
      fleetMovePage(url, callback);

    } catch (e) {
      lg.debug(e, 'Error in gTh.SendFleetContent', {
        stack: true
      });
    }
  }

  this.SendFleet = function(fleet) {
    try {
      var coords = $('#fleetDest').val();
      if (fleet.loc != fleet.dest) coords = fleet.dest;
      fleet.destination = coords;
      gTh.DisplayStatus('Moving fleet ' + fleet.fleetId + ' to ' + coords);

      chrome.tabs.sendMessage(emF.CurrentTab.id, new Message('content', 'MoveFleet', {
        from: 'EmpireFleet',
        destination: coords,
        fleet: fleet
      }));
    } catch (e) {
      lg.debug(e, 'Error in gTh.SendFleet', {
        stack: true
      });
    }
  }

  this.FleetSent = function (data) {
    try {
      // update page
      var inputs = $('tr .INPF[id*="FL' + data.fleetId + '"]');
      if (inputs.length > 0) {
        for (var s = 0; s < inputs.length; s++) {
          var inp = inputs[s];
          if($(inp).val() == 0) continue;
          var fid = $(inp).attr('id');
          var lbl = $('#NU' + fid);
          if ($(lbl).text() - 0 == 0) {
            $(inp).remove();
          } else
            $(inp).val('0');

          $(lbl).css('background-color', 'cyan');
          $(lbl).css('color', 'black');
        }
      }
      gTh.DisplayStatus('Fleet Move Status:' + data.status);
      // check status
      if (data.status.toLowerCase().includes('sent')) {
        gTh.log('Sent, looping');
        gTh.ProcessGather();
      } else {
        gTh.DisplayStatus('Send Failed:' + data.status);
        throw new Error('Send Failed:' + data.status);
      }
      gIgnore = false;
    } catch (e) {
      lg.debug(e, 'Error in gTh.FleetSent', {
        stack: true
      });
    }
  }

  this.ResetCell = function(id) {
    try {
      var cell = $('#' + id).parent();
      var txt = $('#' + id).val();
      cell.append('<small>' + txt + '</small>');
      var index = $('#' + id).attr('id').match(/SH(\d+)/)[1];
      $('#' + id).remove();
      $('#lbl' + id).remove();
      $('#NU' + id).remove();
      gIgnore = true;
      cell.click(function() {
        gCellOnclick(this, index);
      });
    } catch (e) {
      lg.debug(e, 'error', {
        stack: true
      });
    }
  }
}
