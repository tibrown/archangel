// Mail or PM Functions

var Mail = function() {

  this.log = function(msg) {
    lg.log('Mail:' + msg);
  }

  this.SendPmsToList = function(members, msg, callback) {
    $.each(members, function(index, member) {
      mail.SendPM(member.playerId, msg, function(status) {
        mail.log('Status:' + status);
      });
    });
    econs.CallBack(callback, 'OK');
  }

  this.SendPM = function(playerId, msg, callback) {
    try {
      var url = 'messages.aspx?msg=' + playerId;
      ctF.DoGetAE(url, function(data) {
        var page = $(data);
        // check for invalid player
        var invalid = page.find('center:contains(Invalid)');
        if (invalid.length > 0) {
          mail.log('Invalid playerid:' + playerId);
          econs.CallBack(callback, 'Invalid playerid:' + playerId);
          return;
        }
        var txt = page.find('#body');
        txt.val(msg);
        var postUrl = page.find('form[method=post]').attr('action');
        postData = {};
        postData['body'] = msg;
        postData = 'submit=Send&body=' + msg;

        var counter = page.find('#counter');
        var count = counter.attr('title');
        count = parseInt(count) - msg.length;
        counter.attr('title', count);
        ctF.DoGetAE(postUrl, function(pdata) {
          var p = $(pdata);
          var sent = p.filter('#messages_inbox');
          if(sent.length == 1) {
            econs.CallBack(callback, 'OK');
            ctF.DisplayStatus('PM Sent');
            return;
          }
          econs.CallBack(callback, 'FAIL');
          ctF.DisplayStatus('PM Failed to Send');
          return;
        },undefined, postData);
      });
    } catch (e) {
      lg.debug(e, 'Error in SendPM:', {
        stack: true
      });
    }
  }
}
