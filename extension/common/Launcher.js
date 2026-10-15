var Launcher = function(_duration, _type, _onUpdateStatus, _onGo) {
  var OnGo = _onGo || function() {};
  var OnUpdateStatus = _onUpdateStatus || function() {};
  var durationStr = _duration;
  var timerType = _type;
  var timer = null;
  var timerEl = null;
  var labelEl = null;

  function setEls() {
    var td = $('td[id="logistics"]')
    labelEl = td.parent().find('td:eq(1)');
    timerEl = td.parent().find('td:eq(2)');
  }
  setEls();

  this.log = function(msg) {
    lg.log('Launcher:' + msg);
  }

  this.Launch = function() {
    launcher.log('Launching');
    $('#move_fleet_form').submit();
  }
  // get secons from when
  // returns seconds
  this.ParseTimeStr = function(str) {
    try {
      if (typeof str == 'undefined') str = durationStr;
      var hours = '00',
        mins = '00',
        secs = '00';
      var m = str.match(/(\d+)h (\d+)m (\d+)s/);
      if (m == null) m = str.match(/(\d+)m (\d+)s/);
      if (m == null) m = str.match(/(\d+)s/);
      if (m == null) return null;
      if (m.length == 4) {
        hours = m[1];
        mins = m[2];
        secs = m[3];
      } else if (m.length == 3) {
        mins = m[1];
        secs = m[2];
      } else if (m.length == 2) {
        secs = m[1];
      }
      var seconds = (parseInt(hours) * 60 * 60) + (parseInt(mins) * 60) + parseInt(secs);
      console.log('Seconds:' + seconds);

      return seconds;
    } catch (e) {
      console.log(e.message);
    }
  }

  this.DisplayFormattedTime = function(secs) {
    try {

      timerEl.text('');
      //Update display
      var distance = new Date(parseInt(secs) * 1000).getTime();
      var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (hours < 10) hours = '0' + hours;
      var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      if (minutes < 10) minutes = '0' + minutes;
      var seconds = Math.floor((distance % (1000 * 60)) / 1000);
      if (seconds < 10) seconds = '0' + seconds;

      var dstr = hours + ':' + minutes + ':' + seconds;
      labelEl.text('Launching in:');
      timerEl.text(dstr);
    } catch (e) {
      lg.debug(e, 'Error in DisplayFormattedTime:', {
        stack: true
      });
    }
  }

  this.SetlaunchFromLanding = function(landStr) {
    var land = moment(landStr, 'YYYY-MM-DD HH:mm:ss');
    var duration = this.ParseTimeStr(durationStr);
    var launch = land.subtract(duration, 'seconds');
    var now = this.GetNowTime();
    var diff = moment.duration(launch.diff(now)).asSeconds();

    this.log('Interval:' + duration + ', launch:' + launch.format());

    timer = new Timer(diff, launcher.DisplayFormattedTime, launcher.Launch).start();

  }

  this.GetNowTime = function() {
    var now = moment();
    if (timerType == 'Server') {
      if (AheadOfServerTime === false) now = now.add(ServerTimeOffset, 'hours');
      else now = now.subtract(ServerTimeOffset, 'hours');
    }
    return now;
  }

  this.SetLaunch = function(launchStr) {
    var launch = moment(launchStr, 'YYYY-MM-DD HH:mm:ss');
    var now = this.GetNowTime();

    var diff = moment.duration(launch.diff(now)).asSeconds();
    this.log('Timer will be for:' + diff);
    timer = new Timer(diff, launcher.DisplayFormattedTime, launcher.Launch).start();

  }
};

/*
 *
    var s = new Launcher('4h 0m 0s');
    var secs = s.ParseTimeStr();
    var l = s.GetlaunchFromLanding('2019-06-04 12:20:00');
 */
