const Lights = require('./Lights');
const config = require('./tally.config.json');
const { Atem } = require('atem-connection');
const OBSWebSocket = require('obs-websocket-js');

const obs = new OBSWebSocket();
const switcher = new Atem();
// Each tally is an object with its own configuration properties and a set of R/G/B LEDs.
const tallies = [];
obs_data=[];
atem_state=[];

if(!config.tallies || !config.switcherIP || !config.obsIP) {
	console.error('No tally lights or switcher IP configured!');
	process.exit();
}

for(let i = 0; i < config.tallies.length; i++) {
	tallies[i] = {};
	/**
	 * @type {{inputID, ledGpioPins: {red,green,blue},
	 * invertSignals, disconnectedFlashColor: {red,blue,green}, disconnectedFlashFrequency}}
	 */
	tallies[i].config = config.tallies[i];

	tallies[i].lights = new Lights(tallies[i].config.ledGpioPins.red, tallies[i].config.ledGpioPins.green,
		tallies[i].config.ledGpioPins.blue, tallies[i].config.invertSignals);

	tallies[i].lights.write(true, false, false);
	// Flash to indicate the tally is currently disconnected
	tallies[i].lights.startFlashing(tallies[i].config.disconnectedFlashColor.red, tallies[i].config.disconnectedFlashColor.green,
		tallies[i].config.disconnectedFlashColor.blue, tallies[i].config.disconnectedFlashFrequency);
}
console.log("Connecting...");
switcher.connect(config.switcherIP);
switcher.on('connected', () => {
	console.log("Connected to ATEM at:"+config.switcherIP);
	for(let i = 0; i < tallies.length; i++) {
		tallies[i].lights.stopFlashing();
	}
});

//connect to OBS
obs.connect({
	address: config.obsIP,
	password: config.obsPW
})
.then(() => {
	console.log(`Connected to OBS at:`+config.obsIP);
	//get current scene and save to global variable
	return obs.send('GetCurrentScene');
})
.then(data => {
	console.log(`${data.name} is the Current Scene`);
	obs_data.sceneName=data.name;
})
.catch(err => { // Promise convention dicates you have a catch on every chain.
	console.log(err);
	process.exit();
});

switcher.on('disconnected', () => {
	console.log("Lost connection!");
	// Flash to indicate the tally is currently disconnected
	for(let i = 0; i < tallies.length; i++) {
		tallies[i].lights.startFlashing(tallies[i].config.disconnectedFlashColor.red,
			tallies[i].config.disconnectedFlashColor.green, tallies[i].config.disconnectedFlashColor.blue,
			tallies[i].config.disconnectedFlashFrequency);
	}
});

//On obs scene switch, update global variable and call update function
obs.on('SwitchScenes', data => {
	console.log(`New Active Scene: ${data.sceneName}`);
	obs_data=data;
	if(!atem_state)
		return;
	update(obs_data, atem_state);
});

// You must add this handler to avoid uncaught exceptions.
obs.on('error', err => {
    console.error('socket error:', err);
});

switcher.on('stateChanged', (state) => {
	// State does not always contain ME video data; Return if necessary data is missing.
	if(!state || !state.video || !state.video.ME || !state.video.ME[0])
		return;
	atem_state=state;
	if(!obs_data)
		return;
	update(obs_data, atem_state);
});
function update(data, state) {
	if(!data || !state || !data.sceneName || !state.video || !state.video.ME || !state.video.ME[0])
		return;
	const preview = state.video.ME[0].previewInput;
	const program = state.video.ME[0].programInput;

	for(let i = 0; i < tallies.length; i++) {
		if(obs_data.sceneName==="ATEM"){
			console.log("ATEM");
			// If faded to black, lights are always off
			if(state.video.ME[0].fadeToBlack && state.video.ME[0].fadeToBlack.isFullyBlack) {
				tallies[i].lights.off();
				console.log("ftb");
				// This camera is either in program OR preview, and there is an ongoing transition.
			} else if(state.video.ME[0].inTransition && (preview === tallies[i].config.inputID)) {
				tallies[i].lights.yellow();
				console.log(i+" yellow");
			} else if(state.video.ME[0].inTransition && (programm === tallies[i].config.inputID)){
				tallies[i].lights.green();
				console.log(i+" green"); 
			} else if(program === tallies[i].config.inputID) {
				tallies[i].lights.red();
				console.log(i+" red");
			} else if(preview === tallies[i].config.inputID) {
				tallies[i].lights.off();
				console.log(i+" green");
			} else { // Camera is not in preview or program
				tallies[i].lights.off();
				console.log(i+" off");
			}
		}else if (obs_data.sceneName==="Intro"){
			console.log("INTRO");
			tallies[i].lights.blue();
		}else if (obs_data.sceneName==="Outro"){
			console.log("OUTRO");
			tallies[i].lights.blue();
		}else{
			console.log("ELSE");
			tallies[i].lights.off();
		}
	}
}
