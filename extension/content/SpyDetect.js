// handle spy detection

var SpyDetect = function () {
  var turnOffHooks = [];

  this.AddHook = function(func) {
    turnOffHooks.push(func);
  }

  this.TurnOff = function () {
    $.each(turnOffHooks, function (index, hook) {
      econs.CallBack(hook, 'Shut it down');
    });
  }
}