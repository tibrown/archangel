var BuildHints = function() {

  this.count = 0;

  this.log = function(msg) {
    lg.log('bHints:' + msg);
  }

  this.ParseBaseStructures = function() {
    if (bHints.count > 0) return;
    spyDetect.AddHook(bHints.RemoveUI);
    bHints.ParseBaseStructuresOrig();
    bHints.DoBaseCalc();
    bHints.count++;
  }

  this.ParseBaseStructuresOrig = function() {
    try {
      bHints.page_state = {};
      bHints.page_state.structures = {};
      var page_state = bHints.page_state;

      var basemetal = /bases metal\.\((\d+)\)/;
      var basefert = /capacity by bases fertility\.\((\d)\)/;
      var base_structures = $('#base_structures');
      if (!base_structures || base_structures.length === 0) return;
      var rows = base_structures.find('tr');
      var items = base_structures.find('.item');
      var regex = /item_([^ ]*)/;
      var regex2 = /\(Level ([0-9]+)\)/;
      var regex3 = /out area/;
      var regex4 = /out energy/;
      var regex5 = /out popul/;

      var result = basemetal.exec(base_structures.html());
      if (result) page_state.base_metal = parseInt(result[1]);

      var result = basefert.exec(base_structures.html());
      if (result) page_state.base_fert = parseInt(result[1]);

      for (var x = 0; x < items.length; x++) {
        var row = $(items[x]).parent().parent();
        var res = regex.exec(items[x].className);
        if (res) {
          var structure = res[1];
          try {
            var res2 = regex2.exec(row.text());
            if (res2) var level = parseInt(res2[1]);
            else level = 0;
          } catch(re) {
            lg.log('res2 regex error:' + re.message);
            level = 0;
          }
          page_state.structures[structure] = {};
          page_state.structures[structure].level = level;
          page_state.structures[structure].cost = parseInt($('td:eq(2)', row).text().replace(',', ''));
          page_state.structures[structure].row = row;

          if (structure == 'solar-plants') page_state.base_solar = parseInt($('td:eq(3)', row).text());
          if (structure == 'gas-plants') page_state.base_gas = parseInt(('td:eq(3)', row).text());
          if (structure == 'crystal-mines') page_state.base_xtal = parseInt(('td:eq(4)', row).text());

          try {
            if (regex3.exec(row.text())) page_state.need_area = true;
          } catch(re) {
            page_state.need_area = false;
            lg.log('regex3 regex error:' + re.message);
          }
          try {
            if (regex4.exec(row.text())) page_state.need_energy = true;
          } catch(re) {
            page_state.need_energy = false;
            lg.log('regex4 regex error:' + re.message);
          }
          try {
            if (regex5.exec(row.text())) page_state.need_pop = true;
          } catch(re) {
            page_state.need_pop = false;
            lg.log('regex5 regex error:' + re.message);
          }
        }
      }
      // current structures parsed, look for in-progress one
      var active = base_structures.find('.active');
      if (active.length) {
        var row = $(active[0]).parent();
        var item_div = $('.item', row);
        if (item_div.length === 0) return;
        var res = regex.exec(item_div[0].className);
        if (!res) return;
        var structure = res[1];
        if (!page_state.structures[structure]) return;
        page_state.structures[structure].level = page_state.structures[structure].level + 1;
        page_state.structures[structure].cost = page_state.structures[structure].cost * 1.5;
        bHints.log('in-progress structure found');
      }
      var baseid = /[0-9]+/.exec(window.location.href)[0];

      for (var x in page_state.structures) {
        var y = page_state.structures[x];
      }
      // current and in-progress parsed, find queued
      var base_queue = $('#base-queue');
      var tbl = $('table', base_queue).first();
      var rows = $('tr', tbl);
      for (var x = 0; x < (rows.length - 1); x++) {
        var row = rows[x];
        var cell = $('td:eq(0)', row);
        var structure = cell.text().toLowerCase().replace(' ', '-');
        if (page_state.structures[structure]) {
          page_state.structures[structure].level = page_state.structures[structure].level + 1;
          page_state.structures[structure].cost = page_state.structures[structure].cost * 1.5;
        }
      }
      bHints.page_state = page_state;

    } catch (e) {
      lg.debug(e, 'Error in bHints.ParseBaseStructuresOrig:', {
        stack: true
      });
    }
  }

  this.DoRatios = function(structure, all_structures, construction, production, economy, energy, pop, area) {
    try {
      var this_structure = all_structures[structure];
      if (!this_structure) bHints.log('error with structure: ' + structure);
      var cost = this_structure.cost;
      var data = bHints.current_base_data;
      //var col2 = this_structure.row.insertCell(-1);
      var areacost = 0;
      var energycost = 0;
      var ret = new Object();
      if (area < 0) { // if this structure uses area, count the cost of land
        areacost = data.best_area.area;
      }
      if (energy < 0) {
        energycost = data.best_ene.energy * (energy * -1);
      }
      var truecost = areacost + energycost + cost;
      ret.truecost = truecost;
      if (construction > 0) {
        //col3.innerHTML = Math.round(truecost / construction, 2);
        ret.con = truecost / construction;
        //col3.style.display = 'none';
      }
      if (0) {
        bHints.log(production);
        bHints.log(data.best_area);
      }
      bHints.log('name:' + structure + ' bc:' + cost + ' tc:' + truecost + ' ac:' + areacost + ' ec:' + energycost);

      if (production > 0) {
        ret.prod = truecost / production;
      }
      if (economy > 0) {
        ret.eco = truecost / economy;
      }
      if (pop > 0) {
        ret.pop = truecost / pop;
      }
      if (energy > 0) {
        ret.energy = truecost / energy
      }
      if (area > 0) {
        ret.area = cost / area;
      }
      var link = '<a href="#" title="Base cost: ' + truecost + ', Energy cost: ' + energycost + '">?</a>';
      $(this_structure.row).append(link);

      return ret;
    } catch (e) {
      lg.debug(e, 'Error in bHints.DoRatios:', {
        stack: true
      });
    }
  }

  this.MarkBest = function(klass, code, color, title, needed) {
    try {
      var row = $('.item_' + klass + ':eq(0)').parent().parent();
      var col = row.append('<td class="VeryImp" style="color: "' + color + '" title="' + title + '">' + code + "</td>");
      if (needed) {
        row.css('background', 'green');
      }
    } catch (e) {
      lg.debug(e, 'Error in MarkBest', {
        stack: true
      });
      bHints.log(klass);
    }
  }

  this.RemoveUI = function() {
    $('.VeryImp').remove();
  }

  this.DoBaseCalc = function() {
    try {
      bHints.current_base_data = new Object();
      var data = bHints.current_base_data;

      var str = bHints.page_state.structures;

      if (!str) return;
      if (!str['urban-structures']) { // urbans not found, something went wrong, abort! abort!
        return;
      }

      if (str.terraform) data.terra_rate = bHints.DoRatios('terraform', str, 0, 0, 0, 0, 0, 5);
      if (str['multi-level-platforms']) data.mlp_rate = bHints.DoRatios('multi-level-platforms', str, 0, 0, 0, 0, 0, 10);

      data.best_area = new Object();
      data.best_area.area = 0; // the cost of the next area is 0, enless 1st pass finds terra/mlp

      var best_name = false;
      if (data.terra_rate) {
        data.best_area = data.terra_rate;
        best_name = 'terraform';
      }
      if (data.mlp_rate) {
        data.best_area = data.mlp_rate;
        best_name = 'multi-level-platforms';
      }
      // if mlp isnt null and its better, take it as best
      if (data.mlp_rate && (data.mlp_rate.area < data.best_area.area)) {
        data.best_area = data.mlp_rate;
        best_name = 'multi-level-platforms';
      }
      // if terra is better then 'best' switch to it
      if (data.terra_rate && (data.terra_rate.area < data.best_area.area)) {
        data.best_area = data.terra_rate;
        best_name = 'terraform';
      }
      //debug('cost of each unit of area is '+data.best_area.area);
      if (best_name) bHints.MarkBest(best_name, 'A', '#ff00ff', 'Best structure to increase area', bHints.page_state.need_area);

      if (str['urban-structures']) data.urban_rate = bHints.DoRatios('urban-structures', str, 0, 0, 0, 0, bHints.page_state.base_fert, -1);
      if (str['orbital-base']) data.orbit_rate = bHints.DoRatios('orbital-base', str, 0, 0, 0, 0, 10, 0);

      data.best_pop = new Object();
      data.best_pop.pop = 99999;
      if (data.urban_rate.pop < data.best_pop.pop) {
        data.best_pop = data.urban_rate;
        best_name = 'urban-structures';
      }
      if (data.orbit_rate)
        if (data.orbit_rate.pop < data.best_pop.pop) {
          data.best_pop = data.orbit_rate;
          best_name = 'orbital-base';
        }
      bHints.MarkBest(best_name, 'P', 'yellow', 'Best structure for population', bHints.page_state.need_pop);

      if (str['solar-plants']) data.solar_rate = bHints.DoRatios('solar-plants', str, 0, 0, 0, bHints.page_state.base_solar, -1, -1);
      if (str['gas-plants']) data.gas_rate = bHints.DoRatios('gas-plants', str, 0, 0, 0, bHints.page_state.base_gas, -1, -1);
      if (str['fusion-plants']) data.fusion_rate = bHints.DoRatios('fusion-plants', str, 0, 0, 0, 4, -1, -1);
      if (str['antimatter-plants']) data.anti_rate = bHints.DoRatios('antimatter-plants', str, 0, 0, 0, 10, -1, -1);
      if (str['orbital-plants']) data.orbitplant_rate = bHints.DoRatios('orbital-plants', str, 0, 0, 0, 12, -1, 0);

      data.best_ene = new Object();
      data.best_ene.energy = 99999;
      if (data.solar_rate && (data.solar_rate.energy < data.best_ene.energy)) {
        data.best_ene = data.solar_rate;
        best_name = 'solar-plants';
      }
      if (data.gas_rate && (data.gas_rate.energy < data.best_ene.energy)) {
        data.best_ene = data.gas_rate;
        best_name = 'gas-plants';
      }
      if (data.fusion_rate && (data.fusion_rate.energy < data.best_ene.energy)) {
        data.best_ene = data.fusion_rate;
        best_name = 'fusion-plants';
      }
      if (data.anti_rate && (data.anti_rate.energy < data.best_ene.energy)) {
        data.best_ene = data.anti_rate;
        best_name = 'antimatter-plants';
      }
      if (data.orbitplant_rate && (data.orbitplant_rate.energy < data.best_ene.energy)) {
        data.best_ene = data.orbitplant_rate;
        best_name = 'orbital-plants';
      }
      bHints.MarkBest(best_name, 'E', 'purple', 'Best structure for energy', false);

      // construction, production, and econ sources
      if (str['metal-refineries']) data.mrr = bHints.DoRatios('metal-refineries', str, bHints.page_state.base_metal, bHints.page_state.base_metal, 1, -1, -1, -1);
      if (str['robotic-factories']) data.rfr = bHints.DoRatios('robotic-factories', str, 2, 2, 1, -1, -1, -1);
      if (str['nanite-factories']) data.nfr = bHints.DoRatios('nanite-factories', str, 4, 4, 2, -2, -1, -1);
      if (str['android-factories']) data.afr = bHints.DoRatios('android-factories', str, 6, 6, 2, -4, -1, -1);

      // prod and econ sources
      if (str['shipyards']) data.shiprate = bHints.DoRatios('shipyards', str, 0, 2, 1, -1, -1, -1);
      if (str['orbital-shipyards']) data.orbityardrate = bHints.DoRatios('orbital-shipyards', str, 0, 8, 2, -12, -1, 0);

      // econ sources
      if (str['crystal-mines']) data.xtalr = bHints.DoRatios('crystal-mines', str, 0, 0, bHints.page_state.base_xtal, -1, -1, -1);
      if (str.spaceports) data.portr = bHints.DoRatios('spaceports', str, 0, 0, 2, -1, -1, -1); // FIXME
      if (str['economic-centers']) data.ecor = bHints.DoRatios('economic-centers', str, 0, 0, 3, -2, -1, -1);

      data.bestcon = new Object();
      data.bestcon.con = 99999;
      if (data.mrr.con < data.bestcon.con) {
        data.bestcon = data.mrr;
        best_name = 'metal-refineries';
      }
      if (data.rfr && (data.rfr.con < data.bestcon.con)) {
        data.bestcon = data.rfr;
        best_name = 'robotic-factories';
      }
      if (data.nfr && (data.nfr.con < data.bestcon.con)) {
        data.bestcon = data.nfr;
        best_name = 'nanite-factories';
      }
      if (data.afr && (data.afr.con < data.bestcon.con)) {
        data.bestcon = data.afr;
        best_name = 'android-factories';
      }

      bHints.MarkBest(best_name, 'C', 'red', 'Best structure for construction<br>' + data.bestcon.con, false);

      data.bestprod = new Object();
      data.bestprod.prod = 99999;
      if (data.mrr.prod < data.bestprod.prod) {
        data.bestprod = data.mrr;
        best_name = 'metal-refineries';
      }
      if (data.rfr && (data.rfr.prod < data.bestprod.prod)) {
        data.bestprod = data.rfr;
        best_name = 'robotic-factories';
      }
      if (data.nfr && (data.nfr.prod < data.bestprod.prod)) {
        data.bestprod = data.nfr;
        best_name = 'nanite-factories';
      }
      if (data.afr && (data.afr.prod < data.bestprod.prod)) {
        data.bestprod = data.afr;
        best_name = 'android-factories';
      }
      if (data.shiprate.prod < data.bestprod.prod) {
        data.bestprod = data.shiprate;
        best_name = 'shipyards';
      }
      if (data.orbityardrate && (data.orbityardrate.prod < data.bestprod.prod)) {
        data.bestprod = data.orbityardrate;
        best_name = 'orbital-shipyards';
      }
      bHints.MarkBest(best_name, 'P', 'green', 'Best structure for production<br>' + data.bestprod.prod, false);

      data.besteco = new Object();
      data.besteco.eco = 99999;
      if (data.xtalr && (data.xtalr.eco < data.besteco.eco)) {
        data.besteco = data.xtalr;
        best_name = 'crystal-mines';
      }
      if (data.mrr.eco < data.besteco.eco) {
        data.besteco = data.mrr;
        best_name = 'metal-refineries';
      }
      if (data.rfr && (data.rfr.eco < data.besteco.eco)) {
        data.besteco = data.rfr;
        best_name = 'robotic-factories';
      }
      if (data.nfr && (data.nfr.eco < data.besteco.eco)) {
        data.besteco = data.nfr;
        best_name = 'nanite-factories';
      }
      if (data.afr && (data.afr.eco < data.besteco.eco)) {
        data.besteco = data.afr;
        best_name = 'android-factories';
      }
      if (data.shiprate.eco < data.besteco.eco) {
        data.besteco = data.shiprate;
        best_name = 'shipyards';
      }
      if (data.portr.eco < data.besteco.eco) {
        data.besteco = data.portr;
        best_name = 'spaceports';
      }
      if (data.ecor && (data.ecor.eco < data.besteco.eco)) {
        data.besteco = data.ecor;
        best_name = 'economic-centers';
      }
      if (data.orbityardrate && (data.orbityardrate.eco < data.besteco.eco)) {
        data.besteco = data.orbityardrate;
        best_name = 'orbital-shipyards';
      }
      bHints.MarkBest(best_name, 'E', 'white', 'Best structure for Economy<br>' + data.besteco.eco, false);
    } catch (e) {
      lg.debug(e, 'Error in DoBaseCalc', {
        stack: true
      });
    }
  }

	this.BaseArrows = function(doc,servid) {
		var base_box = doc.getElementsByTagName('select')[0];
		if (base_box == undefined) return;
		var last;
		var last_name;
		var next;
		var next_name;
		for (var i=0; i < base_box.options.length; i++) {
			if (base_box.options[i].selected == true) {
				if (i > 0) {
					last = base_box.options[i-1].value;
					last_name = base_box.options[i-1].textContent;
				}
				if (base_box.options[i+1]) {
					next = base_box.options[i+1].value;
					next_name = base_box.options[i+1].textContent;
					break;
				}
			}
		}
		var inputs = base_box.parentNode.getElementsByTagName('input');
		var view;
		for (var i=0; i < inputs.length; i++) {
			if (inputs[i].name == 'view') view = inputs[i].value;
		}
		if (last) {
			var last_link = doc.createElement('a');
			last_link.textContent = '<';
			last_link.href= '/base.aspx?base=' + last + '&view=' + view;
			last_link.title = last_name;
			base_box.parentNode.insertBefore(last_link,base_box);
		}
		if (next) {
			var next_link = doc.createElement('a');
			next_link.textContent = '>';
			next_link.href = '/base.aspx?base=' + next + '&view=' + view;
			next_link.title = next_name;
			base_box.parentNode.insertBefore(next_link,base_box.nextSibling);
		}
	}
}
