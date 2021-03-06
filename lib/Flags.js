var
  _ = require("lodash"),
  five = require("johnny-five"),
  board = new five.Board(),
  Flags = function() {
    this.flags = {};
  };

Flags.prototype.make = function(name, pinNum) {
  //console.log("Flag " + name + " at pin number " + pinNum);
  this.flags[name] = new five.Servo({
    id: name, // User defined id
    pin: pinNum, // Which pin is it attached to?
    type: "standard", // Default: "standard". Use "continuous" for continuous rotation servos
    range: [0, 90], // Default: 0-180
    fps: 50, // Used to calculate rate of movement between positions
    invert: false, // Invert all specified positions
    startAt: 1, // Immediately move to a degree
    specs: { // Is it running at 5V or 3.3V?
      speed: five.Servo.Continuous.speeds["@5.0V"]
    }
  });
  //console.dir(this.flags);
};

Flags.prototype.reset = function() {
  
  this.flags['green'].to(0);
  this.flags['red'].to(0);

  // Had an issue where the serial port would error out in the forEach:
  // _.forEach(this.flags, function(flag) {
  //   flag.to(5);
  // });
};

Flags.prototype.raise = function(color) {
  this.flags[color].to(90);
};

module.exports = new Flags();
