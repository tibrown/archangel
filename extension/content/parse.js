var Parser = function() {
  var fleetTimer = null;
  var fleetIndex = 0;
  var fleetList = [];
  var fleetData = [];
  var systems = [];
  var astros = [];
  var currentAstro = 0;
  var fleet_details_sent = false;
  var fleetDetailList = [];
  var inhibitNavigateFleetDetail = false;
  var regions = [];
  var currentRegion = 0;
  var thisPlayerId = 0;

  this.log = function(msg) {
    // so we know where it came from
    lg.log('Parse:' + msg);
  }

  this.BadDoc = function(msg, src) {
    try {
      var m = msg.match(/You are requesting too many pages in a small perid of time/);
      // captcha test
      var c = msg.match(/Enter text from the image and click/);
      if (m || c) {
        ctF.DisplayStatus(src + '::Got too fast warning..skipping');
        parse.log(src + '::Got too fast warning..skipping');
        return true;
      }
      return false;
    } catch (e) {
      lg.debug(e, 'Error in BadDoc:', {
        stack: true
      });
    }
  }

  this.VisibleBase = function() {
    try {
      if ($('center:contains(Invalid Base)').length > 0) return false;
      if ($('table:contains(You can\'t see this Base Information)').length > 0) return false;
      return true;
    } catch (e) {
      lg.debug(e, 'Error in VisibleBase' + e.message, {
        stack: true
      });
    }
  }

  this.InvalidBase = function() {
    try {
      if ($('center:contains(Invalid Base)').length > 0) {
        ctF.DisplayStatus('Deleting invalid base')
        var base_id = decodeURIComponent(window.location.search).replace('?', '').match(/base=(\d+)/);
        if (base_id) {
          var req = {
            request: {
              mode: 'invalid_base',
              base_id: base_id[1],
              sendingPlayerId: ctGlobals.SendingPlayerId
            }
          };
          ctF.DoAjax(req);
        }
      }
    } catch (e) {
      lg.debug(e, 'Error in InvalidBase' + e.message, {
        stack: true
      });
    }
  }

	this.ParseResearch = function() {
		try {
			ctF.DisplayStatus('Parsing technologies');
			var techs = [];
			var i = 0;
			$('#empire_technologies tbody tr td.content table.layout tbody tr').not(':first').each(function() {
				var td = $(this).children().eq(0);
				var tech = $('div:eq(0)', td).text();
				if (tech.match(/Each level/)) return;
				var level = $(this).children().eq(4).text();
				techs[i++] = {
					tech: tech,
					level: level
				};
				// debug('Tech:<' + tech + '>');
			});
			var data;
			var req = {
				request: {
					mode: "technology",
					sendingPlayerId: ctG.SendingPlayerId,
					techs: techs
				}
			};
      ctF.PushUpload(req);
		} catch (e) {
			lg.debug(e, 'error', {
				stack: true
			});
		}
	}

  this.ParseCapacities = function() {
    try {
      // parse capacities
      var getCap = function(pval, cmdr) {

        if (cmdr) {
          var v = safeMatch(cmdr, /\d+/, [0]);
          var clvl = .01 * v;
          var mins = clvl * 60;
          var fact = pval / (60 - mins);
          pval = 60 * fact;
        }
        return Number(pval);
      }

      var table = $('#empire_capacities');
      var drows = $('tbody tr:eq(1) td table tbody tr', table);
      var restot = 0;
      var constot = 0;
      var prodtot = 0;
      for (var i = 0; i < drows.length; i++) {
        var row = drows[i];
        var loc = $('td:eq(1) a:eq(0)', row).text();
        var rescmdr = $('td[sorttable_customkey^="Research"]', row).attr('sorttable_customkey');
        var prodcmdr = $('td[sorttable_customkey^="Production"]', row).attr('sorttable_customkey');
        var conscmdr = $('td[sorttable_customkey^="Construction"]', row).attr('sorttable_customkey');
        var cons = $('td:eq(4)', row).attr('sorttable_customkey');
        var prod = $('td:eq(5)', row).attr('sorttable_customkey');
        var res = $('td:eq(6)', row).attr('sorttable_customkey');

        restot = Number(restot) + getCap(res, rescmdr);
        prodtot = Number(prodtot) + getCap(prod, prodcmdr);
        constot = Number(constot) + getCap(cons, conscmdr);

      }

      var totrow = $('tbody tr:eq(1) td table tfoot tr', table);
      var eco = $('td:eq(2) b', totrow).text().replace(',', '');
      eco = eco.match(/(\d+) \//);
      eco = (eco) ? eco[1] : 0;

      var req = {
        request: {
          mode: 'capacities',
          economy: eco,
          construction: constot,
          production: prodtot,
          research: restot,
          sendingPlayerId: ctG.SendingPlayerId
        }
      };
      ctF.PushUpload(req);
    } catch (e) {
      lg.debug(e, 'Error in ParseGuild', {
        stack: true
      });
    }
  }

  this.ParseGuildPage = function(page) {
    try {
      ctF.DisplayStatus('Parsing Guild Page');
      var rows = null;
      if (page) {
        rows = $(page).find('.layout.listing.sorttable tr:gt(0)');
      } else {
        var info = $('td:contains(Tag: )').text();
        var guild_tag = safeMatch(info, /Tag: \[(.{1,5})\]/, [1]);
        var guild_id = safeMatch(info, /Guild: (\d+)/, [1]);
        var guild_name = $('#guild_show table tr:first th:eq(1)').text();
        rows = $('.layout.listing.sorttable tr:gt(0)');
      }
      var req = {
        request: {
          mode: "guild",
          angelVersion: eConstants.AngelVersion,
          sendingPlayerId: ctGlobals.SendingPlayerId,
          guildName: guild_name,
          guildTag: guild_tag,
          guildId: guild_id,
          members: {}
        }
      };

      var members = [];
      for (var i = 0; i < rows.length; i++) {
        var elements = $('td', rows.eq(i));
        var playerId = elements.eq(0).text();
        var member = {
          playerId: playerId,
          nick: elements.eq(2).text(),
          level: ctF.ConvertNumber(elements.eq(3).text())
        };
        members.push(member);
      }
      if (page) return members;

      req.request.members = members;
      ctF.PushUpload(req);

      ctF.DisplayStatus('Parsed players');
    } catch (e) {
      lg.debug(e, 'Error in ParseGuild', {
        stack: true
      });
    }
  }

  this.ParseBase = function(msg, callback, baseId) {
    try {
      var didUpload = false;
      parse.log('Parsing Base');
      // Recorded/scout pages carry "<center>Recorded data from N day(s) ago."
      // Detect against whatever source we're parsing (live DOM for manual view,
      // fetched fragment for autoscout), then hand off to the scout parser —
      // these pages have no eyes data but do expose astro attributes/fleets.
      var isFoggy = false;
      if (msg == null) {
        isFoggy = $('center:contains(Recorded data from)').length > 0;
      } else {
        isFoggy = $(msg).filter('center:contains(Recorded data from)').length > 0
          || $('<div>').append($(msg)).find('center:contains(Recorded data from)').length > 0;
      }
      if (isFoggy) {
        parse.log('Is FOGGY -> recorded base, delegating to ParseRecordedBase');
        return parse.ParseRecordedBase(msg, callback, baseId);
      }
      ctF.DisplayStatus('Parsing Base...');
      var obj, base_id, headTable, last_pillaged, stability;
      if (msg == null) {
        obj = $('body').children();
        var debris = $('center:contains(debris)');
        var last_pillaged = $('center:contains(pillaged)');
        base_id = safeMatch(location.search, /\d+/, [0]);
      } else {
        if (parse.BadDoc(msg, 'parseBase')) return;
        var doc = $(msg);
        obj = doc;
        // FIXME parse.UpdateFromPage(obj);
        base_id = baseId;
        var debris = obj.filter('center:contains(debris)');
        var last_pillaged = obj.filter('center:contains(pillaged)');
      }
      if ($('option', obj).length > 0) {
        headTable = $('th:contains(Trade Routes)', obj).parent().next().children('td');
      } else {
        headTable = obj.filter('table:contains(Base Name)').children().children('tr').eq(1).children('td');
      }
      headTable = obj.filter('table.base_top:contains(Location)');
      if (headTable.length == 0) {
        headTable = obj.filter('table:contains(Location)');
      }
      var an = headTable.find('a[href*="map"]');
      var coords = an.text();
      var universeId = safeMatch(coords, /[A-Z]/, [0]);
      if (last_pillaged.length > 0) {
        last_pillaged = safeMatch(last_pillaged.text(), /\d+/, [0]);
      } else {
        last_pillaged = 0;
      }

      if (debris.length == 1 && debris.text() != null) {
        var raw_html = debris.text();
        debris = debris.text().match(/([0-9,]*) credits in space debris./);
        if (debris) {
          debris = ctF.ReplaceAll(debris[1], ',', '');
        } else {
          debris = 0;
          parse.debug('error finding debris, ' + raw_html, 'error', {
            stack: false
          });
        }
      } else {
        debris = 0;
      }

      var trade = headTable.eq(headTable.length - 1).text();
      var bodyTable = obj.filter('table:contains(Astro Type)');
      var base_name = bodyTable.find('tr:first > th:first').text();
      var terrain = $('tr td center', bodyTable).html().split('<br>')[3].split('</b>')[1];
      terrain = terrain.trim();
      var capacityTable = $('#base_processing-capacities tbody tr:eq(1) td table', bodyTable);
      var capacityRows = $('tr', capacityTable);
      var construction = $('tr:contains(Construction) td:eq(1)', capacityTable).text();
      var production = $('tr:contains(Production) td:eq(1)', capacityTable).text();
      var research = $('tr:contains(Research) td:eq(1)', capacityTable).text();
      var max_econ = $('tr:contains(Economy) td:eq(1)', capacityTable).text();
      var current_econ = $('tr:contains(Owner Income) td:eq(1)', capacityTable).text();
      var stability = $('tr:contains(Base Stability) td:eq(1)', capacityTable).text();
      var owner_name = $('tr:contains(Base Owner) td:eq(1)', capacityTable).text();
      var ss = owner_name.match(/^((\[.+\]) ){0,1}(.*)$/);
      owner_name = jQuery.trim(ss[3]);
      var ownerGuildTag;
      if (ss[2]) {
        ownerGuildTag = ss[2].replace('[', '').replace(']', '');
      } else {
        ownerGuildTag = '';
      }

      var oTag = $('tr:contains(Base Owner) a', capacityTable);
      var owner_id = 0;
      // FIXME TDB 09-08-2018
      try {
        owner_id = safeMatch(oTag.attr('href'), /\d+/, [0]);
      } catch (e) {
        lg.debug(e, 'Error in ParseBase finding Owner', {
          details: {
            html: obj.html()
          }
        });
      }
      var ownerLevel = 0.0;
      if (owner_name != 'United Colonies' && owner_name != 'Drekons') ownerLevel = safeMatch(oTag.attr('title'), /\d+\.\d+/, [0]);

      var row1name = $('tr:contains(Occupier) td:eq(1)', capacityTable).text();

      // FIXME, this doesnt really fix the problem, just prevents the error
      // and shows whats wrong
      var occupier_name;
      if (row1name == 'Base Stability') { // WTF??
        occupier_name = '';
      } else {
        occupier_name = $('tr:contains(Occupier) td:eq(1)', capacityTable).text();
      }
      var occGuildTag = '';
      var occLevel = 0.0;
      var occupier_id = -1;

      if (occupier_name != '') {
        oTag = capacityRows.eq(1).children('td').eq(1).children('a');
        occupier_id = 0;
        // FIXME TDB
        try {
          occupier_id = safeMatch(oTag.attr('href'), /\d+$/, [0]); // ERROR!,
          ss = oTag.attr('title');
          // number
          // format?
          var ltmp = ss.match(/\d+\.\d+/);
          occLevel = (ltmp == null) ? 0.0 : ltmp[0];
          ss = occupier_name.match(/\[.+\]/);
          s = (ss == null) ? '' : ss[0];
          occGuildTag = s.replace('[', '').replace(']', '');
          occupier_name = (ss == null) ? occupier_name : safeMatch(occupier_name, / .+/, [0]);
          occupier_name = jQuery.trim(occupier_name);
        } catch (e) {
          lg.debug(e, 'error', {
            details: {
              html: obj.html()
            }
          });
        }
      }

      var cmdr = obj.find('td:contains(Base Commander)');
      var commander = '';
      if (cmdr.length > 0) commander = cmdr.text().split('(')[1].split(')')[0];

      var strdefTable = obj.filter('table#base_resume-structures').find('table tr:last').children('td');
      if (strdefTable.length != 6) {
        // big problem
        lg.debug({
          message: 'No structure data, BAD BASE'
        }, 'Error in ParseBase', {
          stack: true
        });
        econs.CallBack(callback, [], false);
        return;
      }
      var structures = strdefTable.eq(0).html().replace(/<br>/g, '*');
      structures = structures.replace(/<span style="white-space: nowrap;">/g, '');
      structures = structures.replace(/<\/span>/g, '');
      var structures2 = strdefTable.eq(2).html().replace(/<br>/g, '*');
      structures2 = structures2.replace(/<span style="white-space: nowrap;">/g, '');
      structures2 = structures2.replace(/<\/span>/g, '');
      var structures3 = strdefTable.eq(4).html().replace(/<br>/g, '*');
      structures3 = structures3.replace(/<span style="white-space: nowrap;">/g, '');
      structures3 = structures3.replace(/<\/span>/g, '');
      if (structures2.length > 0) structures += structures2;
      if (structures3.length > 0) structures += structures3;
      structures = structures.substr(0, structures.length - 1);
      var structure_levels = strdefTable.eq(1).html().replace(/<br>/g, '*');
      structure_levels = structure_levels.replace(/<span style="white-space: nowrap;">/g, '');
      structure_levels = structure_levels.replace(/<\/span>/g, '');
      var structure_levels2 = strdefTable.eq(3).html().replace(/<br>/g, '*');
      structure_levels2 = structure_levels2.replace(/<span style="white-space: nowrap;">/g, '');
      structure_levels2 = structure_levels2.replace(/<\/span>/g, '');
      var structure_levels3 = strdefTable.eq(5).html().replace(/<br>/g, '*');
      structure_levels3 = structure_levels3.replace(/<span style="white-space: nowrap;">/g, '');
      structure_levels3 = structure_levels3.replace(/<\/span>/g, '');
      if (structure_levels2.length > 0) structure_levels += structure_levels2;
      if (structure_levels3.length > 0) structure_levels += structure_levels3;
      structure_levels = structure_levels.substr(0, structure_levels.length - 1);

      // Jump Gate level: find "Jump Gate" in the structures list and read its
      // paired level from structure_levels (both are '*' separated, same order).
      var jgLevel = 0;
      var jgNames = structures.split('*');
      var jgLvls = structure_levels.split('*');
      for (var jgi = 0; jgi < jgNames.length; jgi++) {
        if (jgNames[jgi].indexOf('Jump Gate') !== -1) {
          var jgLvl = parseInt(jgLvls[jgi], 10);
          if (!isNaN(jgLvl)) jgLevel = jgLvl;
          break;
        }
      }

      var whPresent = obj.find('center:contains(Wormhole)');
      var warmhole = 0;
      if (whPresent.length) {
        var dt = ctF.GetDateFromString(whPresent.text());
        if (dt) warmhole = dt.date.getFullYear() + '-' + (dt.date.getMonth() + 1) + '-' + dt.date.getDate();
      }
      var req = {
        request: {
          mode: "base",
          coords: coords,
          base_id: base_id,
          base_name: base_name,
          debris: debris,
          terrain: terrain,
          construction: construction,
          production: production,
          research: ctF.ConvertNumber(research),
          max_econ: max_econ,
          current_econ: current_econ,
          owner_id: owner_id,
          ownerLevel: ownerLevel,
          ownerName: owner_name,
          commander: commander,
          structures: structures,
          structure_levels: structure_levels,
          trade: trade,
          last_pillaged: last_pillaged,
          uc_stability: stability,
          wormHole: warmhole,
          jumpgate: jgLevel,
          universeId: universeId,
          angelVersion: econs.AngelVersion,
          sendingPlayerId: ctG.SendingPlayerId,
          ownerGuildTag: ownerGuildTag,
          occupierName: occupier_name,
          occLevel: occLevel,
          occupier_id: occupier_id,
          occGuildTag: occGuildTag
        }
      };
      var debrisAmt = (debris == 0) ? '' : '<li><span style="color: yellow;">Debris:' + debris + '</span></li>';
      var wh = (warmhole == 0) ? '' : '<li>Wormhole Present</li>';

      var lmsg = 'Details:<ul>' +
        '<li>' + coords + '</li>' +
        'BaseName:' + base_name + '</li>' +
        debrisAmt + wh +
        '<li>Owner:' + owner_id + '(' +
        '[' + ownerGuildTag + '] ' +
        owner_name + ')</li>';
      if (occupier_id != -1) lmsg += '<li>Occed By:' + occupier_id + '([' + occGuildTag + ']' + occupier_name + ')</li>';
      lmsg += '</ul>';
      ctF.DisplayStatus('Parsed base:' + req.request.base_name + ', ' + req.request.coords, lmsg);
      ctF.PushUpload(req);
      didUpload = true;

      if (aScout.seedOnly === false) parse.ParseFleet(coords, msg, true, callback);
      else econs.CallBack(callback, [], didUpload);
    } catch (e) {
      lg.debug(e, 'Error in ParseBase:', {
        stack: true
      });
      econs.CallBack(callback, [], false);
    }
  }

  // Parse a recorded/scout base page ("Recorded data from N ago"). Unlike a
  // live-eyes base these pages carry NO construction/production/research or
  // economy rows, but they DO expose the astro attributes (Astro Type, Area,
  // Solar Energy, Fertility, resource bonuses), owner/commander, structures
  // AND defenses. Sends ONLY the fields it owns so a later live-eyes capture
  // (or another scout) can't be clobbered — see the bridge base handler's
  // present-key-only upsert.
  this.ParseRecordedBase = function(msg, callback, baseId) {
    try {
      parse.log('Parsing Recorded Base');
      var didUpload = false;
      var root = (msg == null) ? $(document) : $('<div>').append($(msg));

      // --- location / astro attributes --------------------------------
      var loc = root.find('a[href*="map.aspx?loc="]').first();
      var coords = safeMatch(loc.text(), /[A-Z]\d\d:\d\d:\d\d:\d\d/, [0]);
      if (!coords) coords = safeMatch(loc.attr('href'), /loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
      var universeId = safeMatch(coords, /[A-Z]/, [0]);

      var bodyTable = root.find('table:contains(Location)').last();
      var leftTd = bodyTable.find('tr:first td:first').html() || '';
      var label = function(re) {
        var m = leftTd.match(re);
        return (m && m[1] != null) ? m[1].trim() : '';
      };
      var astro_type = label(/<b>Astro Type:<\/b>\s*([^<]+)/);
      var terrain    = label(/<b>Terrain:<\/b>\s*([^<]+)/);
      var area       = label(/<b>Area:<\/b>\s*([^<]+)/);
      var solar_energy = label(/<b>Solar Energy:<\/b>\s*([^<]+)/);
      var fertility  = label(/<b>Fertility:<\/b>\s*([^<]+)/);

      // --- resources (Metal/Gas/Crystals) -----------------------------
      var res = { metal: '', gas: '', crystals: '' };
      root.find('#base_resources tr').each(function() {
        var c = $(this).children('td');
        if (c.length === 2) {
          var k = c.eq(0).text().trim().toLowerCase();
          if (k in res) res[k] = c.eq(1).text().trim();
        }
      });

      // --- owner -------------------------------------------------------
      var ownerTd = root.find('td:contains(Base Owner)');
      var oLink = ownerTd.find('a[href*="profile.aspx"]').first();
      var owner_id = safeMatch(oLink.attr('href'), /player=(\d+)/, [1]);
      var ownerNameRaw = oLink.text().trim();
      var ownerName = ownerNameRaw, ownerGuildTag = '';
      var om = ownerNameRaw.match(/^\[(.+?)\]\s*(.*)$/);
      if (om) { ownerGuildTag = om[1]; ownerName = om[2]; }
      var ownerLevel = safeMatch(oLink.attr('title'), /Player level ([\d.]+)/, [1]);

      // --- commander ----------------------------------------------------
      var cmdrTd = root.find('td:contains(Base Commander)');
      var commander = cmdrTd.find('a').first().text().trim();

      // --- staleness ----------------------------------------------------
      var staleness = safeMatch(root.find('center:contains(Recorded data from)').text(), /Recorded data from (.+?)\./, [1]);

      // --- structures + defenses ---------------------------------------
      var base_name = safeMatch(root.find('th.dropcap').first().text(), /\S.*/, [0]).trim();
      var structures = '', structure_levels = '', defenses = '';
      var cleanCol = function(td) {
        return td.html().replace(/<br>/g, '*').replace(/<span style="white-space: nowrap;">/g, '')
          .replace(/<\/span>/g, '');
      };
      var strdef = root.find('table#base_resume-structures').find('table tr:last').children('td');
      if (strdef.length >= 2) {
        structures = cleanCol(strdef.eq(0));
        structure_levels = cleanCol(strdef.eq(1));
        if (strdef.length >= 4) {
          var s2 = cleanCol(strdef.eq(2)), l2 = cleanCol(strdef.eq(3));
          if (s2 && s2.trim()) { structures += s2; structure_levels += l2; }
        }
        structures = structures.replace(/\*+$/, '');
        structure_levels = structure_levels.replace(/\*+$/, '');
        if (strdef.length >= 6) {
          var dNames = cleanCol(strdef.eq(4)).replace(/^\*+|\*+$/g, '');
          var dUnits = cleanCol(strdef.eq(5)).replace(/^\*+|\*+$/g, '');
          var nArr = dNames.split('*'), uArr = dUnits.split('*'), parts = [];
          for (var i = 0; i < nArr.length; i++) {
            if (nArr[i].trim()) parts.push(nArr[i].trim() + ' ' + (uArr[i] || '').trim());
          }
          defenses = parts.join('*');
        }
      }

      var req = {
        request: {
          mode: 'base',
          coords: coords,
          base_id: baseId || '',
          base_name: base_name,
          astro_type: astro_type,
          terrain: terrain,
          area: area,
          solar_energy: solar_energy,
          fertility: fertility,
          metal: res.metal,
          gas: res.gas,
          crystals: res.crystals,
          owner_id: owner_id,
          ownerName: ownerName,
          ownerGuildTag: ownerGuildTag,
          ownerLevel: ownerLevel,
          commander: commander,
          structures: structures,
          structure_levels: structure_levels,
          defenses: defenses,
          recorded_days_ago: staleness,
          universeId: universeId,
          sendingPlayerId: ctG.SendingPlayerId
        }
      };
      ctF.DisplayStatus('Parsed recorded base:' + coords + ' (' + (ownerName || '?') + ')');
      ctF.PushUpload(req);
      didUpload = true;
      // scout pages have no fleet_ids to detail; return empty fleet list
      econs.CallBack(callback, [], didUpload);
    } catch (e) {
      lg.debug(e, 'Error in ParseRecordedBase:', {
        stack: true
      });
      econs.CallBack(callback, [], false);
    }
  }

  this.ParseAstro = function(msg, callback) {
    var db, items, terrain;
    try {
      var didUpload = false;
      var isFoggy = $('center:contains(Recorded data from)').length > 0;
      if (isFoggy) parse.log('Is FOGGY');
      if (msg != null) {
        if (parse.BadDoc(msg, 'parseAstro')) return;
        var obj = $(msg);
        ctF.UpdatePage(obj);
        var coords = safeMatch(obj.filter('center:contains(Galaxy)').html(), /[A-Z]\d\d:\d\d:\d\d:\d\d/, [0]);
        var base_row = obj.filter('table:contains(Occupier) tr:last');
        var ownerPresent = obj.filter('table:contains(Owner) tr:last');
        terrain = obj.filter('table:contains(Astro Type:)');
        if (terrain.length > 0) {
          terrain = terrain.find('center img');
          terrain = safeMatch(terrain.attr('src'), /astros\/(.+)\.jpg/, [1]);
        } else
          terrain = '  unknown';

        var whPresent = obj.filter('table:contains(W' + 'orm' + 'hol' + 'e)');
      } else {
        // passive scan
        ctF.DisplayStatus('Parsing Astro');
        ctF.UpdatePage();
        var coords = safeMatch($('center').html(), /[A-Z]\d\d:\d\d:\d\d:\d\d/, [0]);
        var base_row = $('table:contains(Occupier) tr:last');
        var ownerPresent = $('table:contains(Owner) tr:last');
        var whPresent = $('table:contains(W' + 'orm' + 'hol' + 'e)');
      }
      if (!terrain) {
        var t1 = document.querySelector("#astro_container img")
        if (t1) terrain = t1.className.match(/astro_([^ ]+)/);
        if (!terrain) terrain = $('table:contains(Astro Type:) img').attr('src').match(/astros\/(.+)\.jpg/);
        if (terrain) terrain = terrain[1].toLowerCase();
      }
      var universeId = coords.match(/[A-Z]/);
      var isBase = base_row.length != 0 && ownerPresent.length != 0;
      var debris = $('center:contains(debris)');
      if (debris.length == 1 && debris.text() != null) {
        db = debris.text().match(/([0-9,]*) credits in space debris./);
        if (db == null) {
          db = debris.text().match(/([0-9,]*) credits in space debris./);
        }
        debris = (db == null) ? 0 : db[1];
        debris = ctF.ReplaceAll(debris, ',', '');
      } else
        debris = 0;
      var req = {};
      if (['gas giant', 'asteroid belt'].indexOf(terrain) == -1) {
        var warmhole = 0;
        if (whPresent.length) {
          var whText = $(whPresent).find("center").text();
          if (whText != '') {
            var dt = ctF.GetDateFromString(whText);
            if (dt) {
              var dtObj = dt.date;
              warmhole = dtObj.getFullYear() + '-' + (dtObj.getMonth() + 1) + '-' + dtObj.getDate();
            }
          }
        }
        var hasEyes = false;
        var fleet_table = $('table[id$=_fleets]');
        hasEyes = (debris + fleet_table.length) > 0;
        if (terrain.toLowerCase() == 'unknown' || isFoggy) hasEyes = false;
        if (terrain.toLowerCase() != 'unknown' && !isFoggy) {
          if (terrain.toLowerCase() != 'asteroid') hasEyes = true;
        }

        if (isBase && !isFoggy) {
          hasEyes = (isFoggy) ? false : true;
          var occGuildTag = '';
          var occLevel = 0.0;
          var occName = '';
          var occ_id = 0;
          items = base_row.children();
          var occ_a = items.eq(2).children('a:first');
          if (occ_a.length == 1) {
            occ_id = safeMatch(occ_a.attr('href'), /profile\.aspx\?player=(\d+)/, [1]);
            fnm = occ_a.text();
            var t = fnm.match(/\[(.+)\]/);
            if (t && t.length > 0) occGuildTag = t[1];
            t = fnm.match(/\] (.+)/);
            if (t.length > 0) occName = t[1];
            occLevel = safeMatch(occ_a.attr('title'), /\d+\.\d+/, [0]);
          }

          var baseId = parseInt(safeMatch(items.eq(0).children('a:first').attr('href'), /base\.aspx\?base=(\d+)/, [1]));
          var ownerId = parseInt(safeMatch(items.eq(1).children('a:first').attr('href'), /profile\.aspx\?player=(\d+)/, [1]));
          var guildTag = '';
          var ownerLevel = 0.0;
          var ownerName = '';

          var ownerName = items.eq(1).children('a:first').html();
          var guildTag = ownerName.match(/\[.+\]/);
          if (guildTag != null && guildTag.length > 0) {
            ownerName = ownerName.match(/ .+/);
            ownerName = jQuery.trim(ownerName[0]);
            guildTag = guildTag[0].replace('[', '').replace(']', '');
          } else {
            guildTag = '';
          }
          var title = items.eq(1).children('a:first').attr('title');

          var ownerLevel = 0.0;
          if (ownerName != 'United Colonies' && ownerName != 'Drekons') ownerLevel = safeMatch(title, /\d+\.\d+/, [0]);

          req = {
            request: {
              mode: "astro",
              coord: coords,
              baseId: baseId,
              ownerId: ownerId,
              guildTag: guildTag,
              ownerLevel: ownerLevel,
              ownerName: ownerName,
              occId: occ_id,
              occGuildTag: occGuildTag,
              occName: occName,
              occLevel: occLevel,
              terrain: terrain,
              debris: debris,
              wormHole: warmhole,
              angelVersion: econs.AngelVersion,
              hasEyes: (terrain == 'unknown') ? false : true
            }
          };

        } else {
          req = {
            request: {
              mode: "astro",
              coord: coords,
              base_id: 0,
              hasEyes: hasEyes,
              owner_id: 0,
              occ_id: 0,
              terrain: terrain,
              debris: debris,
              wormHole: warmhole,
              sendingPlayerId: ctG.SendingPlayerId,
              angelVersion: econs.AngelVersion,
              dsisAutoScout: ctG.DsisAutoScout
            }
          };
          if (!isFoggy) ctF.PushUpload(req);
          parse.log('ParseAstro:hasEyes:' + hasEyes);
          parse.log('ParseAstro:Have to add fakeEyes...');
          //if (typeof callback == 'function') callback(req.request);
        }
        var debrisAmt = (debris == 0) ? '' : ', <span style="color: yellow;">Debris:' + debris + '</span>';
        var wh = (warmhole == 0) ? '' : ', Wormhole Present';
        var lmsg = 'Astro:Loc:' + coords + debrisAmt + wh;

        ctF.DisplayStatus('Parsed astro:' + coords, lmsg);
        ctF.PushUpload(req);
        didUpload = true;
        if (hasEyes && aScout.seedOnly === false) {
          parse.ParseFleet(coords, msg, true, callback);
        } else {
          // return empty fleet list so callback does not process it
          econs.CallBack(callback, [], didUpload);
        }
      }
    } catch (e) {
      lg.debug(e, 'Error in ParseAstro', {
        stack: true
      });
      econs.CallBack(callback, [], false);
    }
  }

  // Shared astro collection for one system page. Builds the `system` upload
  // request with nested astro0..astroN entries plus the per-astro owner / occ /
  // debris / fleet / wormhole parsing. Used by BOTH the live ParseSystem and
  // the recorded ParseRecordedSystem so the two never drift. Returns the req,
  // cbData, data_list and the system-level fleet tallies.
  this.CollectSystemData = function(system, system_table, isFoggy, addFakeEyeData) {
    var num_astros = 0;
    var data_list = [];
    var cbData = [];
    var req = {
      request: {
        mode: 'system',
        system: system,
        hasEyes: false,
        // look for alink _b or span (empty)
        sendingPlayerId: ctG.SendingPlayerId
      }
    };
    var gtfleetamt = parseInt(0); // guild
    var stfleetamt = parseInt(0); // self
    var ntfleetamt = parseInt(0); // neutral

    system_table.find('.astro_asteroid-belt').each(function() {
      var iA = $(this).parent().get(0);
      iA.href = '';
    });
    system_table.find('.astro_gas-giant').each(function() {
      var iA = $(this).parent().get(0);
      iA.href = '';
    });

    system_table.find('img.astro')
      .not('.astro_asteroid-belt').not('.astro_gas-giant').each(
        function() {
          // gas giants in spanish leak this, this blocks them
          if (this.src.match(/(Gas%20Giant.jpg|Asteroid%20Belt.jpg)/)) return;
          if ($(this).css('display') == 'none') return;
          var imgId = $(this).attr('id');
          var imgA = $(this).parent();

          var r = $(this).attr('title').match(/(.+) \(([A-Z]\d\d:\d\d:\d\d:\d\d)\)/);
          if (!r) return;
          var terrain = r[1];
          var location = r[2];

          var alinkHref = imgA.attr('href');
          var isbase = alinkHref.match(/base.aspx/);
          var baseId = 0;
          if (isbase) {
            req.request.hasEyes = true; // redundant
            baseId = alinkHref.match(/base=([0-9]+)/);
            if (baseId) baseId = baseId[1];
          }
          var starsid = 'astro_icons_' + location;
          var starsdiv = imgA.parent();

          var arr = $("div[title*='Fleet']", starsdiv);
          var fleetPresent = false;
          var gfleetamt = parseInt(0); // guild
          var sfleetamt = parseInt(0); // self
          var nfleetamt = parseInt(0); // neutral
          var present = parseInt(0);
          var incoming = parseInt(0);

          for (var i = 0; i < arr.length; i++) {
            var d = $(arr[i]);
            var pdiv = d.parent().parent();
            var pid = pdiv.attr('id');
            if (pid == starsid) {
              fleetPresent = true;
              // guild fleet
              var farr = d.attr('title').match(/Guild:/);
              if (farr) {
                farr = d.attr('title').match(/Fleet present: ([0-9,]+)/);
                present = ctF.ReplaceAll(farr[1], ',', '');
                farr = d.attr('title').match(/Incoming: ([0-9,]+)/);
                if (farr) {
                  incoming = ctF.ReplaceAll(farr[1], ',', '');
                } else {
                  incoming = 0;
                }
                gfleetamt = parseInt(present) + parseInt(incoming);
                if (gfleetamt > gtfleetamt) gtfleetamt = gfleetamt;
              }
              // self fleet
              farr = d.attr('title').match(/Self:/);
              if (farr) {
                farr = d.attr('title').match(/Fleet present: ([0-9,]+)/);
                present = ctF.ReplaceAll(farr[1], ',', '');
                farr = d.attr('title').match(/Incoming: ([0-9,]+)/);
                if (farr) {
                  incoming = ctF.ReplaceAll(farr[1], ',', '');
                } else {
                  incoming = 0;
                }
                sfleetamt = parseInt(present) + parseInt(incoming);
                if (sfleetamt > stfleetamt) stfleetamt = sfleetamt;
              }
              // neutral fleet
              farr = d.attr('title').match(/Neutral:/);
              if (farr) {
                farr = d.attr('title').match(/Fleet present: ([0-9,]+)/);
                present = ctF.ReplaceAll(farr[1], ',', '');
                farr = d.attr('title').match(/Incoming: ([0-9,]+)/);
                if (farr) {
                  incoming = ctF.ReplaceAll(farr[1], ',', '');
                } else {
                  incoming = 0;
                }
                nfleetamt = parseInt(present) + parseInt(incoming);
                if (nfleetamt > ntfleetamt) ntfleetamt = nfleetamt;
              }

            }
          }
          var arr = $("div[title*='Debris']", starsdiv);
          var debris = 0;
          for (var i = 0; i < arr.length; i++) {
            var d = $(arr[i]);
            var pdiv = d.parent().parent();
            var pid = pdiv.attr('id');
            if (pid == starsid) {
              var title = d.attr('title');
              if (!title) continue;
              var dm = title.match(/([0-9,]*) Debris/);
              if (dm) debris = ctF.ReplaceAll(dm[1], ',', '');
            }
          }
          var plid = location + '_b';
          var ocid = location + '_c';
          var span = $('span[id="' + plid + '"]', starsdiv);
          var Alnk = $('a[id="' + plid + '"]', starsdiv);
          // empty only means no base notno fleet
          var empty = (!isbase && !fleetPresent);
          var eyes = span.length > 0 || Alnk.length > 0;
          req.request.hasEyes = eyes;
          // fake eye data
          if ((!eyes || isFoggy) && addFakeEyeData) {
            parse.AddDataSdiv(location, this, isFoggy);
          }

          var arr = $('a[href*="profile.aspx"]', starsdiv);
          var warr = $('[title="Wormhole"]', starsdiv);
          var wormhole = 0;
          if (warr.length) wormhole = 1;
          var playerId = 0;
          var playerNick = '';
          var occPlayerId = 0;
          var occNick = '';
          for (var i = 0; i < arr.length; i++) {
            var d = $(arr[i]);
            if (d.attr('id') == plid) {
              var hrf = d.attr('href');
              playerId = safeMatch(hrf, /\d+/, [0]);
              playerNick = d.text();
            }
            if (d.attr('id') == ocid) {
              var hrf = d.attr('href');
              occPlayerId = safeMatch(hrf, /\d+/, [0]);
              occNick = d.text();
            }
          }

          req.request['astro' + num_astros] = {
            coord: location,
            empty: empty,
            terrain: terrain,
            baseId: baseId,
            playerId: playerId,
            wormhole: wormhole,
            occPlayerId: occPlayerId,
            debris: debris
          };
          cbData.push(req.request['astro' + num_astros]);

          num_astros++;

          // for fleet parse?
          var data = {
            coord: location,
            url: alinkHref,
            terrain: terrain,
            base: baseId,
            player: playerNick,
            occ: occNick,
            debris: debris,
            sendingPlayerId: ctG.SendingPlayerId
          };
          if (fleetPresent || baseId > 0) data_list.push(data);

        });

    return {
      req: req,
      cbData: cbData,
      data_list: data_list,
      num_astros: num_astros,
      gtfleetamt: gtfleetamt,
      stfleetamt: stfleetamt,
      ntfleetamt: ntfleetamt
    };
  }

  // Parse a recorded/scout system page ("Recorded data from N ago"). Unlike a
  // live system these pages ARE captured: every astro's terrain, owner, occ,
  // base, debris, fleet and wormhole are still present in the DOM, so we run
  // the same CollectSystemData loop and always upload — the live parse skips
  // foggy pages, but the scout data is valuable. Sends ONLY this parser's
  // fields (the system + its astros) via the standard 'system' mode.
  this.ParseRecordedSystem = function(msg, callback) {
    try {
      parse.log('Parsing Recorded System');
      var didUpload = false;
      var system, system_table, addFakeEyeData = false;
      if (msg == null) {
        var s = $('a:contains(Galaxy):first').parents('center');
        var sm = s.text().match(/[A-Z]\d\d:\d\d:\d\d/);
        system = (sm) ? sm[0] : '';
        system_table = $('table.system');
      } else {
        if (parse.BadDoc(msg, 'ParseRecordedSystem')) { econs.CallBack(callback, []); return; }
        var obj = $('<div>').append($(msg));
        var sm = obj.find('center').html().match(/[A-Z]\d\d:\d\d:\d\d/);
        system = (sm) ? sm[0] : '';
        system_table = obj.find('table.system');
      }
      if (!system || system_table.length != 1) {
        econs.CallBack(callback, []);
        return;
      }
      var c = parse.CollectSystemData(system, system_table, true, addFakeEyeData);
      ctF.DisplayStatus('Parsed recorded system ' + system + ', submitting ' + c.num_astros + ' astros');
      ctF.PushUpload(c.req);
      didUpload = true;
      econs.CallBack(callback, c.cbData);
    } catch (e) {
      lg.debug(e, 'Error in ParseRecordedSystem:', {
        stack: true
      });
      econs.CallBack(callback, []);
    }
  }

  // Parse a galaxy report page (report.aspx?view=galaxy). This is a SEED LIST,
  // not a capture: each row is {player, base, location}. We return the rows so
  // the scout driver can turn them into a deduped system list and scan each
  // system (which recurses into astros + bases via the recorded-scout path).
  // No upload happens here — the report itself is not stored.
  this.ParseGalaxyReport = function(msg, callback) {
    try {
      parse.log('Parsing Galaxy Report');
      var root = (msg == null) ? $(document) : $('<div>').append($(msg));
      var rows = [];
      // The report table is the sorttable listing with Player/Base/Location
      // columns. Skip the header row (thead) and any tfoot.
      root.find('table.sorttable tbody tr').each(function() {
        var tds = $(this).find('td');
        if (tds.length < 3) return;
        var playerA = tds.eq(0).find('a[href*="profile.aspx"]');
        var baseA = tds.eq(1).find('a[href*="base.aspx"]');
        var locA = tds.eq(2).find('a[href*="map.aspx?loc="]');
        if (playerA.length == 0 || baseA.length == 0 || locA.length == 0) return;
        rows.push({
          playerId: safeMatch(playerA.attr('href'), /player=(\d+)/, [1]),
          playerName: playerA.text().trim(),
          baseId: safeMatch(baseA.attr('href'), /base=(\d+)/, [1]),
          baseName: baseA.text().trim(),
          location: safeMatch(locA.attr('href'), /loc=([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1])
        });
      });
      parse.log('ParseGalaxyReport: ' + rows.length + ' base rows');
      econs.CallBack(callback, rows);
    } catch (e) {
      lg.debug(e, 'Error in ParseGalaxyReport:', {
        stack: true
      });
      econs.CallBack(callback, []);
    }
  }

  this.ParseSystem = function(msg, callback) {
    try {
      var addFakeEyeData = false;
      // Recorded/scout system pages carry "<center>Recorded data from N ago."
      // Detect against whatever source we're parsing (live DOM for manual view,
      // fetched fragment for autoscout), then hand off to the scout parser so
      // the astros are still captured — mirrors ParseBase -> ParseRecordedBase.
      var isFoggy = false;
      if (msg == null) {
        isFoggy = $('center:contains(Recorded data from)').length > 0;
      } else {
        isFoggy = $(msg).filter('center:contains(Recorded data from)').length > 0
          || $('<div>').append($(msg)).find('center:contains(Recorded data from)').length > 0;
      }
      if (isFoggy) {
        parse.log('Is FOGGY -> recorded system, delegating to ParseRecordedSystem');
        return parse.ParseRecordedSystem(msg, callback);
      }
      if (msg == null) {
        addFakeEyeData = true;
        var s = $('a:contains(Galaxy):first').parents('center');
        var system = s.text().match(/[A-Z]\d\d:\d\d:\d\d/);
        if (system) system = system[0];
        var system_table = $('table.system');
      } else {
        if (parse.BadDoc(msg, 'ParseSystem')) return;

        var obj = $(msg);
        ctF.UpdatePage(obj);
        var s = obj.filter('center');

        var system = s.html().match(/[A-Z]\d\d:\d\d:\d\d/);
        if (system) system = system[0];
        var system_table = obj.filter('table.system');
        ctG.CurrentWatchLocation = system;
      }
      if (system_table.length != 1) return;

      var visible_system = true;
      var c = parse.CollectSystemData(system, system_table, isFoggy, addFakeEyeData);
      var req = c.req;
      var cbData = c.cbData;
      var data_list = c.data_list;
      var num_astros = c.num_astros;
      var gtfleetamt = c.gtfleetamt;
      var stfleetamt = c.stfleetamt;
      var ntfleetamt = c.ntfleetamt;

      if (visible_system && !isFoggy) {
        //if (typeof parse.SystemDataFunction == 'function') parse.SystemDataFunction(system, data_list);
        ctF.DisplayStatus('Parsed System ' + system + ', submitting ' + num_astros + ' astros');
        ctF.PushUpload(req);

        var opts = ctF.GetWatchOptions();
        if (opts && opts.enabled) {
          //debug('WATCH ENABLED in parseSystem():ntfleetamt:' + ntfleetamt + '/Gtfleetamt:' + gtfleetamt);
          // now see if cause for alarm at system level
          if (setOffSystemAlarm(ntfleetamt, gtfleetamt)) {
            //debug('ALARM for FLEET...');
            // see if there are astro level filters
            if (opts.filters.guild.length > 0 || opts.filters.arrival > 0) {
              // need to pop astros
              //debug('ALARM GUILD LEVEL');
              astros = [];
              $(data_list).each(function() {
                //debug('Pushing astro:' + this.coord);
                astros.push({
                  coord: this.coord,
                  base: this.base,
                  url: this.url
                });
              });
              //debug('ALARM ASTROS PUSHED');
              // now navigate astros will work
            } //else {
            // just system alarm tripped
            //opts.notify.message = '[Incoming Watch System]System [' + system + '] level alarm tripped.' + ' Other Guild Fleet: ' + opts.filters.notmine + ' Larger than or equal to: ' + opts.filters.size;
            //saveWatchOptions(opts);
            //tripAlarm();
            //parse.log('watch functions to add in parse system');

            //repeatWatch();
            //if (!ctGlobals.ParsingFromButton && !ctGlobals.DsisAutoScout) return;

            //}
          }
        }


      } else {

        if (isFoggy) ctF.DisplayStatus('Fog of War View -- ignoring data');
        ctF.DisplayStatus('Cannot see system:');
      }
      econs.CallBack(callback, cbData);
    } catch (e) {
      lg.debug(e, 'Error in ParseSystem:', {
        stack: true
      });
      econs.CallBack(callback, []);
    }
  }

  this.ParseRegion = function(msg) {
    // determine if static or interactive
    var func = parse.ParseRegionInteractive;
    var el = null;
    if(msg == null) {
      el = $('#map2_ObjTiles3');
    } else {
      var body = $(msg);
      el = body.find('#map2_ObjTiles3');
    }
    if(el.length == 0) func = parse.ParseRegionStatic;
    return func(msg);
  }

  // parse region for interactive map
  this.ParseRegionInteractive = function(msg) {
    try {
      var links;
      if(msg == null) {
        links = $('#map2_ObjFiles3 a');
      } else {
        var body = $(msg);
        links = $('#map2_ObjFiles3 a', body);
      }
      if(links.length == 0) return [];
      var systems = [];
      links.each(function() {
        var s = this.id;
        systems.push(s);
      });
      parse.log('ParseRegionInteractive:Systems found:' + systems.length);
      return systems;
    } catch (e) {
      lg.debug(e, 'Error in ParseRegionInteractive:', {
        stack: true
      });
    }
  }

  this.ParseRegionStatic = function(msg) {
    try {
      var links;
      if (msg == null) {
        //links = $('table.region tbody tr td div a:odd');
        links = $('table.region tbody tr td div a:odd').not('[id*="arrow"]');
      } else {
        if (parse.BadDoc(msg, 'parseRegion')) return;
        var body = $(msg);
        ctF.UpdatePage(body);
        links = $('table.region tbody tr td div a:odd', body).not('[id*="arrow"]');
      }
      if (links.length == 0) {
        ctF.DisplayStatus('No systems to look at');
        return [];
      }
      var systems = [];
      var k = 0;
      for (var i = 0; i < links.length; i++) {
        var l = links.eq(i);
        if (l.css('display') == 'none') continue;
        var tmp = safeMatch(l.attr('href'), /[A-Z]\d\d:\d\d:\d\d/, [0]);
        for (var j = 0; j < systems.length; j++) {
          if (systems[j].coords == tmp) {
            tmp = false;
            break;
          }
        }
        if (tmp) {
          systems.push({
            coords: tmp,
            url: l.attr('href')
          });
        }
      }
      parse.log('ParseRegionStatic:Systems found:' + systems.length);
      return systems;
    } catch (e) {
      lg.debug(e, 'Error in ParseRegionStatic:', {
        stack: true
      });
    }
  }

  this.ParseCombatBoard = function() {
    try {
      ctF.DisplayStatus('PGE:Parsing Combat Board');
      $('div.battle-report').each(function() {
        var info = $(this).find('table.battle-report_info');
        var attack = $(this).find('table.battle-report_attack');
        var defence = $(this).find('table.battle-report_defense');
        parse.ParseCombat(info, attack, defence);
      });
    } catch (e) {
      lg.debug(e, 'Error in ParseCombatBoard', {
        stack: true
      });
    }
  }

  this.ParseMessagesForCombat = function() {
    ctF.DisplayStatus('PGE:Parsing Combat Messages');
    $('a[href^="board.aspx?copy"]').each(function() {
      try {
        parse.ParseCombat($(this).parent().parent().next());
      } catch (e) {
        lg.debug(e, 'Error in ParseMessagesForCombat', {
          stack: true
        });
      }
    });
  }

  this.ParseCombat = function(info, attacker, defender) {
    try {
      var cc = 0;
      var def_base = 0;
      var def_start_def = 0;
      var def_end_def = 0;
      var commander = '';
      var row_mod = 0;
      var tables = info.find('table');
      var locA = info.find('tr:eq(1) td:eq(1) a').attr('href');

      var coords = safeMatch(locA, /[A-Z]\d{2}(:\d\d){3}/, [0]);

      var time = info.find('tr:eq(2) td:eq(1)').text();

      var att_id = safeMatch(info.find('tr:eq(5) td:eq(1) a').attr('href'), /\d+/, [0]);

      var att_lvl = info.find('tr:eq(5) td:eq(1) small').text();
      var m = att_lvl.match(/lvl (\d+\.\d+)/);
      if (m) att_lvl = m[1];

      if (info.find('tr:eq(13) td:eq(0)').text() == 'Command Centers') {
        cc = info.find('tr:eq(13) td:eq(1)').text();
        row_mod++;
      }
      if (info.find('tr:eq(' + (13 + row_mod) + ') td:eq(0)').text() == 'Commander') {
        commander = safeMatch(info.find('tr:eq(' + (13 + row_mod) + ') td:eq(1)').text(), /\(.+\)/, [0]).replace('(', '').replace(')', '');
        row_mod++;
      }
      // FIXME look for drekons, no lvl
      var def_lvl = info.find('tr:eq(8) td:eq(1) small').text();
      var m = def_lvl.match(/lvl (\d+\.\d+)/);
      if (m) def_lvl = m[1];
      var def_id = safeMatch(info.find('tr:eq(8) td:eq(1) a').attr('href'), /\d+/, [0]);

      if (info.find('tr:eq(11) td:eq(0)').text() == 'Start Defenses') def_start_def = safeMatch(info.find('tr:eq(11) td:eq(1)').text(), /\d+/, [0]);
      if (info.find('tr:eq(12) td:eq(0)').text() == 'End Defenses') def_end_def = safeMatch(info.find('tr:eq(12) td:eq(1)').text(), /\d+/, [0]);

      var attackerUnits = attacker.find('tr:gt(1)');
      if (attackerUnits.length == 0) var att_units = '';
      else if (attackerUnits.length == 1) {
        var row = attackerUnits.find('td');
        var att_units = {
          unit: row.eq(0).text(),
          start: row.eq(1).text(),
          end: row.eq(2).text(),
          power: row.eq(3).text(),
          armour: row.eq(4).text(),
          shield: row.eq(0).text()
        }

      } else {
        var att_units = [];

        attackerUnits.each(function(index, rw) {
          var row = $(rw).find('td');
          if (row.length == 6) att_units.push({
            unit: row.eq(0).text(),
            start: row.eq(1).text(),
            end: row.eq(2).text(),
            power: row.eq(3).text(),
            armour: row.eq(4).text(),
            shield: row.eq(5).text()
          });
        });
      }
      // get def units
      var def_units = [];
      var defenderUnits = defender.find('tr:gt(1)');
      if (defenderUnits.length == 0) def_units = '';
      else if (defenderUnits.length == 1) {
        var row = defenderUnits.find('td');
        var def_units = {
          unit: row.eq(0).text(),
          start: row.eq(1).text(),
          end: row.eq(2).text(),
          power: row.eq(3).text(),
          armour: row.eq(4).text(),
          shield: row.eq(0).text()
        }

      } else {

        defenderUnits.each(function(index, rw) {
          var row = $(rw).find('td');
          if (row.length == 6) def_units.push({
            unit: row.eq(0).text(),
            start: row.eq(1).text(),
            end: row.eq(2).text(),
            power: row.eq(3).text(),
            armour: row.eq(4).text(),
            shield: row.eq(5).text()
          });
        });
      }
      var bottom_text = $('div.battle-report').children('center').text();
      if (bottom_text.match(/Attacker Conquered the Base/i) != null) var conquered = 1;
      else
        var conquered = 0;
      var result = bottom_text.match(/Commander .+ \(.+ \d+\) was Killed/ig);
      if (result == null) var comm_killed = 0;
      else
        var comm_killed = result.length;
      var result = bottom_text.match(/Attacker got (\d+) Credits for Pillaging defender's Base./i);
      if (result == null) var pillage = 0;
      else
        var pillage = result[1];
      var result = bottom_text.match(/Total cost of units destroyed: \d+ \( Attacker: (\d+) ; Defender: (\d+) \)/i);
      if (result == null) {
        var att_destroyed = 0;
        var def_destroyed = 0;
      } else {
        var att_destroyed = result[1];
        var def_destroyed = result[2];
      }
      var result = bottom_text.match(/Experience: \( Attacker: \+(\d+) ; Defender: \+(\d+) \)/i);
      if (result == null) {
        var att_xp = 0;
        var def_xp = 0;
      } else {
        var att_xp = result[1];
        var def_xp = result[2];
      }
      var result = bottom_text.match(/New Debris in Space: ([0-9,]*)/i);
      if (result == null) var debris = 0;
      else
        var debris = result[1].replace(',', '');
      var req = {
        request: {
          mode: "combat",
          location: coords,
          att_id: att_id,
          att_level: att_lvl,
          def_id: def_id,
          def_level: def_lvl,
          time: time,
          commander: commander,
          command_centers: cc,
          def_base_id: def_base,
          def_base_start: def_start_def,
          def_base_end: def_end_def,
          att_units: att_units,
          def_units: def_units,
          att_fleet_loss: att_destroyed,
          def_fleet_loss: def_destroyed,
          att_xp: att_xp,
          def_xp: def_xp,
          debris: debris,
          pillage: pillage,
          conquered: conquered,
          commanders_killed: comm_killed,
          sendingPlayerId: ctG.SendingPlayerId
        }
      };
      ctF.PushUpload(req);
    } catch (e) {
      lg.debug(e, 'Error in ParseCombat', {
        stack: true
      });
    }
  }

  this.ParseFleet = function(coord, page, hasEyes, callback) {
    try {
      ctF.DisplayStatus('Parsing Fleet...');
      if (typeof hasEyes == 'undefined') hasEyes = false;
      if (page != null) {
        var page = $(page); // .parent();
        var table = page.filter('table[id$=_fleets]');
      } else {
        var table = $('table[id$=_fleets]');
      }

      var rows = [];
      if (table.find('table').length > 0) rows = $('table tr:gt(0)', table);
      else rows = $('tr:gt(1)', table);

      var universeId = safeMatch(coord, /[A-Z]/, [0]);
      var fleetIDArray = [];
      var fleets = [];
      var myTag = Player.tag;
      for (var i = 0; i < rows.length; i++) {
        var items = rows.eq(i).children();
        try {
          var fleetID = safeMatch($('a:first', items.eq(0)).attr('href'), /\d+/, [0]);
        } catch(te) {
          lg.debug(e, 'Error in ParseFleet(getting fleetId,line:1166)', {
            stack: true
          });
          econs.CallBack(callback, []);
          return;
        }
        var fleetname = $('a:first', items.eq(0)).text();
        var plk = $('a:first', items.eq(1));
        var playerId = safeMatch(plk.attr('href'), /\d+/, [0]);
        var txt = plk.text();
        var tag = (txt=='')?'':txt.match(/\[(\w+)\]/);
        if(tag && tag.length > 0) tag = tag[1];

        gPlayerId = playerId;
        var gt = plk.text();
        var g = gt.match(/\[.+\]/);
        g = (g == null) ? '' : g[0];
        var guildTag = g.replace('[', '').replace(']', '');

        fleetIDArray.push(fleetID);
        var x;
        var sizeEl = items.eq(3);
        var arrEl = items.eq(2);
        var titleEl = arrEl.parent();
        var data = {
          fleetId: fleetID,
          id: fleetID,
          fleetname: fleetname,
          idx: i,
          player_id: playerId,
          destination: coord,
          location: coord,
          hasEyes: hasEyes,
          arrival: (x = arrEl.attr('title')) > 0 ? x : 0,
          size: sizeEl.text().replace(/[^0-9]/g, ''),
          guildTag: guildTag
        };
        if (playerId == ctG.SendingPlayerId) {
          myTag = guildTag;
          if (data.arrival == 0) {
            // shade it
            $(rows[i]).css('background-color', prefs.Colors.MyLandedFleet);
            var inv = ctF.InvertColor(prefs.Colors.MyLandedFleet, true);
          } else {
            var det = fStats.IsVisibleFor(data.arrival, data.size);
            var t = '';
            if(det.Remaining > 0) {
              // invisible
              $(rows[i]).css('background-color', prefs.Colors.FleetVisible);
              var inv = ctF.InvertColor(prefs.Colors.FleetVisible, true);
              t = fStats.SecToTime(det.Remaining);
              titleEl.attr('title', 'Was detected ' + t + ' ago');
            } else {
              $(rows[i]).css('background-color', prefs.Colors.FleetNotVisible);
              var inv = ctF.InvertColor(prefs.Colors.FleetNotVisible, true);
              t = fStats.SecToTime(det.DetectionTime);
              titleEl.attr('title', 'Will be detected ' + t + ' from landing');
            }
          }
          $(rows[i]).find('a').css('color', inv);

        }
        ctF.DisplayStatus('Scanned Fleet' + data.fleetname);
        if (ctG.CheckRecs) {
          ctG.FleetList.push(data);
        }
        fleets.push(data);
      }
      for (var i = 0; i < rows.length; i++) {
        var items = rows.eq(i).children();
        var plk = $('a:first', items.eq(1));
        var playerId = safeMatch(plk.attr('href'), /\d+/, [0]);
        var hf = plk.text();
        var tag = hf.match(/\[(\w+)\]/);
        if(tag && tag.length>0) tag = tag[1];
        if (tag == myTag && playerId != ctG.SendingPlayerId) {
          $(rows[i]).css('background-color', prefs.Colors.GuildFleet);
          var inv = ctF.InvertColor(prefs.Colors.GuildFleet, true);
          $(rows[i]).find('a').css('color', inv);
        }
        if(tag != myTag) {
          $(rows[i]).css('background-color', prefs.Colors.EnemyFleet);
          var inv = ctF.InvertColor(prefs.Colors.EnemyFleet, true);
          $(rows[i]).find('a').css('color', inv);
        }
      }
      if (fleets.length > 0) {
        var req = {
          request: {
            mode: "fleet",
            destination: coord,
            hasEyes: hasEyes,
            angelVersion: econs.AngelVersion,
            sendingPlayerId: ctG.SendingPlayerId,
            fleets: fleets
          }
        }

        ctF.PushUpload(req);
      }
      econs.CallBack(callback, fleets);
    } catch (e) {
      lg.debug(e, 'Error in ParseFleet:', {
        stack: true
      });
      econs.CallBack(callback, []);
    }
  }

  this.ParseFleetDetails = function(msg, fleet, callback) {
    try {
      var fdetails = [];
      var obj = $(msg);
      ctF.UpdatePage(obj);
      var ftable = obj.filter('table#fleet_overview');
      //var fPlayer = ctF.FetchPlayer(fleet.player_id);
      //var fGuildId = (fPlayer) ? fPlayer.guildid : -1;
      var rcEl = ftable.find('small:contains(Recyclers are turned)');
      var rcOn = 'none';
      if (rcEl.length) {
        rcOn = rcEl.text().match(/turned on/);
        var style = false;
        if (rcOn) {
          rcOn = 'ON';
          style = true;
        } else
          rcOn = 'off';
        parse.log('RC::' + rcOn);
        // update page
        var xl = $('a[href*="fleet=' + fleet.id + '"]:eq(0)');
        if (xl.length) {
          parse.log('Found a A');
          var t = xl.text();
          t = '[RC:' + rcOn + '] ' + t;
          ctF.DisplayStatus(t);
        }
      }
      var details = ftable.find('tbody tr td.content table tr:gt(0)');
      for (var y = 0; y < details.length; y++) {
        var el = details[y];
        var uel = $('td:first', el);
        var amel = $('td', el).eq(1);
        var unit = uel.text();
        var amt = amel.text(); // FIXME, strip ,'s
        fdetails.push({
          unit: unit,
          amt: amt
        });
      }
      var fl = {
        fleetId: fleet.fleetId,
        fleetname: fleet.fleetname,
        location: fleet.location,
        destination: fleet.destination,
        playerId: fleet.player_id,
        size: fleet.size,
        angelVersion: ctG.AngelVersion,
        sendingPlayerId: ctG.SendingPlayerId,
        guildTag: fleet.guildTag,
        universeId: fleet.universeId,
        arrival: fleet.arrival,
        hasEyes: fleet.hasEyes,
        details: fdetails
      };
      var lmsg = 'Fleet Detail:<ul>' +
        '<li>(' + fleet.fleetId + ') ' +
        fleet.fleetname + '</li>' +
        '<li>Location:' + fleet.location + '</li>' +
        '<li>Owner:' + fleet.player_id + '[' + fleet.guildTag + ']</li>' +
        '<li>Size:' + fleet.size + '</li><li>Units:<ul>';

      $.each(fdetails, function(index, unit) {
        lmsg += '<li>' + unit.unit + ' - ' + unit.amt + '</li>';
      });
      lmsg += '</ul></li></ul>';

      ctF.DisplayStatus('Scanned fleet details', lmsg);

      ctF.PushUpload({
        'fleet_details': fl
      });
      econs.CallBack(callback, fl);
    } catch (e) {
      lg.debug(e, 'Error in ParseFleetDetails', {
        stack: true
      });
      econs.CallBack(callback, []);
    }
  }

  this.GetRegionsWithFleet = function(page, callback) {
    try {
      var data = {
        regions: [],
        fleetList: []
      }
      var Fleet = function() {
        return {
          fleetId: -1,
          fleetname: '',
          location: '',
          destination: '',
          playerId: -1,
          size: -1,
          angelVersion: ctG.AngelVersion,
          sendingPlayerId: ctG.SendingPlayerId,
          guildTag: '',
          universeId: '',
          arrival: '',
          hasEyes: true,
          details: []
        }
      };
      var obj = $(page);
      var trs = obj.find('.tbllisting1').find('tr').each(function() {
        var fl = new Fleet();
        var tr = $(this);
        var td2 = tr.find('td:eq(1)');
        if (td2.length == 0) return;
        var al0 = tr.find('td:eq(0)');
        fl.fleetname = al0.text();
        var al = tr.find('td:eq(1) a');
        var href = al.attr('href');
        var loc = safeMatch(href, /([A-Z]\d\d:\d\d).+/, [1]);
        data.regions.push(loc);
        var m = href.match(/([A-Z]\d\d:\d\d:\d\d:\d\d)/);
        if (m) fl.location = m[1];
        // get fleetId
        al = tr.find('td:eq(0) a');
        var fleetId = safeMatch(al.attr('href'), /fleet=(\d+)/, [1]);
        fl.fleetId = fleetId;
        // parse destination
        td2 = tr.find('td:eq(2)');
        al = tr.find('td:eq(2) a');
        fl.destination = '';
        if (al.length == 1) fl.destination = safeMatch(al.attr('href'), /([A-Z]\d\d:\d\d:\d\d:\d\d)/, [1]);
        td2 = tr.find('td:eq(3)');
        fl.arrival = td2.text();
        td2 = tr.find('td:eq(4)');
        fl.size = td2.text();
        data.fleetList.push(fl);
      });
      econs.CallBack(callback, data);
    } catch (e) {
      lg.debug(e, 'Error in GetRegionsWithFleet:', {
        stack: true
      });
      econs.CallBack(callback, {});
    }
  }

  this.GetBaseRegions = function(page, callback) {
    try {
      // get distinct list of regions user has bases in
      var regions = [];
      var obj = $(page);
      var trs = obj.find('.tbllisting1').find('tr').each(function() {
        var tr = $(this);
        var td2 = tr.find('td:eq(1)');
        if (td2.length == 0) return;
        var al = tr.find('td:eq(1) a');
        var loc = safeMatch(al.attr('href'), /([A-Z]\d\d:\d\d).+/, [1]);
        regions.push(loc);
      });
      econs.CallBack(callback, regions);
    } catch (e) {
      lg.debug(e, 'Error in GetBaseRegions:', {
        stack: true
      });
      econs.CallBack(callback, []);
    }
  }

  this.ParseProfile = function(callback, html, playerId) {
    try {
      ctF.DisplayStatus('Parsing Profile');
      // When `html` is supplied, parse from that fetched page (bulk profile
      // scan); otherwise parse from the live page DOM.
      var root, table, text;
      if (typeof html == 'string' && html.length > 0) {
        // $(html) strips html/head/body and returns body children as TOP-LEVEL
        // nodes, so .find() won't reach a root-level table. Wrap in a div so
        // every table is a descendant. Same root-handling the base/astro
        // parsers use on fetched pages.
        root = $('<div>').append($(html));
      } else {
        root = $(document);
      }
      table = root.find('table#profile_show table');
      text = table.find('th:eq(1)').text();

      if (table.length == 0) {
        lg.log('ParseProfile: no table#profile_show table found on ' + (playerId ? ('player ' + playerId) : 'live page'));
      }

      var invalid = root.find('center.error:contains(Invalid Player)');
      if (invalid && invalid.length > 0) {
        var data = {
          mode: 'invalidPlayer',
          sendingPlayerId: ctG.SendingPlayerId,
          universeId: 'z',
          playerId: playerId || safeMatch(search, /\d+/, [0])
        };
        var req = {
          request: data
        };
        doAjax(req, null, true, errorHandler);
        return;
      }
      var inactive = root.find('b:contains(Player Inactive)');
      var daysInactive = null;
      if (inactive.length) daysInactive = safeMatch(inactive.text(), /\d+/, [0]);

      var vac = root.find('b:contains(In Vacation Mode)');
      var daysinvac = null;
      if (vac.length) daysinvac = safeMatch(vac.text(), /\d+/, [0]);
      var data = {
        mode: 'profile',
        sendingPlayerId: ctG.SendingPlayerId,
        universeId: 'z',
        inactive: daysInactive,
        daysinvac: daysinvac
      };

      var result = text.match(/\[(.+)\] (.+)/);
      if (result) {
        data['guild_tag'] = result[1];
        data['player_name'] = result[2];
      } else {
        data['player_name'] = text;
        data['guild_tag'] = '';
      }
      var td = table.find('td:contains(Player)');
      var result = td.text().match(/Player: (\d+)/);
      if (result == null || result.length != 2) return;
      data['player_id'] = result[1];
      thisPlayerId = data['player_id'];
      var result = td.find('a');
      if (result.length == 0) data['guild_id'] = 0;
      else {
        data['guild_name'] = result.text();
        var result = result.attr('href').match(/guild=(\d+)/);
        if (result != null) // return;
          data['guild_id'] = result[1];
      }
      var result = td.text().match(/Level: (.+) \(Rank/i);
      var t = result[1].match(/[0-9,.]+/);
      var level = ctF.ConvertNumber(result[1]);
      data['level'] = t[0];

      ctF.PushUpload({
        request: data
      });
      econs.CallBack(callback, data);

    } catch (e) {
      lg.debug(e, 'Error in ParseProfile:', {
        stack: true
      });
      econs.CallBack(callback, {});
    }

  }

  this.SendFleetList = function() {
    try {
      var flist = fleetDetailList;

      var req = {
        request: {
          mode: 'fleetDetail',
          fleets: flist
        }
      };
      ctF.PushUpload(req);
      fleetDetailList = [];
      fleetList = [];
      fleetIndex = 0;

    } catch (e) {
      lg.debug(e, 'Error in SendFleetList', {
        stack: true
      });
    }
  }

  this.AddDataSdiv = function(location, img, isFoggy) {
    var req = {
      request: {
        mode: 'systemdata',
        location: location,
        sendingPlayerId: ctG.SendingPlayerId
      }
    };
    parse.log('AddDataSdiv: Need to ajax dsis here')

  }

  this.FakeEyesAstroBase = function(location, isFoggy) {
    html = '<table class="base" align="center" width="1000"><tbody>' + '<tr><td width="33%"><center><br>' + '<b>Astro Type:</b> astroType<br><br>' + '<b>Terrain:</b> terrain<br><br>' + '<b>Area:</b> area<br><br>' + '<b>Solar Energy:</b> solar<br><br>' + '<b>Fertility:</b> fertility<br><br>' + '<table id="base_resources" class="no_back" align="center"><tbody>' + '<tr><th>Resources</th></tr><tr><td class="content" style="padding: 0px">' + '<table class="layout listing3"><tbody>' + '<tr><td>Metal</td><td align="right">metal</td></tr>' + '<tr><td>Gas</td><td align="right">gas</td></tr>' + '<tr><td>Crystals</td><td align="right">xtal</td></tr></tbody>' + '</table></td></tr></tbody></table><br></center></td>' + '<th class="dropcap" width="34%">Coming Soon<br><br>' + '<img src="https://cdn.astroempires.com/skins/AE_Original/images/astros/Rocky.jpg" alt=""><br><br></th>' + '<td width="33%"><br>' + '<table id="base_processing-capacities" class="no_back" align="center"><tbody>' + '<tr><th>Base information</th></tr><tr><td class="content" style="padding: 0px">' + '<table class="layout listing3" align="center"><tbody>' + '<tr align="center"><td>Base Owner</td>' + '<td colspan="2"><a href="profile.aspx?player=-1" title="Player level level">[tag]  nick</a></td></tr>' + '<tr align="center"><td>Occupier</td><td colspan="2"></td></tr>' + '<tr><th colspan="3">&nbsp;</th></tr><tr align="center">' + '<td>Economy</td><td align="right">economy</td><td>cred./h</td></tr>' + '<tr align="center"><td>Owner Income</td><td align="right">income</td>' + '<td>cred./h</td></tr><tr><th colspan="3">&nbsp;</th></tr>' + '<tr align="center"><td>Construction</td><td align="right">construction</td><td>cred./h</td></tr>' + '<tr align="center"><td>Production</td><td align="right">production</td><td>cred./h</td></tr>' + '<tr align="center"><td>Research</td><td align="right">research</td><td>cred./h</td></tr>' + '</tbody></table></td></tr></tbody></table><br></td></tr>' + '<tr><td colspan="3" align="center">Base Commander: commander ' + '<small>(level)</small></td></tr></tbody></table>';
    var tbl = $('table.astro');
    if (tbl.length == 0) {
      tbl = $('table.base');
    }
    var tp = tbl.parent();
    if (!isFoggy) tbl.remove();
    $('#link_fleet_move_here').parent().append(html);
  }

}
