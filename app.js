var _ = require("lodash");
var fs = require('fs');

var five = require("johnny-five");
var board = new five.Board();

var flags = require('./lib/Flags.js');
var lights = require('./lib/Lights.js');
var alerts = require('./lib/Alerts.js');

board.on("ready", function() {

  flags.make('green', 13);
  flags.make('red', 12);
  lights.make('green', 8);
  lights.make('red', 7);

  alerts.init(flags, lights);

  // Add to REPL (optional)
  this.repl.inject({
    flags: flags,
    lights: lights,
    alerts: alerts
  });

});
