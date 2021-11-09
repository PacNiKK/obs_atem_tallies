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
inTransition=false;
obs_data.sceneName='ATEM';

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

	//tallies[i].lights.write(true, false, false);
	// Flash to indicate the tally is currently disconnected
	tallies[i].lights.startFlashing(tallies[i].config.disconnectedFlashColor.red, tallies[i].config.disconnectedFlashColor.green,
		tallies[i].config.disconnectedFlashColor.blue, tallies[i].config.disconnectedFlashFrequency);
}
console.log("Connecting...");
switcher.connect(config.switcherIP);
switcher.on('connected', () => {
	console.log("ATEM connected:"+config.switcherIP);
	for(let i = 0; i < tallies.length; i++) {
		tallies[i].lights.stopFlashing();
	}
	update(obs_data, atem_state);
});

//connect to OBS
function obs_connect(){
	obs.connect({
		address: config.obsIP,
		password: config.obsPW
	})
	.then(data => {
		console.log('OBS connected:'+config.obsIP);
		obs.send('GetCurrentScene')
		.then(data => {
                	console.log(`${data.name} is the current scene`);
                	obs_data.sceneName=data.name;
                	update(obs_data, atem_state);
		})
        })
	.catch(err => { // Promise convention dicates you have a catch on every chain.
		console.log(err);
		console.log("Retrying..");
	})
};
obs.on('ConnectionClosed', () => {
	console.log("Connection to OBS lost!");
	obs_data.sceneName='ATEM';
	update(obs_data, atem_state);
	console.log("Reconnecting..");
	setTimeout(obs_connect, 5000);
});
switcher.on('disconnected', () => {
	console.log("Connection to ATEM lost!");
	console.log("Reconnecting..");
	// Flash to indicate the tally is currently disconnected
	for(let i = 0; i < tallies.length; i++) {
		tallies[i].lights.startFlashing(tallies[i].config.disconnectedFlashColor.red,
			tallies[i].config.disconnectedFlashColor.green, tallies[i].config.disconnectedFlashColor.blue,
			tallies[i].config.disconnectedFlashFrequency);
	}
});
obs_connect();
update();
//On obs scene switch, update global variable and call update function
obs.on('SwitchScenes', data => {
	//console.log(`New Active Scene: ${data.sceneName}`);
	obs_data=data;
	if(!atem_state)
		return;
	update(obs_data, atem_state);
});

// You must add this handler to avoid uncaught exceptions.
obs.on('error', err => {
    console.error('socket error:', err);
    console.log("Gugus");
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
		if(obs_data.sceneName==="ATEM" && program!=preview){
			//console.log(program+" "+preview+" "+state.video.ME[0].inTransition);
			//console.log("ATEM");
			// If faded to black, lights are always off
			if(state.video.ME[0].fadeToBlack && state.video.ME[0].fadeToBlack.isFullyBlack) {
				tallies[i].lights.off();
				//console.log("ftb");
				// This camera is either in program OR preview, and there is an ongoing transition.
			} else if(state.video.ME[0].inTransition && (preview === tallies[i].config.inputID)) {
				if(!inTransition){
					tallies[i].lights.yellow();
					//console.log(i+" yellow");
				}
			} else if(state.video.ME[0].inTransition && (program === tallies[i].config.inputID)){
				if(!inTransition){
					tallies[i].lights.red();
					//console.log(i+" red");
				} 
			} else if(program === tallies[i].config.inputID) {
				tallies[i].lights.green();
				//console.log(i+" green");
			} else if(preview === tallies[i].config.inputID) {
				tallies[i].lights.off();
				//console.log(i+" off preview");
			} else { // Camera is not in preview or program
				tallies[i].lights.off();
				//console.log(i+" off");
			}
		}else if (obs_data.sceneName==="Intro" || obs_data.sceneName==="Outro"){
			//console.log("INTRO or OUTRO");
			if(state.video.ME[0].fadeToBlack && state.video.ME[0].fadeToBlack.isFullyBlack) {
                                tallies[i].lights.off();
                                //console.log("ftb");
                                // This camera is either in program OR preview, and there is an ongoing transition.
                        } else if(state.video.ME[0].inTransition && (preview === tallies[i].config.inputID)) {
				if(!inTransition){
                                	tallies[i].lights.blue();
                                	//console.log(i+" yellow");
				}
                        } else if(state.video.ME[0].inTransition && (program === tallies[i].config.inputID)){
                                if(!inTransition){
					tallies[i].lights.red();
                                	//console.log(i+" red");
				}
                        } else if(program === tallies[i].config.inputID) {
                                tallies[i].lights.blue();
                                //console.log(i+" yellow");
                        } else if(preview === tallies[i].config.inputID) {
                                tallies[i].lights.off();
                                //console.log(i+" off preview");
                        } else { // Camera is not in preview or program
                                tallies[i].lights.off();
                                //console.log(i+" off");
                        }
		} else {
				//console.log("ELSE");
			tallies[i].lights.off();
		}
	}
	if(state.video.ME[0].inTransition){
		inTransition=true;
	} else if(!state.video.ME[0].inTransition && inTransition) {
		inTransition=false;
	}
}
