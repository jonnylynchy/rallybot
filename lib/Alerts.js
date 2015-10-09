var
  _ = require("lodash"),
  five = require("johnny-five"),
  board = new five.Board(),
  Alerts = function(flags, lights) {
    this.flags = null;
    this.lights = null;
  };

Alerts.prototype.do = function(name) {
  console.log("Initializing the " + name );
  this.lights.blink(name);
  this.flags.raise(name);
};

Alerts.prototype.silence = function() {
  console.log('Silencing all Alerts');
  this.lights.reset();
  this.flags.reset();
};

Alerts.prototype.init = function(flags, lights) {
  this.flags = flags;
  this.lights = lights;
};


module.exports = new Alerts();
