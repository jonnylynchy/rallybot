var sys = require('sys'),
	exec = require('child_process').exec,
	nedb = require('nedb'),
	diff = require('deep-diff').diff,
	rally = require('rally'),
	fs = require('fs'),
	_ = require("lodash"),
	five = require("johnny-five"),
  	board,
  	piezo,
	config = {},
	queryUtils = rally.util.query,
	refUtils = rally.util.ref,
	restApi,
	initialProjectQ,
	updateStates = {},
	updateStateText = {},
	storyUpdateStates = {},
	notificationQueue = [],
	tasksDb,
	storiesDb,
	today,
	pollTime = 4000,
	flags = require('./lib/Flags.js'),
	lights = require('./lib/Lights.js'),
	alerts = require('./lib/Alerts.js'),
	songs = require('./lib/Songs.js'),
	hipchatclient = require('./lib/HipChatClient.js'),
	alertComplete = true,
	withBoard = true;

// Initializes the entire app.
function init() {

	process.argv.forEach(function(val, index, array) {
		if(val === 'noboard')
			withBoard = false;
	});

	songs.init();
	initBoard();
	initDbs();
	setUpdateTypes();
	loadConfig();
	connectRally();
	connectHipChat();
	loadIteration();

	var interval = setInterval(function() {
		checkQueue();
	}, pollTime);

}

// Initializes the Arduino Circuit Board
function initBoard(){
	if(withBoard){
		console.log('init board');
		board = new five.Board();
		board.on("ready", function() {
		    // Creates flags and lights and assigns them a pin number in
		    // the Arduino Circuit Board
			flags.make('green', 13);
			flags.make('red', 12);
			lights.make('green', 8);
			lights.make('red', 7);
			piezo = new five.Piezo(3);
		    // populates the master alerts object with the flags and
		    // lights objects for concerted alerts
			alerts.init(flags, lights);

			// Add to REPL (optional)
			this.repl.inject({
				flags: flags,
				lights: lights,
				alerts: alerts
			});

			doStartUpAlert();

		});
	}
}

// Initializes the NEDB Database
function initDbs(){
	tasksDb = new nedb({ filename: 'db/tasks.db', autoload: true });
	storiesDb = new nedb({ filename: 'db/stories.db', autoload: true });
}

// Map the update states from Rally
function setUpdateTypes() {
	updateStates.complete = 'Completed';
	updateStates.accepted = 'Accepted';
	updateStates.inprogress = 'In-Progress';
	updateStates.blocked = 'Blocked';
	updateStates.unblocked = 'Unblocked';

	storyUpdateStates.complete = 'COMPLETED';
	storyUpdateStates.accepted = 'ACCEPTED';
	storyUpdateStates.inprogress = 'IN_PROGRESS';

	updateStateText.inprogress = 'in progress';
	updateStateText.complete = 'completed';
	updateStateText.accepted = 'accepted';

}

// Load the config that contains the project and API keys
function loadConfig() {
	configFile = 'apiConfigs.json';
	config = JSON.parse(
		fs.readFileSync(configFile)
	);
}

// Make connection with Rally API
function connectRally() {
	restApi = rally({
		apiKey: config.rally.apiKey, //preferred, required if no user/pass, defaults to process.env.RALLY_API_KEY
		apiVersion: 'v2.0', //this is the default and may be omitted
		server: 'https://rally1.rallydev.com', //this is the default and may be omitted
		requestOptions: {
			headers: {
				'X-RallyIntegrationName': 'Rally Nodebot v0.01', //while optional, it is good practice to
				'X-RallyIntegrationVendor': 'DealerTrack/Cox Automotive', //provide this header information
				'X-RallyIntegrationVersion': '1.0'
			}
			//any additional request options (proxy options, timeouts, etc.)
		}
	});

	today = getToday();
	initialProjectQ = queryUtils.where('StartDate', '<=', today).and('EndDate', '>=', today);
}

function connectHipChat() {
	hipchatclient.init(config.hipchat.apiKey, config.hipchat.roomId);
}

// Load a team's current iteration (e.g., sprint)
function loadIteration() {
	// Query rally for iteration info
	restApi.query({
		type: 'iteration',
		fetch: ['FormattedID', 'Name', 'ScheduleState', 'PlanEstimate', 'Iteration', 'Children'],
		query: initialProjectQ,
		scope: {
			project: '/project/' + config.rally.projectid,
			up: false,
			down: true
		},
	}, function(error, result) {
		if(error) {
			console.log(error);
		} else {
			data = result.Results[0];
			if(data && data._ref) {
				var iterationRef = refUtils.getRelative(data._ref);
				var refObjectName = data._refObjectName;
				// Get Tasks
				getTasks(iterationRef, refObjectName);
				
				var interval = setInterval(function(iterationRef, refObjectName) {
						getTasks(iterationRef, refObjectName);
					}, pollTime, iterationRef, refObjectName);

				// Get Stories
				getStories(iterationRef, refObjectName);
				var storyInterval = setInterval(function(iterationRef, refObjectName) {
						getStories(iterationRef, refObjectName);
					}, pollTime, iterationRef, refObjectName);
			}
		}
	});
}

// Request current tasks within specified iteration
function getTasks(iterationRef, iterationName) {
	console.log(notificationQueue);
	restApi.query({
		type: 'task',
		query: queryUtils.where('State', '=', 'Defined')
				.or('State', '=', 'In-Progress')
				.or('State', '=', 'Completed')
				.and('Iteration.Name', '=', iterationName),
		fetch: ['FormattedID', 'Name', 'State', 'Blocked', 'BlockedReason'],
		scope: {
			project: '/project/' + config.rally.projectid,
			up: false,
			down: true
		},
	}, function(error, result) {
		if(error) {
			console.log(error);
		} else {
			var i = 0;
			while(i < result.Results.length){
				insertDoc(result.Results[i], tasksDb);
				i++;
			}
		};
	});
}

// Request current stories within specified iteration
function getStories(iterationRef, iterationName) {
	console.log(notificationQueue);
	restApi.query({
		type: 'HierarchicalRequirement',
		query: queryUtils.where('TaskStatus', '=', 'DEFINED')
				.or('TaskStatus', '=', 'IN_PROGRESS')
				.or('TaskStatus', '=', 'COMPLETED')
				.or('TaskStatus', '=', 'NONE')
				.and('Iteration.Name', '=', iterationName),
		fetch: ['Name', 'Blocked', 'BlockedReason', 'TaskStatus'],
		scope: {
			project: '/project/' + config.rally.projectid,
			up: false,
			down: true
		},
	}, function(error, result) {
		if(error) {
			console.log(error);
		} else {
			var i = 0;
			while(i < result.Results.length){
				insertDoc(result.Results[i], storiesDb);
				i++;
			}
		};
	});
}

// Insert list of tasks into the Database:
//    - if there are no docs insert the request data
//    - if there are docs then compare them.
function insertDoc(doc, db){
	db.find({ _refObjectUUID: doc._refObjectUUID }, function(err, docs){
		if(!docs.length){
			// Insert New
			db.insert(doc, function (err) {});
		} else {
			// Update Existing
			compareDoc(doc, db);
		}
	});
}

// Update the document in the DB
function updateDoc(doc, db){
	db.update({ _refObjectUUID: doc._refObjectUUID }, doc, {}, function(err, count){
		//console.log('Update: ', count);
	});
}

// Evaluate doc for changes
function compareDoc(doc, db){
	var differences,
		newDoc = doc,
		originalDoc;


	db.find({ _refObjectUUID: doc._refObjectUUID }, function(err, docs) {
		if(docs.length) {
			originalDoc = docs[0]
			differences = diff(originalDoc, newDoc);

			if(differences.length) {
				console.log(differences);
				var i = 0;
				var bypass = true;
				while(i < differences.length){
					// DB has id, rally api collection doesn't
					// if difference is not id and not _objectVersion, check on other properties, etc.
					if(differences[i].path.indexOf('_id') === -1 && differences[i].path.indexOf('_objectVersion') === -1) {
						checkDocState(doc, db, differences[i].path[0]);
					}
					i++;
				}
			}
		}
	});
}

// Evaluate whether to insert item into the queue
function checkDocState(doc, db, changeType){
	var docType = 'Task';
	updateDoc(doc, db);

	if(doc._type === 'HierarchicalRequirement')
		docType = 'Story';

	//On diff if diffed item matches one of updateStates, check state and add to queue
	if(changeType === updateStates.blocked && doc.Blocked === true){
		notificationQueue.push({name: doc.Name, state: updateStates.blocked, flag: 'red'});
	} else if(changeType === updateStates.blocked && doc.Blocked === false){
		notificationQueue.push({name: doc.Name, state: updateStates.unblocked, flag: 'green'});
	} else {
		if(doc._type === 'HierarchicalRequirement'){
			switch (doc.TaskStatus) {
				case storyUpdateStates.complete:
					notificationQueue.push({type: docType, name: doc.Name, state: updateStateText.complete, flag: 'green'});
					break;
				case storyUpdateStates.accepted:
					notificationQueue.push({type: docType, name: doc.Name, state: updateStateText.accepted, flag: 'green'});
					break;
				case storyUpdateStates.inprogress:
					notificationQueue.push({type: docType, name: doc.Name, state: updateStateText.inprogress, flag: 'green'});
					break;
				default:
					// this isn't an update we care about...
					break;
			}
		} else {
			switch (doc.State) {
				case updateStates.complete:
					notificationQueue.push({type: docType, name: doc.Name, state: doc.State, flag: 'green'});
					break;
				case updateStates.accepted:
					notificationQueue.push({type: docType, name: doc.Name, state: doc.State, flag: 'green'});
					break;
				case updateStates.inprogress:
					notificationQueue.push({type: docType, name: doc.Name, state: doc.State, flag: 'green'});
					break;
				default:
					// this isn't an update we care about...
					break;
			}
		}
		
	}
}

// ============ TEMP......
// TODO: Refactor this crap... pubsub?
function checkQueue(){
	if(notificationQueue.length && alertComplete){
		alertComplete = false;
		doAlert(notificationQueue.shift());
	}
}

// activate concerted alert based on color : 'red'|'green'
function doAlert(notification){
	var phrase = notification.type + ' ' + notification.name.replace('|', '') + ' was set to ' + notification.state;
	
	// Say Phrase
	sayIt(phrase);
	
	// Notify team in hipchat
	hipchatclient.postMessage(phrase, notification.flag);
	
	// Make physical bot do stuff
	if(withBoard)
		alerts.do(notification.flag);
}

function sayIt(phrase){
	if(process.platform.indexOf('linux') > -1) {
		exec("espeak " + phrase, resetAlert);
	} else {
		exec("say " + phrase, resetAlert);
	}
}

function resetAlert(){
	if(withBoard)
		alerts.silence();
	alertComplete = true;
}

// ============ /TEMP......

function doStartUpAlert() {
	var startupSong = songs.getRandomSong('startupSongs');

	if(withBoard) {
		alertComplete = false;
		flags.raise('red');
		flags.raise('green');
		lights.blink('red');
		lights.blink('green');
		playSong(startupSong);
	}
}

function playSong(song){
	piezo.play({
    	song: song,
    	tempo: 100
  	});
	setTimeout(function() {
	    sayStartupPhrase();
	}, 7000);
}

function sayStartupPhrase(){
	var phrase = 'Hello. I am rally bot and I am here to rock you.';
	sayIt(phrase);
}

// Utils
function puts(error, stdout, stderr) {
	console.log(stdout);
	alerts.reset();
}

// Generate Todays Date
function getToday(){
	var today = new Date();
	var dd = today.getDate();
	var mm = today.getMonth()+1; //January is 0!
	var yyyy = today.getFullYear();

	if(dd<10) {
	    dd='0'+dd
	}

	if(mm<10) {
	    mm='0'+mm
	}

	today = yyyy + '-' + mm + '-' + dd;
	return today;
}

init();
