
var Fleet = function() {
  this.FleetId = '';
  this.Fleetname = '';
  this.Location = '';
  this.LocationName = '';
  this.Destination = '';
  this.PlayerId = '';
  this.Size = '';
  this.Arrival = '';
  this.Url = '';
  this.Details = [];
  this.Index = -1;
}

var Ship = function(sindex, amt, unit) {
  this.Unit = unit;
  this.Amount = amt;
  this.ShipType = Ships[sindex];
}

var Ships = function() {
  this.MaxShips = 20

  this.GetShipIndex = function(shiptype) {
    for (var i = 0; i < this.MaxShips; i++) {
      if (shiptype == this.ShipTypes[i].name) return i;
    }
    return -1;
  }

  this.ShipTypes = {
    0: {
      type: 'ft',
      name: 'Fighters',
      hangers: -1,
      warp: false
    },
    1: {
      type: 'bo',
      name: 'Bombers',
      hangers: -1,
      warp: false
    },
    2: {
      type: 'hb',
      name: 'Heavy Bombers',
      hangers: -2,
      warp: false
    },
    3: {
      type: 'ib',
      name: 'Ion Bombers',
      hangers: -2,
      warp: false
    },
    4: {
      type: 'cv',
      name: 'Corvette',
      hangers: 0,
      warp: true
    },
    5: {
      type: 'rc',
      name: 'Recycler',
      hangers: 0,
      warp: true
    },
    6: {
      type: 'de',
      name: 'Destroyer',
      hangers: 0,
      warp: true
    },
    7: {
      type: 'fr',
      name: 'Frigate',
      hangers: 4,
      warp: false

    },
    8: {
      type: 'if',
      name: 'Ion Frigate',
      hangers: 4,
      warp: false
    },
    9: {
      type: 'ss',
      name: 'Scout Ship',
      hangers: 0,
      warp: true
    },
    10: {
      type: 'os',
      name: 'Outpost Ship',
      hangers: 0,
      warp: true
    },
    11: {
      type: 'cr',
      name: 'Cruiser',
      hangers: 4,
      warp: true
    },
    12: {
      type: 'ca',
      name: 'Carrier',
      hangers: 60,
      warp: true
    },
    13: {
      type: 'hc',
      name: 'Heavy Cruiser',
      hangers: 8,
      warp: true
    },
    14: {
      type: 'bs',
      name: 'Battleship',
      hangers: 40,
      warp: true
    },
    15: {
      type: 'fc',
      name: 'Fleet Carrier',
      hangers: 400,
      warp: true
    },
    16: {
      type: 'dn',
      name: 'Dreadnought',
      hangers: 200,
      warp: true
    },
    17: {
      type: 'ti',
      name: 'Titan',
      hangers: 1000,
      warp: true
    },
    18: {
      type: 'le',
      name: 'Leviathan',
      hangers: 4000,
      warp: true
    },
    19: {
      type: 'ds',
      name: 'Death Star',
      hangers: 10000,
      warp: true
    }
  };
}
