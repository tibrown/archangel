/*
 * Root of the gm content code
 */

var lg = new Logger(chrome.runtime.getManifest().version);
var comms = new ctComms();
var ctG = new ctGlobals();
var econs = new eConstants(true);
var prefs = new Preferences();
var parse = new Parser();
var pageUI = new PageUI();
var cPool = new ConnectionPool(1, prefs.ConnectionDelay);
var aScout = new AutoScouter();
var dsisReq = new DsisRequests();
var dsisU = new DsisUrl();
var sru = new ScoutRegionUtil();
var fStats = new FleetStats();
var ships = new Ships();
var gTh = new Gather();
var gates = new Gates();
var bHints = new BuildHints();
var gHints = new GateHints();
//var launcher = new Launcher();
var mail = new Mail();

//var bMark = new Bookmarks();
var spyDetect = new SpyDetect();

var GmServer = null;
var Player = null;
var ServerData = null;
var GmServerName = econs.GetGmServerNameFromUrl(window.location.href);
var pageParsed = 0;
var ServerTimeOffset = 0;
var AheadOfServerTime = false;

$(document).ready(function() {
  try {
    ctF.SetServerOffset();

    ctG.SendingPlayerId = $("#account")
      .next()
      .text();
    // send playerid and servername so btg can get the serverdata
    chrome.runtime.sendMessage(
      new Message("background", "HandShake", {
        SendingPlayerId: ctG.SendingPlayerId,
        ServerName: econs.GetGmServerNameFromUrl(window.location.href)
      })
    );

    //comms.ConnectToBG();
    // remove ad at top of page
    $("#advertising-left")
      .parent()
      .hide();

    // remove ad mid page, if any
    $('script[src*="show_ads.js"]')
      .parent()
      .hide();
  } catch (e) {
    lg.debug(e, "Error in Content.Ready:", {
      stack: true
    });
  }
});

chrome.runtime.onMessage.addListener(function(msg) {
  try {
    if (msg.target == "content") {
      if (msg.action == "HandShake") {
        ServerData = msg.actionArgs.ServerData;
        Player = msg.actionArgs.Player;
        ctF.InitFromServerData();
        comms.ConnectToBG(function(msg) {
          // var sp = new ErrorPacket(GmServer.servid, ctG.SendingPlayerId, 'none', 'Test');
          // ctF.SaveErrorPacket(sp);
        });
        return;
      }

      if (msg.action == "NODSIS") {
        ctF.log(
          msg.actionArgs.state.status + ":" + msg.actionArgs.state.message
        );
        ctF.DisplayStatus(
          "DSIS Problem:" +
            msg.actionArgs.state.status +
            ":" +
            msg.actionArgs.state.message
        );
        if (aScout.ActiveScout != null) {
          aScout.IsPaused = true;
          ctF.DisplayStatus("Scout Paused");
        }
        return;
      }

      if (msg.action == "SyncFromDb" || msg.action == "SyncToDb") {
        var r = window.confirm(msg.actionArgs.ConfirmText);
        if (!r) return;
        msg.target = "background";
        msg.actionArgs.GmServer = GmServer;
        comms.SendMessageToBG(msg);
        return;
      }

      if (msg.action == "DSISActive") {
        ServerData = msg.actionArgs.ServerData;
        prefs = ServerData.Preferences;

        GmServer = msg.actionArgs.gmServer;
        GmServer.playerId = ctG.SendingPlayerId;
        ServerData.GmServer = GmServer;

        ctF.log("DSIS Active");
        ctF.DisplayStatus("DSIS Active");

        return;
      }

      if (msg.action == "ScanGuildSystems") {
        var cluster = msg.actionArgs.Cluster;
        var galaxy = msg.actionArgs.Galaxy;
        aScout.ScanGuildSystems(cluster, galaxy, GmServer);
        return;
      }

      if (msg.action == "ScanList") {
        aScout.ScanList(msg.actionArgs.ListText, ctF.FlushUpload);
        return;
      }

      if (msg.action == "Launcher") {
        var mode = msg.actionArgs.Mode;
        var dstr = $("#duration").text();
        var lstr = msg.actionArgs.LaunchStr;
        launcher = new Launcher(dstr, msg.actionArgs.TimerType);
        if (mode == "Launch") launcher.SetLaunch(lstr);
        else if (mode == "Land") launcher.SetlaunchFromLanding(lstr);
        return;
      }

      if (msg.action == "UseRoute") {
        var dest = msg.actionArgs.RouteStart;
        $("#destination")
          .val(dest.location)
          .trigger("change");
        return;
      }

      if (msg.action == "SendFleets") {
        ctF.log("Got SendFleets from " + msg.actionArgs.from);
        fStats.GetEmpireFleets();
        return;
      }

      if (msg.action == "SendToGuild") {
        mail.SendPmsToList(
          msg.actionArgs.members,
          msg.actionArgs.body,
          function(status) {
            var m = new Message("background", msg.actionArgs.action, {
              Status: status
            });
            ctF.SendMessage(m);
          }
        );
        return;
      }

      if (msg.action == "SendGuild") {
        ctF.log("Got SendGuild from " + msg.actionArgs.from);
        ctF.GetGuildMembers(msg);
        return;
      }

      if (msg.action == "SendPM") {
        mail.SendPM(msg.actionArgs.playerId, msg.actionArgs.body, function(
          status
        ) {
          var m = new Message("background", msg.actionArgs.action, {
            Status: status
          });
          ctF.SendMessage(m);
        });
        return;
      }

      if (msg.action == "SendScanners") {
        ctF.log("Got SendScanners from " + msg.actionArgs.from);
        ctF.GetSuperScanners();
        return;
      }

      if (msg.action == "MoveFleet") {
        ctF.log("Got MoveFleet order from " + msg.actionArgs.from);
        gTh.SendFleetContent(msg.actionArgs.fleet, function(status) {
          var m = new Message("background", "CTXFleetMoved", {
            from: "content",
            status: status
          });
          chrome.runtime.sendMessage(m);
        });
      }

      if (msg.action == "SendPreferences") {
        var m = new Message(msg.actionArgs.target, "Preferences", {
          Preferences: prefs
        });
        ctF.SendMessage(m);
        return;
      }

      if (msg.action == "ResetAutoScout") {
        // user wants to get rid of current ActiveScout
        aScout.DeleteActiveScout();
        ctF.DisplayStatus("Active Scout Reset");
      }

      // this is called from tools-options
      if (msg.action == "UpdatePreferences") {
        // just update the prefs options would send
        // this is odd right now because we need global, or ext settings
        var oprefs = msg.actionArgs.Preferences;
        if (msg.actionArgs.from == "MiscOptions") {
          prefs.ConnectionDelay = oprefs.ConnectionDelay;
          prefs.Colors = oprefs.Colors;
        }
        if (msg.actionArgs.from == "ScoutOptions")
          prefs.Scouting = oprefs.Scouting;
        // update incase was changed
        aScout.maxScouts = prefs.Scouting.MaxScouts;
        if (aScout.ActiveScout != null) {
          aScout.ActiveScout.MaxScouts = prefs.Scouting.MaxScouts;
          aScout.ActiveScout.PickupStrays = prefs.Scouting.PickupStrays;
          aScout.ActiveScout.HandleStrays = prefs.Scouting.HandleStrays;
          aScout.SaveActiveScout();
        }
        ctF.SavePreferences();
        lg.log("Updated Preferences from:" + msg.actionArgs.Target);

        ct.PublicParsePage();
        return;
      }

      if (msg.action == "PauseScout") {
        // toggle paused flag
        aScout.PauseScout();
        return;
      }

      if (msg.action == "DisperseScouts") {
        var gal = ct.GetLocation();
        ctF.DisplayStatus("Scouting Galaxy:" + gal);
        aScout.GalaxyScout(
          msg.actionArgs.FleetGalaxy,
          gal,
          GmServer,
          ctF.FlushUpload
        );
        return;
      }

      if (msg.action == "HomeLz") {
        aScout.SetHomeLz(msg.actionArgs.HomeLz);
        ctF.DisplayStatus("LZ Changed:" + msg.actionArgs.HomeLz);
        return;
      }

      if (msg.action == "DisbandScouts") {
        aScout.SetDisbandScouts(msg.actionArgs.DisbandScouts);
        ctF.DisplayStatus(
          "Disband Scouts Setting Changed:" + msg.actionArgs.DisbandScouts
        );
        return;
      }

      if (msg.action == "GmServerUpdate") {
        lg.log("CT:Got GmServerUpdate Message");
        if (msg.actionArgs.gmServerName == GmServerName) {
          GmServer = msg.actionArgs.gmServer;
          GmServer.playerId = ctG.SendingPlayerId;
          lg.log("CT:GmServer Updated");
        }
        return;
      }

      if (msg.action == "SendUpdate") {
        ct.PublicParsePage();
        return;
      }

      // NotifyActiveTab come from sidebar, are sent when user clicks a link to run a function
      if (msg.action == "NotifyActiveTab") {
        if (msg.actionArgs.dTabData.GmServer) {
          GmServer = msg.actionArgs.dTabData.GmServer;
          GmServer.playerId = ctG.SendingPlayerId;
        }
        if (msg.actionArgs.actionType == "MenuItemSelected") {
          switch (msg.actionArgs.menuItem) {
            case "ScanOccupiedRegions":
              aScout.ScanOccRegions(ctF.FlushUpload);
              break;
            case "ScanBaseRegions":
              aScout.BaseRegions(ctF.FlushUpload);
              break;
            case "ClosestGate":
              gates.GetClosest();
              break;
            case "FastestGate":
              gates.GetFastest();
              break;
            case "GetRoute":
              var dest = $("#destination").val();
              if (dest.match(/[A-Z]\d\d:\d\d:\d\d:\d\d/)) {
                gHints.GetGates(function(data) {
                  var result = gates.GetRoute();
                  if (result.details.length == 0) {
                    ct.log("No route");
                    return;
                  }

                  chrome.runtime.sendMessage(
                    new Message("sidebar", "DisplayRoute", {
                      Result: result
                    })
                  );
                });
              }
              break;
            case "UpdateSidebar":
              ct.PublicParsePage();
              break;
            case "SeedGalaxy":
              var gal = ct.GetLocation();
              ctF.DisplayStatus("Seeding Galaxy:" + gal);
              aScout.Galaxy(gal, GmServer, ctF.FlushUpload, true);
              break;
            case "ParseFleetDetails":
              // mail.SendPM(2537, 'Sent from Archangel like a boss!', function(data) {
              //   ctF.DisplayStatus('Mail Sent:' + data);
              // });
              // return;
              var loc = "";
              var a = $('a[href*="loc="]');
              if (a.length > 1) {
                a = $('a:contains("System")');
                loc = a.attr("href").match(/([A-Z]\d\d:\d\d:\d\d)/)[1];
              } else loc = a.text().match(/([A-Z]\d\d:\d\d:\d\d)/)[1];

              ctF.DisplayStatus("Parsing System for Fleet Detail:" + loc);
              aScout.System(loc, ctF.FlushUpload);
              break;
            case "ParseSystem":
              var loc = ct.GetLocation();
              ctF.DisplayStatus("Parsing System:" + loc);
              aScout.System(loc, ctF.FlushUpload);
              break;
            case "ParseRegion":
              var loc = ct.GetLocation();
              var r = new Region(loc);
              ctF.DisplayStatus("Parsing Region:" + loc);
              aScout.Region(r, ctF.FlushUpload);
              break;
            case "ContinueScout":
              var gal = ct.GetLocation();
              ctF.DisplayStatus("Continuing Scout of Galaxy:" + gal);
              aScout.ScoutTillDone(gal, GmServer, ctF.FlushUpload);
              break;
            case "ScanRegionsWithFleet":
              aScout.RegionsWithFleet(ctF.FlushUpload);
              break;
            default:
              ctF.DisplayStatus(
                "Menu Item:" + msg.actionArgs.menuItem + " not implemented yet"
              );
              break;
          }
        }
      }
    }
  } catch (e) {
    lg.debug(e, "Error in content.OnMessage:", {
      stack: true
    });
  }
});

var ctF = new ctFuncs();

// functions used in this file
var ct = {
  // call when on base structures page
  SetBuildHints: function() {
    try {
      var Structure = function(
        key,
        name,
        comment,
        cost,
        energy,
        economy,
        time
      ) {
        this.Key = key;
        this.Name = name;
        this.Comment = comment;
        this.Cost = parseInt(cost.replace(",", "").replace("+", ""));
        this.Energy = parseInt(energy.replace("+", ""));
        this.Economy = parseInt(economy.replace("+", ""));
        this.Time = time;
        this.Fert = 0;
        this.Gain = 0;
        this.CostPerUnit = 0;

        // calculater cost per unit - basic
        switch (this.Key) {
          case "urban-structures":
            this.Fert = this.Comment.match(/\((\d)\)/)[1];
            this.Fert = parseInt(this.Fert);
            this.CostPerUnit = this.Cost / this.Fert;
            this.Gain = this.Fert;
            break;
          case "orbital-base":
            this.CostPerUnit = parseInt(this.Cost) / parseInt(10);
            this.Gain = 10;
            break;
          case "solar-plants":
          case "gas-plants":
          case "fusion-plants":
          case "antimatter-plants":
          case "orbital-plants":
            this.CostPerUnit = this.Cost / this.Energy;
            this.Gain = this.Energy;
            break;
          case "terraform":
            this.CostPerUnit = this.Cost / 5;
            this.Gain = 5;
            break;
          case "multi-level-platforms":
            this.CostPerUnit = this.Cost / 10;
            this.Gain = 10;
            break;
        }
        this.GetTaxRate = function() {
          return this.Cost / this.Gain;
        };
      };
      var Hints = function() {
        this.PopulationStructures = ["Urban Structures", "Orbital Base"];
        this.EnergyStructures = [
          "Solar Plants",
          "Gas Plants",
          "Fusion Plants",
          "Antimatter Plants",
          "Orbital Plants"
        ];
        this.AreaStructures = ["Terraform", "Multi-Level Platforms"];
        this.Structures = [];

        // base stats
        this.Population = 0;
        this.MaxPopulation = 0;
        this.Energy = 0;
        this.MaxEnergy = 0;
        this.Area = 0;
        this.MaxArea = 0;

        // tax offset
        this.AreaTax = 0;
        this.PopulationTax = 0;

        // best results
        this.PopulationStructure = null;
        this.EnergyStructure = null;
        this.AreaStructure = null;

        this.GetStructureByKey = function(key) {
          var st = null;
          $.each(this.Structures, function(index, unit) {
            if (st != null) return;
            if (unit.Key == key) st = unit;
          });
          return st;
        };

        this.CalcBestEnergy = function() {
          var solar = hints.GetStructureByKey("solar-plants");
          var gas = hints.GetStructureByKey("gas-plants");
          var am = hints.GetStructureByKey("antimatter-plants");
          var op = hints.GetStructureByKey("orbital-plants");
          var areaTax = hints.AreaStructure.GetTaxRate();
          var popTax = hints.PopulationStructure.GetTaxRate();
          // see if this structure would require more pop or area
          if (parseInt(hints.MaxArea) - parseInt(this.Area) <= 0)
            areaTax += hints.AreaStructure.GetTaxRate();
          if (parseInt(hints.MaxPopulation) - parseInt(hints.Population) <= 0)
            popTax += hints.PopulationStructure.GetTaxRate();
          ctF.log("AreaTax:" + areaTax + ", PopTax:" + popTax);

          var bcpu = 999999999999;
          this.EnergyStructure = null;
          var earr = [solar, gas, am, op];
          var me = hints;
          $.each(earr, function(index, st) {
            if (st == null) return;
            var c = st.CostPerUnit;
            // see which taxes to levy
            if (index < 3) c += areaTax;
            else c += popTax;

            if (st.Gain < 4) {
              c += (4 - st.Gain) * areaTax + (4 - st.Gain) * popTax;
            }

            if (c < bcpu) {
              bcpu = c;
              me.EnergyStructure = st;
            }
          });
          return hints.EnergyStructure;
        };

        // will calc area also
        this.CalcBestPop = function() {
          var urban = hints.GetStructureByKey("urban-structures");
          var obase = hints.GetStructureByKey("orbital-base");
          if (obase == null) return urban;
          hints.AreaStructure = hints.CalcBestArea();
          var ucost = parseInt(urban.CostPerUnit);
          // see if we need area to build this urban
          if (parseInt(hints.MaxArea) - parseInt(hints.Area) <= 0)
            ucost = hints.AreaStructure.Cost + ucost;
          hints.PopulationStructure = obase.CostPerUnit < ucost ? obase : urban;
          return hints.PopulationStructure;
        };

        this.CalcBestArea = function() {
          var terra = hints.GetStructureByKey("terraform");
          var mlp = hints.GetStructureByKey("multi-level-platforms");
          if (mlp == null) return terra;
          hints.AreaStructure =
            mlp.CostPerUnit < terra.CostPerUnit ? mlp : terra;
          return hints.AreaStructure;
        };
      };
      // parse top to get current values
      var hints = new Hints();
      $(".base_top tr:gt(0)").each(function(index, row) {
        $(row)
          .find("td:gt(0)")
          .each(function(cindex, col) {
            var c = $(col);
            var a = c.text().match(/(\d+)\/(\d+)/);
            switch (cindex) {
              case 0:
                hints.Area = parseInt(a[1]);
                hints.MaxArea = parseInt(a[2]);
                break;
              case 1:
                hints.Energy = parseInt(a[1]);
                hints.MaxEnergy = parseInt(a[2]);
                break;
              case 2:
                hints.Population = parseInt(a[1]);
                hints.MaxPopulation = parseInt(a[2]);
                break;
            }
          });
      });

      var rows = $("#base_structures table.layout tr.item-row");
      rows.each(function(index, row) {
        var key = "",
          name = "",
          comment = "",
          cost = 0,
          energy = 0,
          economy = 0,
          time = 0;
        $(row)
          .find("td")
          .each(function(cindex, col) {
            var c = $(col);
            switch (cindex) {
              case 0:
                key = c.html().match(/item item_(.*)\"/)[1];
                break;
              case 1:
                name = $("a", c).text();
                comment = $(".comment", c).text();
                break;
              case 2:
                cost = c.text();
                break;
              case 3:
                energy = c.text();
                break;
              case 4:
                economy = c.text();
                break;
              case 5:
                time = c.text();
                break;
            }
          });

        var s = new Structure(key, name, comment, cost, energy, economy, time);
        hints.Structures.push(s);
        ctF.log(
          "Structure " +
            key +
            ", CPU (before AreaTax) = " +
            s.CostPerUnit +
            ", Gain from this unit:" +
            s.Gain
        );
      });
      // now calc best of each
      hints.CalcBestPop();
      hints.CalcBestEnergy();
      ctF.log("Best Area is:" + hints.AreaStructure.Key);
      ctF.log("Best Population is:" + hints.PopulationStructure.Key);
      ctF.log("Best Energy is:" + hints.EnergyStructure.Key);
      return hints;
    } catch (e) {
      lg.debug(e, "Error in SetBuildHints", {
        details: {
          href: window.location.href
        }
      });
    }
  },

  // get location (in game)
  GetLocation: function() {
    try {
      var search = decodeURIComponent(window.location.search).replace("?", "");
      var galaxy = decodeURIComponent(window.location.href).match(/(map.aspx)/);
      var region = search.match(/loc=([A-Z]\d\d:\d\d)/);
      var system = search.match(/loc=([A-Z]\d\d:\d\d:\d\d)/);
      var astro = search.match(/loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/);
      if (astro != null) return astro[1];
      if (system != null) return system[1];
      var loc = null;
      if (region != null) {
        var b = $("b:contains(> Region)");
        var match = (b.length && b.text()) ? b.text().match(/\((.+)\)/) : null;
        loc = match ? match[1] : region[1];
      } else if (galaxy != null) {
        loc = $("b:contains(Galaxy )")
          .text()
          .match(/Galaxy (.+)/);
        if (loc == null) loc = $("#getLocation").val();
        else loc = loc[1];
      }

      return loc;
    } catch (e) {
      lg.debug(e, "Error in GetLocation:", {
        stack: true
      });
    }
  },

  GetFleetSummary: function() {
    var h = $("#fleets_summary").html();
    return h;
  },

  // this set of actions do the passive parsing as the user goes to pages.
  PublicParsePage: function() {
    try {
      var search = decodeURIComponent(window.location.search).replace("?", "");
      var page = window.location.pathname.match(/\/(\w+)\.aspx/);
      if (page == null) return;
      ctG.SendingPlayerId = $("#account")
        .next()
        .text(); // need function to do this
      // blue nova?
      var avplayerid = $("#main-header-avatar_face").css("background-image");
      if (avplayerid) {
        avplayerid = avplayerid.match(/(\d+)_\d+_trumblr/);
        ctG.SendingPlayerId = avplayerid ? avplayerid[1] : -1;
      }
      ctF.log("SendingPlayerId:" + ctG.SendingPlayerId);

      var message = new Message("sidebar", "ShowMenuAction", {
        page: page[1],
        subPage: "",
        search: search,
        playerId: ctG.SendingPlayerId,
        bases: 0,
        gmServerName: econs.GetGmServerNameFromUrl(window.location.href),
        gmServer: GmServer,
        activeScout: aScout.ActiveScout,
        tabData: ctG.TabData,
        preferences: prefs,
        ServerTimeOffset: ServerTimeOffset,
        timerSecondsRemaining: aScout.SecondsRemaining,
        version: chrome.runtime.getManifest().version
      });

      page = page[1];
      switch (page) {
        case "board":
          if (search.match(/folder=2/)) {
            parse.ParseCombatBoard();
          }
          break;
        case "profile":
          parse.ParseProfile(function(data) {
            ctF.SendProfileSummary(data.player_id);
          });
          break;
        case "empire":
          var subPage = "";
          if (search == "" || search.match(/view=bases_events/) != null) {
            subPage = "events";
            message.actionArgs.bases = ct.GetBaseCount();
          } else if (search.match(/view=fleets/) != null) {
            subPage = "fleets";
            // parse.ParseEmpireFleets();
            // setup gather
          } else if (search.match(/view=trade/) != null) {
            subPage = "trade";
            // parse.ParseEmpireTrade();
          } else if (search.match(/view=scanners/) != null) {
            subPage = "scanners";
          } else if (search.match(/view=units/) != null) {
            subPage = "units";
          } else if (search.match(/view=bases_capacities/) != null) {
            subPage = "capacities";
            parse.ParseCapacities();
            ctF.DisplayStatus("Parsing capacities");
          } else if (search.match(/view=structures/) != null) {
            subPage = "structures";
          } else if (search.match(/view=bases_production/) != null) {
            subPage = "production";
          } else if (search.match(/view=economy/) != null) {
            subPage = "economy";
          } else if (search.match(/view=technologies/) != null) {
            subPage = "technologies";
            parse.ParseResearch();
          }
          message.actionArgs.subPage = subPage;
          ctF.log("Looked at empire page " + subPage);
          break;

        case "map":
          var region = search.match(/loc=([A-Z]\d\d:\d\d)/);
          var system = search.match(/loc=([A-Z]\d\d:\d\d:\d\d)/);
          var astro = search.match(/loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/);
          if (astro != null) {
            parse.ParseAstro();
            message.actionArgs.fleetSummary = ct.GetFleetSummary();
            ctF.FlushUpload();
          } else if (system != null) {
            parse.ParseSystem();
            ctF.FlushUpload();
          } else if (region != null) {
            parse.ParseRegion();
            ctF.FlushUpload();
          } else {
            $(".DTimer").remove();
            $(".top").append(
              '<tr class="DTimer"><td colspan="9"><center><span id="DTimer">*</span></center></td></tr>'
            );
            $().prependTo("form center");
            message.actionArgs.FleetGalaxy = ct.GetLocation();
            message.actionArgs.HomeLz = "";
            var maxGal = $("#map2_Fav-Galaxies a").last();
            if (maxGal.length == 0) {
              maxGal = $("#galaxies-links a").last();
              if (maxGal.length > 0) maxGal = maxGal.text().substring(1);
              else maxGal = 99;
            } else maxGal = maxGal.text();
            message.actionArgs.MaxGalaxy = parseInt(maxGal + 1);
          }
          break;

        case "base":
          var subPage = "";
          if (
            search.match(/base=\d+/) != null &&
            search.match(/&view=[a-z]/) == null &&
            parse.VisibleBase()
          ) {
            var a = $('a[href*="loc="]');
            var loc = a.text();

            parse.ParseBase();
            message.actionArgs.fleetSummary = ct.GetFleetSummary();
            ctF.FlushUpload();
          } else if (search == "" || search.match(/view=structures/) != null) {
            subPage = "structures";
            bHints.ParseBaseStructures();
          } else if (search.match(/view=defenses/) != null) {
            subPage = "defenses";
            //bHints.ParseBaseStructures();
          } else if (search.match(/view=trade/) != null) {
            subPage = "trade";
          } else if (search.match(/view=research/) != null) {
            subPage = "research";
          }
          message.actionArgs.subPage = subPage;
          break;
        case "fleet":
          subPage = "";
          var fleetId = null;
          if (search.match(/fleet=/)) {
            message.actionArgs.fleetId = search.match(/fleet=(\d+)/)[1];
            subPage = "overview";
          }
          if (search.match(/view=move/) != null) {
            subPage = "move";
          }
          // note: if fleetid is present and view is not it is overview
          message.actionArgs.subPage = subPage;
          break;
        case "guild":
          parse.ParseGuildPage();
          break;
        case "account":
          ctF.CheckConfig();
          break;
      }
      //chrome.runtime.sendMessage(message);
      ctF.SendMessage(message);
      pageUI.UpdatePage(message);
    } catch (e) {
      lg.debug(e, "Error in PublicParsePage", {
        details: {
          href: window.location.href
        }
      });
    }
  },

  GetBaseCount: function() {
    try {
      var d = $('#empire_events div:contains("Base")');
      var tbl = $("#empire_events");
      var n = tbl.find("tr").length;
      var d = $('div:contains("Base")');
      return n - 4;
    } catch (e) {
      lg.debug(e, "Error in GetBaseCount:", {
        stack: true
      });
    }
  }
};
