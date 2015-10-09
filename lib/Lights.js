var
  _ = require("lodash"),
  five = require("johnny-five"),
  board = new five.Board(),
  Lights = function() {
    this.lights = {};
  };

Lights.prototype.make = function(name, pinNum) {
  this.lights[name] = new five.Led(pinNum);
};

Lights.prototype.reset = function() {
  _.forEach(this.lights, function(light) {
    light.stop();
    light.off();
  });
};

Lights.prototype.blink = function(name) {
  console.log(name);
  this.lights[name].blink();
};

module.exports = new Lights();
