/*
 * This class will dole out connections from a pool and do the following:
 * 1. Make sure a desired interval between handing them out is adhered to.
 *    ex: no more than 1 connection every 4 seconds.
 * 2. Set an expiration timer so the connection returns to the pool after a set time.
 */

var Connection = function(id) {
  var _id = id;
  return {
    id: _id
  }
}

var ConnectionPool = function(size, delay = 4000) {
  var pool = [];
  var enoughTimeHasElapsed = true;
  var connectionInterval = delay;

  for (var i = 0; i < size; i++) {
    var c = new Connection(i);
    pool.push(c);
  }

  function ConnectionOut() {
    enoughTimeHasElapsed = false;
    window.setTimeout(function() {
      enoughTimeHasElapsed = true;
    }, connectionInterval);
  }
  // work out expiration
  return {
    SetInterval: function (connectionDelay) {
      connectionInterval = connectionDelay;
    },

    GetConnection: function() {
      try {
        if (pool.length > 0 && enoughTimeHasElapsed === true) {
          var c = pool.shift();
          ConnectionOut();
          // set expiration timer
          //logger.log('Connection given out');
          return c;
        } else {
          //logger.log('No connections available');
          return null;
        }
      } catch (e) {
        lg.debug(e, 'Error in GetConnection:', {
          stack: true
        });
      }
    },

    Release: function(c) {
      try {
        // check for a valid connection
        if (typeof c == 'object') {
          pool.push(c);
          lg.log('Connection released');
        }
      } catch (e) {
        lg.debug(e, 'Error in Release:', {
          stack: true
        });
      }
    }
  }
}
