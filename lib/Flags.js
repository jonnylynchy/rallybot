var
  _ = require("lodash"),
  five = require("johnny-five"),
  board = new five.Board(),
  Flags = function() {
    this.flags = {};
  };

Flags.prototype.make = function(name, pinNum) {
  console.log("Initializing the " + name + " flag on pin " + pinNum);
  this.flags[name] = new five.Servo({
    id: name, // User defined id
    pin: pinNum, // Which pin is it attached to?
    type: "standard", // Default: "standard". Use "continuous" for continuous rotation servos
    range: [0, 90], // Default: 0-180
    fps: 50, // Used to calculate rate of movement between positions
    invert: false, // Invert all specified positions
    startAt: 0, // Immediately move to a degree
    specs: { // Is it running at 5V or 3.3V?
      speed: five.Servo.Continuous.speeds["@5.0V"]
    }
  });
};

Flags.prototype.reset = function() {
  _.forEach(this.flags, function(flag) {
    flag.to(0);
  });
};

Flags.prototype.raise = function(color) {
  this.flags[color].to(90);
};

module.exports = new Flags();
