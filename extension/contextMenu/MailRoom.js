
var mail = new Mail();
var econs = new eConstants();

var lg = new Logger(chrome.runtime.getManifest().version);

function GetCurrentTab(onGot, onError) {
  var gettingCurrent = chrome.tabs.getCurrent();
  gettingCurrent.then(onGot, onError);
}


var MailRoom = function() {

  this.CurrentTab = null;
  this.GmServer = null;

  // functions BG can run
  this.log = function(msg) {
    lg.log('SS:' + msg);
  }

  this.MessageFromBg = function(msg) {
    if (msg.action == 'GuildMembers') {
      this.GmServer = msg.actionArgs.GmServer;
      // display the fleets
      this.log('Got Guild Members data:');
      this.RenderGuild(msg.actionArgs.Members);
      $('#loading').hide();
      return;
    }
    if (msg.action == 'MailSent') {
      if (msg.actionArgs.Status == 'OK') {
        mr.ResetForms();
      } else {
        // show error
      }
      return;
    }
  }

  this.ResetForms = function () {
    $('.nodisplay').hide();
    $('.FormReset').val('');
    $('input[type="checkbox"]').prop('checked', false);
  }

  this.RenderGuild = function(members) {
    try {
      //members = [
      //  { nick: 'Mr. Sand', playerId: 22972 },
      //  { nick: 'Mr. Aka', playerId: 22973 }
      //];

      $('.MembersTable').each(function() {
        $(this).find('tr:gt(0)').remove();
      });

      var even = $('#MembersEven');
      var odd = $('#MembersOdd');

      $('#divGuildMembers').show();

      //var baseUrl = 'http://' + this.GmServer.serverName + '.astroempires.com/';
      var baseUrl = 'http://'  + mr.GmServer.serverName + '.astroempires.com/';
      var h = '', cnt = 0;
      $.each(members, function(index, player) {
        h +=
          '<tr><td><input type="checkbox" class="member"/></td><td>'
          + '<a target="_blank"  href="' + baseUrl + 'profile.aspx?player=' + player.playerId + '">'
          + player.nick + '</a></td>'
          + '<td>'
          + '</tr>';
        if (econs.IsEven(cnt++)) {
          odd.append(h);
          //mr.log('odd ' + player.playerId);
        } else {
          even.append(h);
          //mr.log('even ' + player.playerId);
        }
        h = '';
      });


    } catch (e) {
      lg.debug(e, 'Error in ss.RenderGuild:', {
        stack: true
      });
    }
  }

}
var mr = new MailRoom();

$(document).ready(function() {
  try {
    // MV3: background broadcasts to this popup via chrome.runtime.sendMessage.
    chrome.runtime.onMessage.addListener(function(messageJson) {
      if (messageJson && messageJson.target == 'MailRoom') {
        mr.MessageFromBg(messageJson);
      }
    });

    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UIBridge',
      actionArgs: { op: 'GetMenuOpener' }
    }).then(function(resp) {
      mr.CurrentTab = (resp && resp.MenuOpener) ? resp.MenuOpener : null;
      mr.log('background online');

      chrome.runtime.sendMessage(new Message('sidebar', 'DisplayMessage', {
        displayText: 'Mail Room Active',
        from: 'MailRoom'
      }));
    });

    $('#btnWriteOne').click(function(e) {
      $('#divSendOne').show();
    });

    $('#btnSendOne').click(function (e) {
      var body = $('#txtOneMessage').val();
      var playerId = $('#OnePlayerId').val();
      chrome.tabs.sendMessage(mr.CurrentTab.id, new Message('content', 'SendPM', {
        from: 'MailRoom',
        action: 'MailSent',
        playerId: playerId,
        body: body
      }));
    });

    $('#inpSelAll').click(function(e) {
      var s = $('#inpSelAll:checked');
      if(s.length == 0) $('.member').prop('checked', false);
      else $('.member').prop('checked', true);
    });

    $('#btnSendToGuild').click(function (e) {
      // get guild list...
      var members = [];
      var body = $('#txtGuildMessage').val();
      $('.member:checked').each(function () {
        var a = $(this).parent().parent().find('a');
        var p = a.attr('href').match(/player=(\d+)/)[1];
        var m = {
          playerId: p,
          nick: a.text()
        };
        members.push(m);
      });
      chrome.tabs.sendMessage(mr.CurrentTab.id, new Message('content', 'SendToGuild', {
        from: 'MailRoom',
        action: 'MailSentToGuild',
        members: members,
        body: body
      }));
    });

    $('#btnSendGuild').click(function (e) {
      chrome.tabs.sendMessage(mr.CurrentTab.id, new Message('content', 'SendGuild', {
        from: 'MailRoom',
        action: 'GuildMembers'
      }));
    });
  } catch (e) {
    lg.debug(e, 'Error in MailRoom.Ready:', {
      stack: true
    });
  }
});
