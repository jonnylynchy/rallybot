var negativeSongs = [],
	positiveSongs = [],
	startupSongs = [],
	Songs = function() {
		this.songs = {};
	};

Songs.prototype.init = function(){

	this.songs['negativeSongs'] = [];
	this.songs['positiveSongs'] = [];
	this.songs['startupSongs'] = startupSongs;

	this.addSongs();
}

Songs.prototype.getRandomSong = function(songList) {
	songArray = this.songs[songList];
	var randomInt = getRandomInt(0, songArray.length);
	return songArray[randomInt];
}

Songs.prototype.addSongs = function(){
	// Add songs
	
	// song is composed by an array of pairs of notes and beats
    // The first argument is the note (null means "no note")
    // The second argument is the length of time (beat) of the note (or non-note)
	startupSongs.push(
		[
			["C4", 1],
			["F4", 1 / 4],
			[null, 1 / 4],
			["F4", 1 / 4],
			[null, 1 / 4],
			["C4", 1 / 4],
			[null, 1 / 4],
			["C4", 1 / 4],
			[null, 1 / 4],
			["F4", 1 / 4],
			[null, 1 / 4],
			["F4", 1 / 4],
			["C4", 1],
			["C#4", 2 / 4],
			["D4", 1 / 4],
			[null, 1 / 4],
			["D4", 1 / 4],
			[null, 1 / 4],
			["A3", 1 / 4],
			[null, 1 / 4],
			["A3", 1 / 4],
			[null, 1 / 4],
			["D4", 1 / 4],
			[null, 1 / 4],
			["D4", 1 / 4],
			["A3", 1 / 2],
			[null, 1 / 4],
			["C4", 2 / 4],
			["F4", 1 / 4]
		]
	);
}

// Util for random number
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Export
module.exports = new Songs();