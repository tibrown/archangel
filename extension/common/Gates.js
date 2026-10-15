/*
This class will get gate info
*/

var Gates = function() {

  this.GetFastest = function() {
    this.JgSearch('fastest');
  }

  this.GetClosest = function(loc, fleetId) {
    this.JgSearch('closest');
  }

  this.GetRoute = function() {
    try {
      var dest = $('#destination').val();
      var start = $('#start').text();
      var speed = 0;
      try {
        speed = parseFloat($('#maxspeed').text());
      } catch (ex) {
        ;
      }
      if (speed == 0) return;

      var jgstr = $('small:contains("Jump Gate ")').text();
      var jg = jgstr.match(/Jump Gate (\d+)/);
      if (jg && jg.length > 0) jg = parseInt(jg[1]);
      var basespeed = speed / (1 + jg);
      var result = gHints.FindFastestRoute(start, dest, basespeed, jg);
      return result;
    } catch (e) {
      lg.debug(e, 'Error in gates.GetRoute', {
        stack: true
      });
    }
  }

  this.JgSearch = function(method) {
    try {
      var dest = $('#destination').val();
      var start = $('#start').text();
      var fleetId = window.location.search.match(/fleet=(\d+)/)[1];

      dsisReq.MakeRequest({
        request: {
          mode: "jg_search",
          sloc: start,
          dloc: dest,
          method: method,
          sendingPlayerId: ctG.SendingPlayerId,
          universeId: 'z'
        }
      }, GmServer.DsisServers[0], function(data) {
        data = data.data;
        if (data.result != dest && data.result != start) {
          $('#destination').val(data.result).css('background-color', '#008800').css('color', 'white');
          $('#destination').trigger('change');
          var m = new Message('sidebar', 'JgDetails', {
            JgDetails: data.jgDetails
          });
          ctF.SendMessage(m);
        } else
          $('#destination').css('background-color', '#880000').css('color', 'white');
      });
    } catch (e) {
      lg.debug(e, 'Error in gates.JgSearch', {
        stack: true
      });
    }
  }

}

/*
select b.baseid,p.nick,  p.guildid, b.location, b.ownerplayerid,
  b.jumpgate, b.name
from base b
join player p on b.ownerplayerid = p.playerid
where p.guildid = 1 and b.jumpgate > 0
order by b.location
*/
