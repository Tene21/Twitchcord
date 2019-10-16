// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const imgur = require('imgur');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const clientID = fs.readFileSync("clientid", "utf8");

// Certificate
const privateKey = fs.readFileSync('/etc/letsencrypt/live/tene.dev/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/tene.dev/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/tene.dev/chain.pem', 'utf8');

const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

var lastStreamJSON;
var currentIndex;

app.use(bodyParser.json());

//GET homepage
app.get('/', function(req,res) {
	console.log("Oh hey, someone's checking out the homepage");
	res.sendFile('/home/pi/server/index.html');
});

//GET webhook route
app.get('/api', (req,res) => {
	//TODO: detect unsubscribe alert when the topic subscription runs out, use to automatically send a keep-alive to the Twitch API
	console.log("GET request received at " + Date(Date.now()).toString());
	//console.log(Object.keys(req.query));
	for(var i=0; i<Object.keys(req.query).length; i++)
	{
		if(Object.keys(req.query)[i] == 'hub.challenge')
		{
			console.log("hub.challenge exists");
			res.send(req.query['hub.challenge']);
			break;
		}
		console.log("hub.challenge does not exist");
		res.send("Proper query not detected.");
	}
	//console.log(req.query);
	res.status(200);
});

//POST webhook route
app.post('/api', (req,res) => {
	console.log("POST request received at " + Date(Date.now()).toString());
	req.accepts('application/json');
	console.log(req.body);
	var stringified = JSON.stringify(req.body);
	//in case any characters need escaped
	stringified = stringified.replace(/\\n/g, "\\n")  
               .replace(/\\'/g, "\\'")
               .replace(/\\"/g, '\\"')
               .replace(/\\&/g, "\\&")
               .replace(/\\r/g, "\\r")
               .replace(/\\t/g, "\\t")
               .replace(/\\b/g, "\\b")
               .replace(/\\f/g, "\\f");
	console.log(stringified);
	json = JSON.parse(stringified);
	if(json.data !== undefined && json.data.length > 0){
		var gameHeaders = { "Client-ID": clientID };
		var gameName;
		var game_id = json.data[0].game_id;
		var options = {
			hostname: 'api.twitch.tv',
			path: '/helix/games?id=' + game_id,
			method: 'GET',
			headers: gameHeaders
			}
			console.log(options);
		var gameReq = https.request(options, (gameRes) => {
			let data = '';
			gameRes.on('data', (d) => {
				data += d;
			});
			gameRes.on('end', () => {
				gameJSON = JSON.parse(data);
				console.log(gameJSON);
				gameName = gameJSON.data[0].name;
				console.log("Game: " + gameName);
				var user_name = json.data[0].user_name;
				var title = json.data[0].title;
				var start_time = new Date(json.data[0].started_at /*+ " +0100"*/);
				console.log(start_time);
				var time_now = new Date(Date.now());
				var user_count = json.data[0].viewer_count;
				var hours = start_time.toLocaleString('default', {hour: 'numeric'});
				var minutes = start_time.toLocaleString('default', {minute: '2-digit'});
				var ampm = hours >= 12 ? 'PM' : 'AM';
				hours = hours % 12;
				hours = hours <10 ? '0'+hours : hours;
				minutes = minutes < 10 ? '0'+minutes : minutes;
				var strTime = hours + ':' + minutes + ampm;
				var date = start_time.toLocaleString('default', {month: 'long', timeZone: 'UTC'}) + " " + start_time.toLocaleString('default', {day: '2-digit'}) + ", " + start_time.toLocaleString('default', {year: 'numeric'});
				var longDate = start_time.toLocaleString('default', {month: 'long', timeZone: 'UTC'}) + " " + start_time.toLocaleString('default', {day: '2-digit'}) + ", " + start_time.toLocaleString('default', {year: 'numeric'}) + " at " + strTime;
				fs.appendFileSync("log.txt", user_name + " started playing " + gameName + " at " + longDate + " with title " + title +" for " + user_count + " viewers.\nCurrent time is: " + time_now.toLocaleTimeString() + "\n");
				if(fs.existsSync("laststream.json")){
					lastStreamJSON = fs.readFileSync("laststream.json", "utf8");
					console.log(lastStreamJSON);
				}else{
					fs.writeFileSync("laststream.json");
				}
				var lastGame;
				var lastStreamTimestamp;
				var lastStream = JSON.parse(lastStreamJSON);
				if(lastStream.users !== undefined && lastStream.users.length > 0){
					console.log("Logs exist");
					for(var j = 0; j < lastStream.users.length; j++){
						console.log("Checking logs in index " + j);
						if(user_name == lastStream.users[j].user_name){
							console.log("User " + user_name + " has a log, comparing...");
							currentIndex = j;
							console.log(currentIndex);
							lastGame = lastStream.users[j].game;
							lastStreamTimestamp = lastStream.users[j].timestamp;
						}
					}
				}
				console.log("Current index: " + currentIndex);
				var oldDate = new Date(lastStreamTimestamp);
				var newDate  = new Date(start_time);
				var streamDiff = newDate - oldDate;
				if(streamDiff > 8 * 36e5){
					console.log("More than 8 hours since last stream, new stream");
					sendToBot(user_name, gameName, title, longDate, "new stream", date, start_time.toLocaleString('default', {hour: '2-digit'}), lastStream, currentIndex, start_time);
				}else if(lastGame != gameName){
					console.log("Less than 8 hours since last stream but game has changed");
					sendToBot(user_name, gameName, title, longDate, "new game", date, start_time.toLocaleString('default', {hour: '2-digit'}), lastStream, currentIndex, start_time);
				}else{
					console.log("<8 hours since last stream, game has not changed");
				}
			});
		});
		gameReq.on('error', (error) => {
			console.error(error)
		})
		gameReq.end();
		//EVERYTHING SHOULD WORK HERE, TEST DISCORD WEBHOOK POST NEXT
	}else
	{
		console.log("Empty array, stream is offline.");
	}
	res.send(req.body);
});

//GET anything else
app.get('*', (req,res) => {
	res.status(404).send("Resource not found.");
});
// Starting both http & https servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

httpServer.listen(3000, () => {
	console.log('HTTP Server running on port 3000');
});

httpsServer.listen(443, () => {
	console.log('HTTPS Server running on port 443');
});

//SEND POST REQUEST TO DISCORD WEBHOOK URL
function sendToBot(userName, gameName, streamTitle, startTime, reason, shortDate, hour, lastStream, jsonIndex, fullTimeStamp){
	var message;
	var imgurURL;
	var usersJSONInput = fs.readFileSync("users.json", "utf8");
	console.log(usersJSONInput);
	usersString = JSON.stringify(usersJSONInput)
	userString = usersString.replace(/\\n/g, "\\n")  
               .replace(/\\'/g, "\\'")
               .replace(/\\"/g, '\\"')
               .replace(/\\&/g, "\\&")
               .replace(/\\r/g, "\\r")
               .replace(/\\t/g, "\\t")
               .replace(/\\b/g, "\\b")
               .replace(/\\f/g, "\\f");
	usersJSON = JSON.parse(usersJSONInput);
	console.log(usersJSON);
	console.log(usersJSON.users);
	//FAILED ATTEMPT TO AVOID DISCORD IMAGE CACHING ISSUES BY REUPLOADING TO IMGUR
	/* 
	imgur.uploadUrl(thumbnailURL)
		.then(function (imgurJSON) {
			console.log("Imgur thumbnail: " + imgurJSON.data.link);
		})
		.catch(function (err) {
			console.error(err.message);
		}); 
		*/
	console.log("Checking if user is in users.json");
	for(var i = 0; i < usersJSON.users.length; i++)
	{
		var thumbnailURL = "https://static-cdn.jtvnw.net/previews-ttv/live_user_" + usersJSON.users[i].internal_id + "-640x360.jpg";
		console.log(usersJSON.users[i]);
		console.log("Checking index " + i + " for user " + userName);
		console.log("Comparing " + userName + " to " + usersJSON.users[i].user_name);
		if(usersJSON.users[i].user_name == userName){
			console.log(userName + " and " + usersJSON.users[i].user_name + " match, proceeding...");
			if(reason == "new stream")
			{
				message = usersJSON.users[i].stream_message;
			}else if (reason == "new game")
			{
				message = usersJSON.users[i].game_message;
			}
			data = JSON.stringify({
				content:message,
				embeds:[{
					color:6570405,
					author:{
						icon_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].internal_id + "-profile_image-602e91b1edb132e8-300x300.png",
						name: userName,
						url: "http://twitch.tv/" + usersJSON.users[i].user_name,
						
					},
					description: "[" + streamTitle + "](http://twitch.tv/" + usersJSON.users[i].user_name +")",
					thumbnail: {
						url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].internal_id + "-profile_image-602e91b1edb132e8-300x300.png"
					},
					fields: [{
						name: "Game",
						value: gameName,
						inline: true
					}],
					image: {
						url: thumbnailURL
					},
					footer: {
						text: startTime
					}
				}]
			});
			console.log(data);
			botOptions = {
				hostname: 'discordapp.com',
				path: usersJSON.users[i].webhook_url, //webhook url associated with user
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			}
			
			botReq = https.request(botOptions, botRes => {
				botRes.on('data', d => {
					process.stdout.write(d)
				});
			});
			botReq.on('error', error=> {
				console.error (error)
			});
			botReq.write(data);
			botReq.end();
			console.log("Outputting JSON");
			console.log(lastStreamJSON);
			console.log("Modifying JSON...");
			lastStreamParsed = JSON.parse(lastStreamJSON);
			lastStreamParsed.users[jsonIndex].game = gameName;
			lastStreamParsed.users[jsonIndex].timestamp = fullTimeStamp;
			newLastStreamString = JSON.stringify(lastStreamParsed, null, 2);
			console.log(newLastStreamString);
			fs.writeFileSync("laststream.json", newLastStreamString);
		}else{
			console.log("Wait a minute... who *are* you?");
		}
		
	}
}
