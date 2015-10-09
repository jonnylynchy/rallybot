var sys = require('sys'),
	exec = require('child_process').exec,
	nedb = require('nedb'),
	diff = require('deep-diff').diff,
	rally = require('rally'),
	fs = require('fs'),
	_ = require("lodash"),
	five = require("johnny-five"),
  board = new five.Board(),
	config = {},
	queryUtils = rally.util.query,
	refUtils = rally.util.ref,
	restApi,
	initialProjectQ,
	updateStates = {},
	notificationQueue = [],
	tasksDb,
	today,
	pollTime = 4000,
	flags = require('./lib/Flags.js'),
	lights = require('./lib/Lights.js'),
	alerts = require('./lib/Alerts.js');

function init() {
	initBoard();
	initDbs();
	setUpdateTypes();
	loadConfig();
	connectRally();
	loadIteration();

	var interval = setInterval(function() {
		checkQueue();
	}, pollTime);

}

function initBoard(){
	board.on("ready", function() {
		flags.make('green', 13);
		flags.make('red', 12);
		lights.make('green', 8);
		lights.make('red', 7);

		console.dir(flags);
		console.dir(lights);
		alerts.init(flags, lights);

		// Add to REPL (optional)
		this.repl.inject({
			flags: flags,
			lights: lights,
			alerts: alerts
		});

	});
}

function initDbs(){
	tasksDb = new nedb({ filename: 'db/tasks.db', autoload: true });
}

function setUpdateTypes() {
	updateStates.complete = 'Completed';
	updateStates.accepted = 'Accepted';
	updateStates.inprogress = 'In-Progress';
	updateStates.blocked = 'Blocked';
	updateStates.unblocked = 'Unblocked';
}

function loadConfig() {
	configFile = 'rallyConfig.json';
	config = JSON.parse(
		fs.readFileSync(configFile)
	);
	//console.log(config);
}

function connectRally() {
	restApi = rally({
		apiKey: config.apiKey, //preferred, required if no user/pass, defaults to process.env.RALLY_API_KEY
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

	// TODO: update this to be current iteration dates start/end...
	today = getToday();
	// today = '2015-09-23';
	initialProjectQ = queryUtils.where('StartDate', '<=', today).and('EndDate', '>=', today);
}

function loadIteration() {
	// Query rally for iteration info
	restApi.query({
		type: 'iteration',
		fetch: ['FormattedID', 'Name', 'ScheduleState', 'PlanEstimate', 'Iteration', 'Children'],
		query: initialProjectQ,
		scope: {
			project: '/project/' + config.projectid,
			up: false,
			down: true
		},
	}, function(error, result) {
		if(error) {
			console.log(error);
		} else {
			//console.log(result.Results);
			data = result.Results[0];
			if(data && data._ref) {
				var iterationRef = refUtils.getRelative(data._ref);

				// Get Tasks
				getTasks(iterationRef, data._refObjectName);
				refObjectName = data._refObjectName;
				var interval = setInterval(function(iterationRef, refObjectName) {
					//console.log(iterationRef, refObjectName);
					getTasks(iterationRef, refObjectName);
				}, pollTime, iterationRef, data._refObjectName);

				// Get Stories

			}
		}
	});
}

function getTasks(iterationRef, iterationName) {
	console.log(notificationQueue);
	restApi.query({
		type: 'task',
		query: queryUtils.where('State', '=', 'Defined')
				.or('State', '=', 'In-Progress')
				.or('State', '=', 'Completed')
				.and('Iteration.Name', '=', iterationName),
		fetch: ['FormattedID', 'Name', 'State', 'Blocked'],
		scope: {
			project: '/project/' + config.projectid,
			up: false,
			down: true
		},
	}, function(error, result) {
		if(error) {
			console.log(error);
		} else {
			//console.log(result.Results);
			var i = 0;
			while(i < result.Results.length){
				insertDoc(result.Results[i], tasksDb)
				i++;
			}
		};
	});
}

// DB
function insertDoc(doc, db){
	db.find({ Name: doc.Name }, function(err, docs){
		if(!docs.length){
			// Insert New
			db.insert(doc, function (err) {});
			//console.log('Insert: ', doc);
		} else {
			// Update Existing
			compareDoc(doc, db);
			//console.log('Comparing doc: ');
		}
	});
}

function updateDoc(doc, db){
	db.update({ Name: doc.Name }, doc, {}, function(err, count){
		//console.log('Update: ', count);
	});
}

function compareDoc(doc, db){
	var differences,
		newDoc = doc,
		originalDoc;

	// console.log(doc);
	db.find({ Name: doc.Name }, function(err, docs) {
		if(docs.length) {
			originalDoc = docs[0]
			differences = diff(originalDoc, newDoc);

			if(differences.length) {
				//console.log(differences);
				var i = 0;
				var bypass = true;
				while(i < differences.length){
					// DB has id, rally api collection doesn't
					// if difference is not id and not _objectVersion, check on other properties, etc.
					if(differences[i].path.indexOf('_id') === -1 && differences[i].path.indexOf('_objectVersion') === -1) {
						bypass == false;

						// console.log('other difference:');
						console.log(differences[i].path[0]);
						// console.log(differences[i]);
						checkDocState(doc, db, differences[i].path[0]);
					}
					// var path = differences[i].path;
					// var newValue = differences[i].rhs;
					// console.log(path + ' has a new value: ' + newValue);
					i++;
				}

				// for testing...
				// if(bypass)
				// 	console.log('no change');
			}
		}
	});
}

function checkDocState(doc, db, changeType){
	updateDoc(doc, db);

	//On diff if diffed item matches one of updateStates, check state and add to queue
	if(changeType === updateStates.blocked && doc.Blocked == true){
		notificationQueue.push({name: doc.Name, state: updateStates.blocked, flag: 'red'});
	} else if(changeType === updateStates.blocked && doc.Blocked == false){
		notificationQueue.push({name: doc.Name, state: updateStates.unblocked, flag: 'green'});
	} else {
		switch (doc.State) {
			case updateStates.complete:
				notificationQueue.push({name: doc.Name, state: doc.State, flag: 'green'});
				break;
			case updateStates.accepted:
				notificationQueue.push({name: doc.Name, state: doc.State, flag: 'green'});
				break;
			case updateStates.inprogress:
				notificationQueue.push({name: doc.Name, state: doc.State, flag: 'green'});
				break;
			default:
				// this isn't an update we care about...
				break;
		}
	}
}



// ============ TEMP......
function checkQueue(){
	if(notificationQueue.length){
		doAlert(notificationQueue.shift());

	}
}

function doAlert(notification){
	var phrase = notification.name + ' was set to ' + notification.state;
	sayIt(phrase);

	alerts.do(notification.flag);
}

function sayIt(phrase){
	exec("say -v ralph -r 200 " + phrase, puts);
}

function puts(error, stdout, stderr) { console.log(stdout) }

// ============ /TEMP......



// Utils
function puts(error, stdout, stderr) { console.log(stdout) }

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
