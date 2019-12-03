// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const imgur = require('imgur');
const express = require('express');
const xhub = require('express-x-hub');
const bodyParser = require('body-parser');
require('body-parser-xml')(bodyParser);
const schedule = require('node-schedule');
const FormData = require('form-data');
const he = require('he');


const app = express();
const router = express.Router();
const clientID = fs.readFileSync("clientid", "utf8");
const youtubeKey = fs.readFileSync("youtubeKey", "utf8");
const clientSecret = fs.readFileSync("secret", "utf8");
const htmlPath = __dirname + '/views/';

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
var youtubeJSONInput = fs.readFileSync("youtubeusers.json", "utf8");
var youtubeJSON = JSON.parse(youtubeJSONInput);
var youtubeString = JSON.stringify(youtubeJSONInput);
var lastVideoJSON = JSON.parse(fs.readFileSync("lastvideo.json", "utf8"));
var usersJSONInput = fs.readFileSync("users.json", "utf8");
var usersJSON = JSON.parse(usersJSONInput);

//automatically refresh topic subscriptions every day at midnight
var j = schedule.scheduleJob('0 0 * * *', function() {
  console.log("Refreshing subscriptions...");
  console.log("Checking for changes in users.JSON...");
  newUsersJSONInput = fs.readFileSync("users.json", "utf8");
  if (newUsersJSONInput != usersJSONInput) {
    console.log("users.JSON has been modified. Loading new users.JSON...");
    usersJSONInput = newUsersJSONInput;
    usersJSON = JSON.parse(newUsersJSONInput);
    console.log("users.JSON loaded.");
  } else {
    console.log("No changes detected.");
  }
  //console.log("usersJSON:");
  //console.log(usersJSON);
  for (let i = 0; i < usersJSON.users.length; i++) {
    let currentUser = usersJSON.users[i].user_name;
    console.log("Refreshing subscription for " + currentUser + "...");
    if (usersJSON.users[i].user_id == "duplicate_user") {
      console.log("Duplicate user doesn't need refreshed.");
      continue;
    }
    var userID = usersJSON.users[i].user_id;
    var refreshHeaders = {
      'Content-Type': 'application/json',
      'Client-ID': clientID
    };
    var refreshJSON = JSON.stringify({
      'hub.callback': 'http://www.tene.dev/api',
      'hub.mode': 'subscribe',
      'hub.topic': 'https://api.twitch.tv/helix/streams?user_id=' + usersJSON.users[i].user_id,
      'hub.lease_seconds': 86405,
      'hub.secret': clientSecret
    });
    var refreshData = JSON.stringify(refreshJSON);
    refreshOptions = {
      hostname: 'api.twitch.tv',
      path: '/helix/webhooks/hub',
      method: 'POST',
      headers: refreshHeaders
    }
    //console.log(refreshOptions);
    refreshReq = https.request(refreshOptions, (refreshRes) => {
      refreshRes.on('data', d => {
        process.stdout.write(d)
      });
      refreshRes.on('end', function() {
        console.log("Subscription for " + currentUser + " refreshed.");
      })
      refreshReq.on('error', error => {
        console.error(error)
      });
    });
    refreshReq.write(refreshJSON);
    refreshReq.end();
  }
  console.log("Checking for changes in youtubeusers.json");
  newYoutubeJSONInput = fs.readFileSync("youtubeusers.json", "utf8");
  if (newYoutubeJSONInput != youtubeJSONInput) {
    console.log("youtubeusers.JSON has been modified. Loading new youtubeusers.JSON...");
    youtubeJSONInput = newYoutubeJSONInput;
    console.log("youtubeusers.JSON loaded.");
  } else {
    console.log("No changes detected.");
  }
  //console.log("youtubeJSON parsed:");
  youtubeJSON = JSON.parse(youtubeJSONInput);
  //console.log(youtubeJSON);
  for (let i = 0; i < youtubeJSON.users.length; i++) {
    let currentUser = youtubeJSON.users[i].user;
    console.log("Refreshing YT subscription for " + currentUser + "...");
    var userID = youtubeJSON.users[i].id;

    var refreshBody = new FormData();
    refreshBody.append("hub.callback", "http://www.tene.dev/api/yt");
    refreshBody.append("hub.mode", "subscribe");
    refreshBody.append("hub.topic", "https://www.youtube.com/xml/feeds/videos.xml?channel_id=" + userID);
    refreshBody.append("hub.lease_seconds", 86405);
    refreshBody.append("hub.secret", clientSecret);
    var refreshHeaders = refreshBody.getHeaders();
    //console.log("YT Refresh body:");
    //console.log(refreshBody);
    refreshOptions = {
      hostname: 'pubsubhubbub.appspot.com',
      path: '/subscribe',
      method: 'POST',
      headers: refreshHeaders
    }
    refreshReq = https.request(refreshOptions);

    refreshBody.pipe(refreshReq);

    refreshReq.on('response', function(res) {
      console.log("YT subscription refreshed for " + currentUser);
    })
  }
})

app.use(express.static(__dirname + '/views'));
app.use(xhub({
  algorithm: 'sha256',
  secret: clientSecret
}));
app.use(bodyParser.json());
app.use(bodyParser.text({type: 'application/atom+xml'}));
/*
app.use(bodyParser.xml({
  xmlParseOptions: {
    explicitArray: false
  }
}));
*/
app.use(bodyParser.raw());

router.use(function(req, res, next) {
  //console.log("/" + req.method + " to " + req.originalUrl + " at " + Date(Date.now()).toString());
  next();
});

//TODO: maybe add a function in GET to add new users to users.json

//GET homepage
router.get('/', function(req, res) {
  console.log("Oh hey, someone's checking out the homepage");
  if (fs.existsSync(htmlPath + 'index.html')) {
    res.sendFile(htmlPath + 'index.html');
  } else {
    res.writeHead(404, {
      "Content-Type": "text/html"
    });
    res.write("<html><head><title>No HTML provided</title></head><body>This server has not been provided a HTML file to serve. Please contact the webmaster.</body></html>");
    res.end();
  }
});

//GET laptop start pages
router.get('/start', (req, res) => {
  if (fs.existsSync(htmlPath + 'startpage.html')) {
    res.sendFile(htmlPath + 'startpage.html');
  } else {
    res.writeHead(404, {
      "Content-Type": "text/html"
    });
    res.write("<html><head><title>No HTML provided</title></head><body>This server has not been provided a HTML file to serve. Please contact the webmaster.</body></html>");
    res.end();
  }
})

//GET webhook route
router.get('/api', (req, res) => {
  //console.log(JSON.stringify(req.headers));
  //console.log("GET request received at " + Date(Date.now()).toString());
  //console.log(Object.keys(req.query));
  for (var i = 0; i < Object.keys(req.query).length; i++) {
    if (Object.keys(req.query)[i] == 'hub.challenge') {
      //console.log("hub.challenge exists");
      res.send(req.query['hub.challenge']);
      break;
    }
    if (i == (Object.keys(req.query).length - 1) && Object.keys(req.query)[i] != 'hub.challenge') {
      console.log("hub.challenge does not exist");
      res.send("Proper query not detected.");
    }
  }
  //console.log(req.query);
  res.status(200);
});

router.get('/api/yt', (req, res) => {
  //console.log("GET request received at " + Date(Date.now()).toString());
  //console.log(Object.keys(req.query));
  for (var i = 0; i < Object.keys(req.query).length; i++) {
    if (Object.keys(req.query)[i] == 'hub.challenge') {
      //console.log("hub.challenge exists");

      res.send(req.query['hub.challenge']);
      break;
    }
    if (i == (Object.keys(req.query).length - 1) && Object.keys(req.query)[i] != 'hub.challenge') {
      console.log("hub.challenge does not exist");
      res.send("Proper query not detected.");
    }

  }
  //console.log(req.query);
  res.status(200);
});


//POST youtube route
router.post('/api/yt', (req, res) => {
  var hasLog = false;
  req.accepts('application/atom+xml')
  console.log("POST request received at " + Date(Date.now()).toString());
  console.log(req.body);
  res.status(200);
  //console.log(JSON.stringify(req.headers));
  /*if (!req.isXHub && req.headers.secret != clientSecret) {
    console.log("No XHub signature");
    res.status(403);
    res.send();
  } else if (req.headers.secret == clientSecret || req.isXHubValid()) {
    console.log("Valid XHub signature.");*/
    /*
  if (req.body.feed['at:deleted-entry'] != undefined) {
    console.log("Deleted video alert, ignore.");
    console.log("Also outputting deleted entry value out of curiosity.");
    console.log(JSON.stringify(req.body.feed['at:deleted-entry']));
  } else if(req.body.feed.title == "YouTube video feed"){
    //console.log("Not a deleted video alert.");
    console.log("Alert from user " + req.body.feed.entry.author.name);
    //console.log("Entry: " + req.body.feed.entry);
    //console.log("Channel ID: " + req.body.feed.entry['yt:channelId']);
    userID = req.body.feed.entry['yt:channelId'];
    //console.log("Video ID: " + req.body.feed.entry['yt:videoId']);
    videoID = req.body.feed.entry['yt:videoId'];
    videoTitle = he.decode(req.body.feed.entry.title);
    //console.log("Timestamp: " + req.body.feed.entry.published);
    yTTimestamp = req.body.feed.entry.published;
    youtubeJSON = JSON.parse(fs.readFileSync("youtubeusers.json", "utf8"));
    console.log("Checking if " + req.body.feed.entry.author.name + " is in youtubeuser.json");
    for (let i = 0; i < youtubeJSON.users.length; i++) {
      //console.log("Index: " + i + ", user: " + userID + ", compare to: " + youtubeJSON.users[i].id);
      if (userID == youtubeJSON.users[i].id) {
        console.log(req.body.feed.entry.author.name + " is in youtubeusers.json as " + youtubeJSON.users[i].user);
        if(req.body.feed.entry.author.name != youtubeJSON.users[i].user){
          console.log("Alert username and youtubeusers.json username do not match, updating...");
          youtubeJSON.users[i].user = req.body.feed.entry.author.name;
          newYoutubeString = JSON.stringify(youtubeJSON, null, 2);
          fs.writeFileSync("youtubeusers.json", newYoutubeString);
        }
        console.log("Checking if " + youtubeJSON.users[i].user + " has a record.");
        lastVideoJSON = JSON.parse(fs.readFileSync("lastvideo.json", "utf8"));
        //console.log(lastVideoJSON);
        for (let j = 0; j < lastVideoJSON.users.length; j++) {
          //console.log("Index: " + j + ", user: " + userID + ", compare to: " + lastVideoJSON.users[j].id);
          if (lastVideoJSON.users[j].id == userID) {
            console.log(youtubeJSON.users[i].user + " has a record, previous video ID: " + lastVideoJSON.users[j].video_id);
            if (videoID != lastVideoJSON.users[j].video_id) {
              console.log("New video ID does not match logged ID, comparing timestamps.");
              var oldTime = new Date(lastVideoJSON.users[j].timestamp);
              var newTime = new Date(yTTimestamp);
              //console.log("Old: " + oldTime + ", new: " + newTime);
              ignoreTimeout = youtubeJSON.users[i].ignore_timeouts;
              timeout = youtubeJSON.users[i].timeout;
              var difference = newTime - oldTime;
              console.log("ms difference: " + difference);
              console.log(difference / 6e4 + " minutes have passed since the last alert was sent");
              if (Math.sign(difference) != -1) {
                if (!ignoreTimeout && difference < timeout * 6e4) {
                  console.log("Not enough time has passed since the last alert and the user has a timeout set.");
                } else if (ignoreTimeout || difference >= timeout * 6e4 || oldTime == "Invalid Date") {
                  console.log("Enough time has passed since last alert or user has chosen to ignore timeouts");
                  sendYoutube = JSON.stringify({
                    content: youtubeJSON.users[i].message + "**" + videoTitle + "** https://youtu.be/" + videoID
                  });
                  youBotOptions = {
                    hostname: 'discordapp.com',
                    path: youtubeJSON.users[i].webhook_url,
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  }
                  youBotReq = https.request(youBotOptions, youBotRes => {
                    youBotRes.on('data', d => {
                      process.stdout.write(d);
                    });

                  });
                  youBotReq.on('error', error => {
                    console.error(error);
                  });
                  youBotReq.write(sendYoutube);
                  youBotReq.end();
                  console.log("Discord alert sent for " + youtubeJSON.users[i].user + "'s YouTube upload.");
                  lastVideoJSON.users[j].video_id = videoID;
                  lastVideoJSON.users[j].timestamp = yTTimestamp;
                  newLastVideoString = JSON.stringify(lastVideoJSON, null, 2);
                  fs.writeFileSync("lastvideo.json", newLastVideoString);
                  res.status(200).end();
                  hasLog = true;
                  break;
                }
              } else {
                console.log("Negative difference, this alert is somehow older than the latest alert.");
                res.status(200).end();
                hasLog = true;
                break;
              }
            }else{
              console.log("Video ID hasn't changed.");
              res.status(200).end();
              hasLog = true;
              break;
            }
          } else if (j == lastVideoJSON.users.length - 1 && lastVideoJSON.users[j].id != userID && !hasLog) {
            console.log("User has no logs, generating logs from data.");
            sendYoutube = JSON.stringify({
              content: youtubeJSON.users[i].message + "**" + videoTitle + "** https://youtu.be/" + videoID
            });
            youBotOptions = {
              hostname: 'discordapp.com',
              path: youtubeJSON.users[i].webhook_url,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              }
            }
            youBotReq = https.request(youBotOptions, youBotRes => {
              youBotRes.on('data', d => {
                process.stdout.write(d);
              });

            });
            youBotReq.on('error', error => {
              console.error(error);
            });
            youBotReq.write(sendYoutube);
            youBotReq.end();
            console.log("Discord alert sent for " + youtubeJSON.users[i].user + "'s YouTube upload.");
            lastVideoJSON.users.push({
              user: youtubeJSON.users[i].user,
              id: youtubeJSON.users[i].id,
              video_id: videoID,
              timestamp: yTTimestamp
            });
            newLastVideoString = JSON.stringify(lastVideoJSON, null, 2);
            fs.writeFileSync("lastvideo.json", newLastVideoString);
            res.status(200).end();
            break;
          }
        }
      } else if (i == youtubeJSON.users.length - 1 && youtubeJSON.users[i].id != userID) {
        console.log("User not in youtubeusers.json");
        res.status(403).end();
      }
    }
  }else{
    console.log("Weird alert, not a video or a deletion. Outputting request body.");
    console.log(JSON.stringify(req.body));
    res.status(403).end();
  }
  */
//}
});

//POST webhook route
router.post('/api', (req, res) => {
  console.log("POST request received at " + Date(Date.now()).toString());
  req.accepts('application/json');
  //console.log("Headers:");
  //console.log(JSON.stringify(req.headers));
  reqHeaders = JSON.parse(JSON.stringify(req.headers));
  if (!req.isXHub && req.headers.secret != clientSecret) {
    console.log("No XHub signature");
    res.status(403);
    res.send();
  } else if (req.headers.secret == clientSecret || req.isXHubValid()) {
    //console.log("Valid XHub signature");
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
    //console.log(stringified);
    json = JSON.parse(stringified);
    if (json.data !== undefined && json.data.length > 0) {
      var gameHeaders = {
        "Client-ID": clientID
      };
      var gameName;
      var game_id = json.data[0].game_id;
      //console.log("Game ID: " + game_id);
      var options = {
        hostname: 'api.twitch.tv',
        path: '/helix/games?id=' + game_id,
        method: 'GET',
        headers: gameHeaders
      }
      //console.log(options);
      var gameReq = https.request(options, (gameRes) => {
        let data = '';
        gameRes.on('data', (d) => {
          data += d;
        });
        gameRes.on('end', () => {
          gameJSON = JSON.parse(data);
          //console.log(gameJSON);
          gameName = gameJSON.data[0].name;
          //console.log("Game: " + gameName);
          var user_name = json.data[0].user_name;
          var title = json.data[0].title;
          var start_time = new Date(json.data[0].started_at /*+ " +0100"*/ );
          var startTime = json.data[0].started_at;
          //console.log(start_time);
          //console.log(startTime);
          var time_now = new Date(Date.now());
          var user_count = json.data[0].viewer_count;
          var hours = start_time.toLocaleString('default', {
            hour: 'numeric'
          });
          var minutes = start_time.toLocaleString('default', {
            minute: '2-digit'
          });
          var ampm = hours >= 12 ? 'PM' : 'AM';
          if (hours != 12) {
            hours = hours % 12;
          }
          hours = hours < 10 ? '0' + hours : hours;
          minutes = minutes < 10 ? '0' + minutes : minutes;
          var strTime = hours + ':' + minutes + ampm;
          var date = start_time.toLocaleString('default', {
            month: 'long',
            timeZone: 'UTC'
          }) + " " + start_time.toLocaleString('default', {
            day: '2-digit'
          }) + ", " + start_time.toLocaleString('default', {
            year: 'numeric'
          });
          var longDate = start_time.toLocaleString('default', {
            month: 'long',
            timeZone: 'UTC'
          }) + " " + start_time.toLocaleString('default', {
            day: '2-digit'
          }) + ", " + start_time.toLocaleString('default', {
            year: 'numeric'
          }) + " at " + strTime;
          if (fs.existsSync("laststream.json")) {
            lastStreamJSON = fs.readFileSync("laststream.json", "utf8");
            //console.log(lastStreamJSON);
          } else {
            fs.writeFileSync("laststream.json");
          }
          var lastGame;
          var lastStreamTimestamp;
          var lastStream = JSON.parse(lastStreamJSON);
          var isNewUser;
          if (lastStream.users !== undefined && lastStream.users.length > 0) {
            console.log("Logs exist");
            for (var j = 0; j < lastStream.users.length; j++) {
              //console.log("Checking logs in index " + j);
              if (user_name == lastStream.users[j].user_name) {
                console.log(user_name + " has a log, comparing...");
                currentIndex = j;
                //console.log(currentIndex);
                lastGame = lastStream.users[j].game;
                lastStreamTimestamp = lastStream.users[j].timestamp;
                isNewUser = false;
                switch (lastStream.users[j].status){
                  case "live":
                    isOffline = false;
                  case "offline":
                    isOffline = true;
                }
                break;
              }
              //console.log("Current index: " + j + " and length: " + lastStream.users.length);
              if (j == (lastStream.users.length - 1) && user_name != lastStream.users[j].user_name) {
                console.log(user_name + " does not have a log.");
                lastGame = "";
                lastStreamTimestamp = "";
                isNewUser = true;
                isOffline = true;
              }
            }
          }
          //console.log("Current index: " + currentIndex);
          var oldDate = new Date(lastStreamTimestamp);
          var newDate = new Date(start_time);
          var streamDiff = newDate - oldDate;
          if ((streamDiff > 3 * 36e5 || isNewUser)  && isOffline ) {
            console.log("New stream");
            sendToBot(user_name, gameName, title, longDate, "new stream", date, start_time.toLocaleString('default', {
              hour: '2-digit'
            }), lastStream, currentIndex, startTime, isNewUser);
            res.status(200).send();
          } else if (lastGame != gameName) {
            console.log("New game");
            sendToBot(user_name, gameName, title, longDate, "new game", date, start_time.toLocaleString('default', {
              hour: '2-digit'
            }), lastStream, currentIndex, startTime, isNewUser);
            res.status(200).send();
          } else {
            if(!isOffline){
              console.log(user_name + " is still online.");
            }
            console.log("Ignoring alert.");
            res.status(200).send();
          }
        });
      });
      gameReq.on('error', (error) => {
        console.error(error)
      })
      gameReq.end();
      //EVERYTHING SHOULD WORK HERE, TEST DISCORD WEBHOOK POST NEXT
    } else {
      //console.log("Empty array, stream is offline.");
      //console.log(JSON.stringify(req.headers));
      offlineID = req.headers.link.split("=")[2].split(">")[0];
      usersJSON = JSON.parse(fs.readFileSync("users.json", "utf8"));
      for (var i = 0; i < usersJSON.users.length; i++) {
        if (usersJSON.users[i].user_id == offlineID) {
          offlineUserName = usersJSON.users[i].user_name;
          console.log(offlineUserName + " is offline, setting status...");
          offlineJSON = JSON.parse(fs.readFileSync("laststream.json", "utf8"));
          for(var j = 0; j < offlineJSON.users.length; j++){
            if(offlineJSON.users[j].user_name == offlineUserName){
              if(offlineJSON.users[j].status == "offline"){
                console.log(offlineUserName + " is already marked as offline.");
                res.status(200).send();
                break;
              }else{
                oldTimestamp = new Date(offlineJSON.users[j].timestamp);
                currentTimestamp = new Date(req.headers['twitch-notification-timestamp']);
                timeDiff = currentTimestamp - oldTimestamp;
                timeDiffH = (timeDiff / 36e5).toFixed(2);
                console.log(offlineUserName + " was live for " + timeDiffH + " hours");
                offlineJSON.users[j].status = "offline";
                offlineJSON.users[j].timestamp = req.headers['twitch-notification-timestamp'];
                offlineString = JSON.stringify(offlineJSON, null, 2);
                fs.writeFileSync("laststream.json", offlineString);
                res.status(200).send();
              }
            }
          }
        }
      }
    }
    //res.send(req.body);
  } else {
    console.log("Nice try, but your signature is invalid.");
    res.status(403).send();
  }


});

app.use("/", router);

//GET anything else
app.use('*', (req, res) => {
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
function sendToBot(userName, gameName, streamTitle, startTime, reason, shortDate, hour, lastStream, jsonIndex, fullTimeStamp, isNewUser) {
  var message;
  var imgurURL = "";
  //console.log("Full timestamp: "+ fullTimeStamp );
  //console.log("Start time: " + startTime);
  //console.log("Short date: " + shortDate);
  //console.log(usersJSONInput);
  //console.log(usersJSON);
  //console.log(usersJSON.users);

  console.log("Checking if user is in users.json");
  for (var i = 0; i < usersJSON.users.length; i++) {
    lastStreamParsed = JSON.parse(lastStreamJSON);
    //console.log(usersJSON.users[i]);
    console.log("Checking index " + i + " for user " + userName);
    console.log("Comparing " + userName + " to " + usersJSON.users[i].user_name);
    if (usersJSON.users[i].user_name == userName) {
      console.log(userName + " and " + usersJSON.users[i].user_name + " match, proceeding...");
      console.log("Last stream index: " + jsonIndex);
      var gameChangedCount;
      var thumbnailURL = "https://static-cdn.jtvnw.net/previews-ttv/live_user_" + usersJSON.users[i].internal_id + "-640x360.jpg?" + fullTimeStamp;
      if (!isNewUser) {
        if (reason == "new stream") {
          message = usersJSON.users[i].stream_message;
          gameChangedCount = 0;
        } else if (reason == "new game") {
          gameChangedCount = lastStreamParsed.users[jsonIndex].game_changed_count;
          gameChangedCount++;
          console.log(userName + " has changed games " + gameChangedCount + " times this stream.");
          if(userName == "Kiwo"){
            message = usersJSON.users[i].game_message + " - " + gameName;
          }else{
            message = usersJSON.users[i].game_message;
          }
          thumbnailURL = thumbnailURL + "&newgame" + gameChangedCount;
        }
      } else {
        message = usersJSON.users[i].stream_message;
        gameChangedCount = 0;
      }
      data = JSON.stringify({
        content: message,
        embeds: [{
          color: usersJSON.users[i].accent_colour,
          author: {
            icon_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].profile_image,
            name: userName,
            url: "http://twitch.tv/" + usersJSON.users[i].user_name
          },
          description: "[" + streamTitle + "](http://twitch.tv/" + usersJSON.users[i].internal_id + ")",
          thumbnail: {
            url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].profile_image
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
      //console.log(data);
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
      botReq.on('error', error => {
        console.error(error)
      });
      botReq.write(data);
      botReq.end();
      console.log("Discord alert sent for " + userName);
      //console.log("Outputting JSON");
      //console.log(lastStreamJSON);
      //console.log("Modifying JSON...");
      if (!isNewUser) {
        lastStreamParsed.users[jsonIndex].game = gameName;
        lastStreamParsed.users[jsonIndex].timestamp = fullTimeStamp;
        lastStreamParsed.users[jsonIndex].game_changed_count = gameChangedCount;
        lastStreamParsed.users[jsonIndex].status = "live";
        newLastStreamString = JSON.stringify(lastStreamParsed, null, 2);
        //console.log(newLastStreamString);
        fs.writeFileSync("laststream.json", newLastStreamString);
      } else if (isNewUser) {
        lastStreamParsed.users.push({
          user_name: userName,
          timestamp: fullTimeStamp,
          game: gameName,
          game_changed_count: 0,
          status: "live"
        });
        newLastStreamString = JSON.stringify(lastStreamParsed, null, 2);
        //console.log(newLastStreamString);
        fs.writeFileSync("laststream.json", newLastStreamString);
      }
      continue;
    } else {
      console.log(userName + " and " + usersJSON.users[i].user_name + " do not match, checking next entry...");
      continue;
    }
    console.log("User not in JSON. Please add their data to users.json");
  }

}
