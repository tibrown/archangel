/*
 * All content global functions go here
 */

var ctFuncs = function() {

  this.InitFromServerData = function() {
    GmServer = ServerData.GmServer;
    econs.SetGmServersJson(ServerData.GmServersJson);

    aScout.ActiveScout = ServerData.ActiveScout;
    prefs = ServerData.Preferences;
  }
  
  this.GetBattleUrl = function() {
    /*
    Vig 5:00 PM
Example URL for a battle calc, if you break that out into the parameters you can see what I was kind of talking about. It shouldn't be much harder than putting together a json bundle
https://aebits.win/aeBattleCalc?aT=Arm:27,Las:27,Pla:20,Sld:17,Level:54.67&aS=FT:8000,HC:1000&dT=Arm:26,Las:24,Pla:20,Sld:14,Pho:11,Dis:4,CC:1,Level:59.83&dS=FT:1407,RC:30,HC:24,DN:4,OT:5.54,DT:8.31,PR:2.77
*/
    
  }

  this.GetGuildMembers = function(msg) {
    var dsisServer = GmServer.DsisServers[0];
    var url = 'guild.aspx';
    ctF.DoGetAE(url, function(page) {
      // parse guil;d page
      var members = parse.ParseGuildPage(page);
      var m = new Message('background', msg.actionArgs.action, {
        Members: members,
        GmServer: GmServer
      });
      chrome.runtime.sendMessage(m);
    });
  }

  this.GetSuperScanners = function() {
    var dsisServer = GmServer.DsisServers[0];
    var url = 'http://' + dsisServer.dsisHost + '/' + dsisServer.dbName +
      '/parse/superscanners?sendingPlayerId=' + ctG.SendingPlayerId;
    dsisU.DoAjax(url, ctG.SendingPlayerId, {}, function(data) {
      var fleets = data.data.data;
      var m = new Message('background', 'SSFleet', {
        Fleets: fleets,
        GmServer: GmServer
      });
      chrome.runtime.sendMessage(m);
    });
  }

  this.SaveStorage = function(storagePacket) {
    // saves to database
    this.PushUpload(storagePacket);
    // update server data IF it is prefs, or activeScout
  }

  this.SaveCentralStorage = function(storagePacket, callback) {
    var l = [];
    l.push(storagePacket);
    // saves to central database
    chrome.runtime.sendMessage(new Message('background', 'SaveCentralStorage', {
      Packets: l,
      ServerData: ServerData
    })).then(function(resp) {
      econs.CallBack(callback, resp);
    });
  }

  this.SaveErrorPacket = function(errorPacket) {
    // saves to central database
    chrome.runtime.sendMessage(new Message('background', 'SaveErrorPacket', {
      ErrorPacket: errorPacket,
      ServerData: ServerData
    }));
  }

  this.DeleteActiveScout = function(gmServer, callback) {
    // send request
    chrome.runtime.sendMessage(new Message('background', 'DeleteActiveScout', {
      GmServer: gmServer
    })).then(function(resp) {
      econs.CallBack(callback, resp);
    });
  }

  this.SaveActiveScoutToCentral = function(callback) {
    var key = ActiveScout.StorageKey; // + '-' + aScout.ActiveScout.Galaxy;
    ctF.SaveCentralStorage(new StoragePacket(ServerData.ActiveScout,
      key,
      GmServer.servid,
      ctG.SendingPlayerId,
      StoragePacket.StorageScouting), callback);

  }

  this.SavePreferences = function(callback) {
    try {
      ctF.SaveCentralStorage(new StoragePacket(prefs,
        prefs.StorageKey,
        GmServer.servid,
        ctG.SendingPlayerId,
        StoragePacket.StoragePreferences), callback);
      // now update ServerData
      ServerData.Preferences = prefs;
      ServerData.LastSaved = ServerData.LastUpdated = Date.now();
      comms.UpdateServerData();
    } catch (e) {
      lg.debug(e, 'Error in SavePreferences:', {
        stack: true
      });
    }
  }
  // check display values
  this.CheckConfig = function() {
    try {
      var el = $('[name="language"]');
      if (el.length == 0) return;
      if (document.getElementsByName('language')[0].value != 'en') {
        alert('Language must be set to english');
        return;
      }
      if (['0', '2'].indexOf(document.getElementsByName('n_format')[0].value) == -1) {
        alert('Number format must be 1,000.01 or 1000.01');
        return;
      }
      // if (document.getElementsByName('map')[0].value != '1') {
      //   alert('Map style must be static');
      //   return;
      // }
      if (['ae_original', 'darkAstros'].indexOf(document
          .getElementsByName('skin')[0].value) == -1) {
        alert('Skin must be ae original or dark astros');
        return;
      }
      lg.log('Config:all ok');
    } catch (e) {
      lg.debug(e, 'Error in CheckConfig:', {
        stack: true
      });
    }
  }

  this.DisplayStatus = function(msg, fullStatus = null) {
    try {
      var cid = '';
      if (ctG.TabData) cid = ctG.TabData.id;
      // this will be a screen update in panel
      ctF.log('DisplayStatus called with:' + msg);
      var m = new Message('sidebar', 'DisplayStatus', {
        displayText: msg,
        logEntry: {
          message: msg,
          log: fullStatus
        },
        from: 'C:' + cid,
        tabData: ctG.TabData
      });
      ctF.SendMessage(m);
      m.target = 'background';
      m.action = 'StatusLog';
      comms.SendMessageToBG(m);
    } catch (e) {
      lg.debug(e, 'Error in DisplayStatus:', {
        stack: true
      });
    }
  }

  this.PushUpload = function(data) {
    try {
      ctF.log('PushUpload called with: ' + JSON.stringify(data).substring(0, 200));
      if (GmServer.DsisServers.length == 0) {
        ctF.log('PushUpload:No DSIS Server Active');
        ctF.DisplayStatus('No DSIS Server Active');
        return;
      }
      //var gmJson = ctF.GetGmServerJsonByUrl(window.location.href);

      var message = new Message('background', 'UploadData', {
        data: data,
        playerId: ctG.SendingPlayerId
      });

      comms.SendMessageToBG(message);
    } catch (e) {
      lg.debug(e, 'Error in PushUpload:', {
        stack: true
      });
    }
  }

  this.FlushUpload = function() {
    try {
      ctF.log('FlushUpload Called');
      var message = new Message('background', 'FlushUpload', {
        cmd: 'doit'
      });
      comms.SendMessageToBG(message);
    } catch (e) {
      lg.debug(e, 'Error in FlushUpload:', {
        stack: true
      });
    }
  }

  this.log = function(msg) {
    lg.log('CT:' + msg);
  }

  this.SendProfileSummary = function(playerId) {
    try {
      if (GmServer == null) {
        ctF.DisplayStatus('GmServer not set');
        ctF.log('No GmServer');
        return;
      }
      if (GmServer.DsisServers.length == 0) {
        ctF.DisplayStatus('ctF:No active DSIS servers');
        ctF.log('No DSIS servers');
        return;
      }
      var req = {
        request: {
          mode: 'player_summary',
          id: playerId,
          universeId: 'z',
          sendingPlayerId: ctG.SendingPlayerId
        }
      }
      dsisReq.MakeRequest(req, GmServer.DsisServers[0], function(response) {
        var r = response.data.result;

        var msg = new Message('sidebar', 'PlayerSummary', {
          PlayerId: playerId,
          Tech: r.tech,
          Bases: r.bases,
          Players: r.players,
          Fleets: r.fleets,
          Comments: r.comments
        });
        ctF.SendMessage(msg);
      });
    } catch (e) {
      lg.debug(e, 'Error in SendProfileSummary:', {
        stack: true
      });
    }
  }

  this.DoGetAE = function(url, callback, callback2, postData, errorhandler) {
    try {
      var ajaxIt = function(url, callback, callback2, postData, errorhandler) {
        ctF.log('Got connection');
        $.ajax({
          url: uri,
          type: mode,
          data: postData,
          success: function(data, textStatus, req) {
            try {
              cPool.Release(conn);
              var m = data.match(/You are requesting too many pages in a small period of time /);
              if (m) {
                ctF.Display('Going too fast, aborting operation');
                ctF.log('Going too fast, aborting operation');
                return;
              }
              if ((data.indexOf('js_jquery_debug') != -1) || (data.indexOf('debug.aspx') != -1)) {
                ctF.log('SPY FOUND' + data);
                var sp = new StoragePacket(data, 'SPY_FOUND', GmServer.servid, ctG.SendingPlayerId);
                ctF.SaveStorage(sp);
                // Stop writing to the DOM: remove any injected UI and set the
                // sticky flag so no further DOM writes happen this session.
                spyDetect.TurnOff();
                return;
              }
              if (typeof callback == 'function') {
                var m = url.match(/base=(\d+)/);
                var baseId = (m == null) ? '' : m[1];
                try {
                  callback(data, callback2, baseId);
                  return;
                } catch (es) {
                  lg.debug(es, 'Unhandled error in callback to ctF.DoGetAE.success', {
                    stack: true,
                    details: {
                      url: url,
                      callback_source: callback,
                      html: data,
                      textStatus: ''
                    }
                  });
                }

              }
            } catch (e) {
              cPool.Release(conn);
              lg.debug(e, 'Error in DoGetAE.ajaxIt.success', {
                stack: true,
                details: {
                  url: url,
                  callback_source: callback,
                  html: data
                }
              });
              // FIXME fatal error
              if (typeof errorhandler == 'function') {
                errorhandler("getAE.success::Error::", data);
              }
            }
          },
          error: function(req, errorText, error) {
            cPool.Release(conn);
            lg.debug('http error in ctF.DoGetAE.ajaxIt.error', 'error', {
              details: {
                url: url,
                callback_source: callback,
                errorText: errorText,
                error: error,
                response: req
              }
            });
            if (typeof errorhandler == 'function') {
              errorhandler("getAE failed::Error::" + errorText + ', ' + error);
            }
          }
        }); // ajax
      }
      var waitForConn = function() {
        ctF.log('Connection null, waiting...');
        window.setTimeout(function() {
          conn = cPool.GetConnection();
          if (conn == null) {
            waitForConn();
            return;
          }
          ajaxIt(uri, callback, callback2, postData, errorhandler);
          return;
        }, 1000);
      }
      var mode = 'GET';
      var sn = econs.GetGmServerNameFromUrl(window.location.href);
      var gmServerJson = econs.GetServerJsonByName(sn);

      var uri = 'https://' + gmServerJson.serverName + '.astroempires.com/' + url;
      if (typeof postData != 'undefined') mode = 'POST';
      var conn = cPool.GetConnection();

      if (conn == null) {
        waitForConn();
        return;
      } else {
        ajaxIt(uri, callback, callback2, postData, errorhandler);
        return;
      }
    } catch (e) {
      lg.debug(e, 'Error in DoGetAE:', {
        stack: true
      });
    }
  }

  this.SetServerOffset = function() {
    try {
      var st = $('#server-time').text();
      // Server renders e.g. "Oct 15 2026, 17:22:44". moment's generic ISO/RFC
      // detection doesn't recognise that shape and logs a deprecation warning,
      // so give it an explicit format (with the comma stripped) to parse cleanly.
      var mst = moment(st.replace(',', ''), 'MMM D YYYY HH:mm:ss');
      var now = moment();
      var duration = moment.duration(now.diff(mst));
      if (duration < 0) {
        // we are behind ST, add offset to our time
        duration = moment.duration(mst.diff(now));
        AheadOfServerTime = false;
      } else if (duration > 0) {
        // we are ahead of server time
        AheadOfServerTime = true;
      }
      ServerTimeOffset = Math.round(duration.asHours());
      // if ServerTimeOffset == 0 we are IN the same TZ as server
      ctF.log('TOFF:' + ServerTimeOffset);
    } catch (e) {
      lg.debug(e, 'Error in SetServerOffset:', {
        stack: true
      });
    }
  }

  // stime is a moment..in local time
  this.GetServerTime = function(stime) {
    try {
      return (AheadOfServerTime===true)?stime.subtract(ServerTimeOffset, 'hours'):stime.add(ServerTimeOffset, 'hours');
    } catch (e) {
      lg.debug(e, 'Error in GetServerTime:', {
        stack: true
      });
    }
  }

  this.RandomTime = function(begin, end) {
    // need to get a random integer between begin and end
    return end;
  }

  this.UpdatePage = function(msg) {
    try {
      if (typeof msg == 'undefined') msg = $('body');
      // Strip <script> tags: jQuery .html() will try to execute them, which the
      // game page's CSP blocks (script-src 'self') — the injected copy is only a
      // visual refresh, so scripts are unnecessary.
      var sanitize = function(html) {
        // Strip <script> tags (jQuery .html() would try to execute them, which
        // the game's CSP blocks) without ever handing the string to a CSS
        // selector parser. Native innerHTML on a detached node parses HTML
        // exactly, never selects, and never runs scripts.
        if (html == null) return '';
        var d = document.createElement('div');
        d.innerHTML = html;
        $(d).find('script').remove();
        return d.innerHTML;
      };
      // Do NOT refresh the top bar: it contains the game's server/galaxy
      // <select>, and replacing it with the fetched page's copy makes that
      // dropdown render as an expanded list. The top-bar refresh is cosmetic
      // only — parsing never needs it.
      var tab2 = msg.find('marquee');
      if (tab2) $('marquee').html(sanitize(tab2.html()));
      // look for map
      var map = $('#myCanvas', msg);
      var lmap = $('#myCanvas');
      if (map.length > 0 && lmap.length > 0) {
        lmap.html(map.html());
      }
    } catch (e) {
      lg.debug(e, 'Error in UpdatePage:', {
        stack: true
      });
    }
  }

  this.SendMessage = function(msg) {
    chrome.runtime.sendMessage(msg);
  }

  this.ConvertNumber = function(n) {
    try {
      var length = n.length;
      var decimal = false;
      var ptr = length;
      for (var i = 1; i <= Math.min(3, length); i++)
        if (!n.charAt(length - i).match(/^[0-9]/)) {
          decimal = true;
          ptr -= i;
          break;
        }
      var number = n.slice(0, ptr).replace(/[^0-9]/g, "");
      if (decimal) number += '.' + n.slice(ptr + 1, length);
      return number;
    } catch (e) {
      lg.debug(e, 'Error in ctF.ConvertNumber', {
        stack: true
      });
    }
  }

  this.ReplaceAll = function(txt, replace, with_this) {
    return txt.replace(new RegExp(replace, 'g'), with_this);
  }

  this.PadZero = function(num) {
    return (num > 9) ? num : '0' + num;
  }

  this.InvertColor = function(hex, bw) {
    //bw = false;
    if (hex.indexOf('#') === 0) {
      hex = hex.slice(1);
    }
    // convert 3-digit hex to 6-digits.
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) {
      throw new Error('Invalid HEX color.');
    }
    var r = parseInt(hex.slice(0, 2), 16),
      g = parseInt(hex.slice(2, 4), 16),
      b = parseInt(hex.slice(4, 6), 16);
    if (bw) {
      // http://stackoverflow.com/a/3943023/112731
      return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ?
        '#000000' :
        '#FFFFFF';
    }
    // invert color components
    r = (255 - r).toString(16);
    g = (255 - g).toString(16);
    b = (255 - b).toString(16);
    // pad each with zeros and return
    return "#" + ctF.PadZero(r) + ctF.PadZero(g) + ctF.PadZero(b);
  }

  this.GetDateFromString = function(dstr, def) {
    try {
      var datestr = dstr.match(/\d{1,2} [A-Z][a-z]{2} \d\d\d\d, \d\d:\d\d:\d\d/);
      if (!datestr) datestr = dstr.match(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
      if (!datestr) datestr = dstr.match(/[A-Z][a-z]{2} \d{1,2} \d\d\d\d, \d\d:\d\d:\d\d/);
      if (!datestr) datestr = dstr.match(/[A-Z][a-z]{2} \d{1,2} \d{4}/);
      if (!datestr) datestr = dstr.match(/\d\d\d\d-\d\d-\d\d, \d\d:\d\d:\d\d/);
      if (!datestr) datestr = dstr.match(/\d\d\d\d-\d\d-\d\d/);
      var obj = new Date(datestr);
      var dsisDate = obj.getFullYear() + '-' + ctF.PadZero(obj.getMonth() + 1) +
        '-' + ctF.PadZero(obj.getDate()) + ' ' + ctF.PadZero(obj.getHours()) + ':' +
        ctF.PadZero(obj.getMinutes()) + ':' + ctF.PadZero(obj.getSeconds());
      result = {
        date: obj,
        dsisDate: dsisDate,
        dateStr: datestr[0]
      };
      return result;
    } catch (e) {
      lg.debug(e, 'error', {
        stack: true,
        details: {
          dstr: dstr
        }
      });
      return null;
    }
  }

  this.CheckWatchFilters = function() {
    ;
  }

  this.GetWatchOptions = function() {
    return null;
  }

}
