// use this to make sure there is only one of a given type
var TheTimer = null;
var TheInterval = null;

var Timer = function(secs, onUpdateStatus, onCounterEnd) {
  var timer;
  var instance = this;
  TheTimer = instance;
  var seconds = secs || 300;
  var updateStatus = onUpdateStatus || function() {};
  var counterEnd = onCounterEnd || function() {};

  function decrementCounter() {
    try {
      updateStatus(seconds);
      if (seconds <= 0) {
        counterEnd();
        instance.stop();
      }
      seconds--;
    } catch (e) {
      lg.debug(e, 'Error in Timer.decrementCounter:', {
        stack: true
      });
    }
  }

  this.start = function() {
    try {
      clearInterval(timer);
      timer = 0;
      timer = setInterval(decrementCounter, 1000);
      TheInterval = timer;
    } catch (e) {
      lg.debug(e, 'Error in Timer.start:', {
        stack: true
      });
    }
  };

  this.stop = function() {
    clearInterval(timer);
    TheTimer = timer = null;
    updateStatus = counterEnd = null;
  };
}
