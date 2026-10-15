// all in page UI changes

var PageUI = function () {
  this.log = function (msg) {
    lg.log("UI:" + msg);
  };

  this.UpdatePage = function (msg) {
    try {
      var args = msg.actionArgs;
      if (args.page != "empire") {
        var em = $("#empire_menu");
        if (em.length == 0) $("table.top").after(this.EmpireMenu);
      }
      switch (args.page) {
        case "fleet":
          if (args.subPage == "") {
            var locs = pageUI.Fleets(args);
            if (locs.length > 0 && GmServer.DsisServers.length > 0) {
              pageUI.GetGates(locs);
            }
          }
          break;
        case "empire":
          // get new copy of empire_menu
          this.EmpireMenu = $("#empire_menu").html();
          if (args.subPage == "production") {
            this.MassProdHelper();
          }
          break;
      }
    } catch (e) {
      lg.debug(e, "Error in SendProfileSummary:", {
        stack: true,
      });
    }
  };

  this.MassProdHelper = function () {
    var row1 = document.getElementById("row1");
    var tfoot = row1.parentNode.nextSibling;
    var select = row1.getElementsByTagName("select")[0];
    var options = select.getElementsByTagName("option");
    var ship_types = new Array();

    for (var x = 0; x < options.length; x++) {
      ship_types[ship_types.length] = options[x].value;
    }

    var handler = function (e) {
      try {
        pageUI.MassChangeHandler(e);
      } catch (err) {
        lg.debug(err, "MassProdHelper.handler");
      }
    };

    this.MassAddExtraRow(tfoot, "IDLE Bases", ship_types, handler, "idle");
  };

  this.MassChangeHandler = function (e) {
    try {
      var target = e.target;
      var ev;
      var doc = document;

      if (target.id.indexOf("select_") == 0) {
        ev = document.createEvent("Events");
        ev.initEvent("change", true, false);
      }
      //else { // (target.id.indexOf('count_') == 0) {
      // ev = document.createEvent('KeyboardEvent');
      // ev.initKeyEvent('keyup', true, false, null, false, false, false, false, 0, 0);
      //}
      var every = false;
      if (target.id.indexOf("every") != -1) every = true;
      debug(target.id);

      var x = 1;
      var select;
      while ((select = document.getElementById("select_" + x))) {
        if (target.id.indexOf("select_") == 0) {
          select.value = target.value;
          if (select.value == target.value) {
            select.dispatchEvent(ev);
            //var count = doc.getElementById('quant_'+x);
            //count.value =
          }
        }
        if (target.id.indexOf("count_") == 0) {
          var timer = document.getElementById("timer" + x);
          if (timer.getAttribute("sorttable_customkey") == null)
            timer = timer.parentNode;
          debug(timer.getAttribute("sorttable_customkey"));
          var count = document.getElementById("quant_" + x);

          if (
            (every == false &&
              timer.getAttribute("sorttable_customkey") == 0) ||
            every == true
          ) {
            debug(count.tagName);
            count.value = target.value;
            count.dispatchEvent(ev);
          }
        }
        //debug(x);
        x++;
      }
    } catch (e) {
      lg.debug(e, "MassChangeHandler");
    }
  };

  this.MassAddExtraRow = function (tfoot, title, ship_types, handler, id) {
    var doc = document;
    var hr =
      '<tr style="text-align: right;"><td></td><td></td><td>' +
      title +
      "</td>" +
      '<td><select id="select_' +
      id +
      '" >';

    for (var x = 0; x < ship_types.length; x++) {
      hr +=
        '<option value="' + ship_types[x] + '">' + ship_types[x] + "</option>";
    }
    hr +=
      "</select></td>" +
      '<td><input type="text" class="input-numeric" id="count_' +
      id +
      '" size="6" maxlength="6"/></td>' +
      "<td></td>" +
      "<td></td>" +
      "<td></td>" +
      "<td></td></tr>";
    $(tfoot).prepend(hr);

    $("#select_" + id).change(handler);
    $("#count_" + id).keyup(handler);
  };

  this.GetGates = function (locs) {
    try {
      var req = {
        request: {
          mode: "getGuildGates",
          locs: locs,
          universeId: "z",
          sendingPlayerId: ctG.SendingPlayerId,
        },
      };
      dsisReq.MakeRequest(req, GmServer.DsisServers[0], function (response) {
        var r = response.data;
        // put gates on page
        // got nick, guildTag, baseId, location, commander, jumpGate
        var rows = r.bases;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          $("table#fleets-list")
            .find('a[href*="loc=' + row.location + '"]')
            .each(function () {
              var h =
                '<span title="' +
                row.nick +
                "[" +
                row.guildTag +
                ']">' +
                "&nbsp;[" +
                row.jumpGate +
                "]";
              $(this).parent().append(h);
            });
        }
      });
    } catch (e) {
      lg.debug(e, "Error in SendProfileSummary:", {
        stack: true,
      });
    }
  };

  this.Fleets = function (args) {
    try {
      var mv = $('a[href*="view=move"]');
      if (mv.length > 0) return;

      var url = window.location.href;
      var tb = $("table#fleets-list");
      var fr = $("tr:eq(1)", tb);
      var tbl = fr.find("table");
      var rows = $("tr:gt(0)", tbl);
      var locs = [];
      $("tr:gt(0)", tbl).each(function () {
        var row = $(this);
        var td1 = $("td:eq(0)", row);
        var alink = td1.find("a");
        var href = alink.attr("href");
        var fleetId = href.match(/fleet=(\d+)/)[1];
        var h =
          '&nbsp;<a href="' +
          url +
          "?fleet=" +
          fleetId +
          '&view=move">[M]</a>' +
          '/<a href="' +
          url +
          "?fleet=" +
          fleetId +
          '&view=attack">[A]</a>';
        td1.append(h);
        var td2 = $("td:eq(1)", row);
        alink = td2.find("a");
        href = alink.attr("href");
        var loc = href.match(/loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/)[1];
        locs.push(loc);
        var td3 = $("td:eq(2)", row);
        alink = td3.find("a");
        if (alink.length == 1) {
          href = alink.attr("href");
          var dest = href.match(/loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/)[1];
          locs.push(dest);
        }
      });
      return "'" + locs.join("','") + "'";
    } catch (e) {
      lg.debug(e, "Error in pageUI.Fleets", {
        details: {
          href: window.location.href,
        },
      });
    }
  };

  this.EmpireMenu =
    '<br/><table id="empire_menu" class="header" width="1024" height="25" align="center"><tbody><tr><th id="empire-events" width="10%"><a href="empire.aspx?view=bases_events">Events</a></th><th id="empire-production" width="10%"><a href="empire.aspx?view=bases_production">Production</a></th><th id="empire-economy" width="10%"><a href="empire.aspx?view=economy">Economy</a></th><th id="empire-trade" width="10%"><a href="empire.aspx?view=trade">Trade</a></th><th id="empire-reports" width="10%"><a href="report.aspx">Reports</a></th></tr><tr><th id="empire-capacities" width="10%"><a href="empire.aspx?view=bases_capacities">Capacities</a></th><th id="empire-structures" width="10%"><a href="empire.aspx?view=structures">Structures</a></th><th id="empire-fleets" width="10%"><a href="empire.aspx?view=fleets">Fleets</a></th><th id="empire-units" width="10%"><a href="empire.aspx?view=units">Units</a></th><th id="empire-technologies" width="*"><a href="empire.aspx?view=technologies">Technologies</a></th></tr></tbody></table>';
};
