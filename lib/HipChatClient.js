var hipchat = require('node-hipchat'),
	HipChatClient = function() {
		this.apiKey = '';
		this.roomId = '';
		this.client = '';
		this.name = 'RallyBot';
	};

HipChatClient.prototype.init = function(apiKey, roomId){

	this.apiKey = apiKey;
	this.roomId = roomId;
	this.client = new hipchat(this.apiKey);

}

HipChatClient.prototype.postMessage = function(message, color){
	var params = {
		room: this.roomId,
		from: this.name,
		message: message,
		color: color
	};

	this.client.postMessage(params, function(data) {
		// message sent!
		// console.log(data);
	});
};

HipChatClient.prototype.listRooms = function() {
	this.client.listRooms(function(data) {
		console.log(data); // These are all the rooms
	});
}

// Export
module.exports = new HipChatClient();
