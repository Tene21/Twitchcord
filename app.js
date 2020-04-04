// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
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
const kofiHTML = "<div id='kofi-embed'><script type='text/javascript' src='https://ko-fi.com/widgets/widget_2.js'></script><script type='text/javascript'>kofiwidget2.init('Support Me on Ko-fi', '#00566b', 'tene21');kofiwidget2.draw();</script></div>"
const htmlMeta = "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, shrink-to-fit=no\"><meta name=\"description\" content=\"\"><meta name=\"author\" content=\"\">"

// Certificate
const privateKey = fs.readFileSync('/etc/letsencrypt/live/www.tene.dev/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/www.tene.dev/fullchain.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/www.tene.dev/chain.pem', 'utf8');

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
var apiKeys = JSON.parse(fs.readFileSync("apikeys.json", "utf8"));
var clientIDNew = apiKeys.client_id;
var clientSecretNew = apiKeys.client_secret;
var oAuthKey = apiKeys.oauth_key;

//sleep function
const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

//automatically refresh topic subscriptions every day at midnight
var j = schedule.scheduleJob('0 0 * * *', function() {
  //get a new oauth key just in case
  console.log("Obtaining a new oauth key...");
  oauthOptions = {
    hostname: 'id.twitch.tv',
    path: '/oauth2/token?client_id=' + clientIDNew +
    '&client_secret=' + clientSecretNew + '&grant_type=client_credentials',
    method: 'POST'
  }
  oauthReq = https.request(oauthOptions, (oauthRes) => {
    let oAuthData = '';
    oauthRes.on('data', d => {
      oAuthData += d;
    });
    oauthRes.on('end', () => {
      //console.log(oAuthData);
      oauthResponse = JSON.parse(oAuthData);
      oAuthKey = oauthResponse.access_token;
      apiKeys.oauth_key = oAuthKey;
      apiKeysString = JSON.stringify(apiKeys, null, 2);
      fs.writeFileSync("apikeys.json", apiKeysString);
      console.log("Refreshing Twitch subscriptions...");
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
        console.log("Refreshing Twitch subscription for " + currentUser + "...");
        if (usersJSON.users[i].user_id == "duplicate_user") {
          console.log("Duplicate user doesn't need refreshed.");
          continue;
        }
        var userID = usersJSON.users[i].user_id;
        var refreshHeaders = {
          'Content-Type': 'application/json',
          'Client-ID': clientID,
          'Authorization': 'Bearer ' + oAuthKey
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
            console.log("Twitch subscription for " + currentUser + " refreshed.");
          })
          refreshReq.on('error', error => {
            console.error(error)
          });
        });
        refreshReq.write(refreshJSON);
        refreshReq.end();
      }
    });

  })
  oauthReq.end();
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
app.use(bodyParser.xml({
  xmlParseOptions: {
    explicitArray: false
  }
}));
//app.use(bodyParser.raw());
app.use(bodyParser.urlencoded({
  extended: true
}));

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
    res.status(404).send("<html><head><title>No HTML provided</title></head><body>" +
      "This server has not been provided a HTML file to serve. Please contact the webmaster.</body></html>");
  }
});

//GET laptop start pages
router.get('/start', (req, res) => {
  if (fs.existsSync(htmlPath + 'startpage.html')) {
    res.sendFile(htmlPath + 'startpage.html');
  } else {
    res.status(404).send("<html><head><title>No HTML provided</title></head><body>" +
      "This server has not been provided a HTML file to serve. Please contact the webmaster.</body></html>");
  }
});

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
  res.status(200).send();
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
  res.status(200).send();
});


//POST youtube route
router.post('/api/yt', (req, res) => {
  var hasLog = false;
  req.accepts('application/atom+xml')
  console.log("POST request received at " + Date(Date.now()).toString());
  console.log("Refreshing log...");
  lastVideoJSON = JSON.parse(fs.readFileSync("lastvideo.json", "utf8"));
  console.log("Log refreshed.")
  console.log(req.body);
  res.status(200).send();
  if (req.body.feed['at:deleted-entry'] != undefined) {
    console.log("Deleted video alert, ignore.");
    console.log("Also outputting deleted entry value out of curiosity.");
    console.log(JSON.stringify(req.body.feed['at:deleted-entry']));
  } else if (req.body.feed.title == "YouTube video feed") {
    //console.log("Not a deleted video alert.");
    console.log("Alert from user " + req.body.feed.entry.author.name);
    //console.log("Entry: " + req.body.feed.entry);
    //console.log("Channel ID: " + req.body.feed.entry['yt:channelId']);
    userID = req.body.feed.entry['yt:channelId'];
    //console.log("Video ID: " + req.body.feed.entry['yt:videoId']);
    for (let i = 0; i < youtubeJSON.users.length; i++) {
      //console.log("Index: " + i + ", user: " + userID + ", compare to: " + youtubeJSON.users[i].id);
      if (userID == youtubeJSON.users[i].id) {
        console.log(userID + " is in youtubeusers.json, hopefully async works, check back in a minute.");
        getYTAPI(i);
      }
    }
  } else {
    console.log("Weird alert, not a video or a deletion. Outputting request body.");
    console.log(JSON.stringify(req.body));
    res.status(403).end();
  }

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
      if (game_id == "") {
        gameName = null;
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
              if (lastStream.users[j].status == "live") {
                isOffline = false;
              } else if (lastStream.users[j].status == "offline") {
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
        if (Math.sign(streamDiff) != -1) {
          console.log((streamDiff / 36e5).toFixed(2) + " hours since last alert.");
          console.log("Is new user? " + isNewUser);
          console.log("Is offline? " + isOffline);
          if ((streamDiff > 0.5 * 36e5 || isNewUser) && isOffline) {
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
            if (!isOffline) {
              console.log(user_name + " is still online.\nIgnoring alert");
              res.status(200).send();
            } else {
              console.log("Resetting user status to live.");
              lastStream.users[currentIndex].status = "live";
              lastStream.users[currentIndex].timestamp = startTime;
              newLastStreamString = JSON.stringify(lastStream, null, 2);
              //console.log(newLastStreamString);
              fs.writeFileSync("laststream.json", newLastStreamString);
              res.status(200).send();
            }
          }
        } else {
          console.log("Twitch sent a weird alert, timestamp is somehow before the stream's last status update.");
          if (lastStream.users[currentIndex].status == "offline") {
            console.log("User is marked as offline.\nResetting user status to live.");
            lastStream.users[currentIndex].status = "live";
            lastStream.users[currentIndex].timestamp = startTime;
            lastStreamString = JSON.stringify(lastStream, null, 2);
            fs.writeFileSync("laststream.json", lastStreamString);
          } else if (lastGame != gameName) {
            console.log("Game has changed, sending new alert.");
            sendToBot(user_name, gameName, title, longDate, "new game", date, start_time.toLocaleString('default', {
              hour: '2-digit'
            }), lastStream, currentIndex, startTime, isNewUser);
          } else {
            console.log(user_name + " is already live.\nIgnoring alert.");
          }
          res.status(200).send();

        }
      } else {
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
                  if (lastStream.users[j].status == "live") {
                    isOffline = false;
                  } else if (lastStream.users[j].status == "offline") {
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
            if (Math.sign(streamDiff) != -1) {
              console.log((streamDiff / 36e5).toFixed(2) + " hours since last alert.");
              console.log("Is new user? " + isNewUser);
              console.log("Is offline? " + isOffline);
              if ((streamDiff > 1 * 36e5 || isNewUser) && isOffline) {
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
                if (!isOffline) {
                  console.log(user_name + " is still online.\nIgnoring alert");
                  res.status(200).send();
                } else {
                  console.log("Resetting user status to live.");
                  lastStream.users[currentIndex].status = "live";
                  newLastStreamString = JSON.stringify(lastStream, null, 2);
                  //console.log(newLastStreamString);
                  fs.writeFileSync("laststream.json", newLastStreamString);
                  res.status(200).send();
                }
              }
            } else {
              console.log("Twitch sent a weird alert, timestamp is somehow before the stream's last status update.");
              if (lastStream.users[currentIndex].status == "offline") {
                console.log("User is marked as offline.\nResetting user status to live.");
                lastStream.users[currentIndex].status = "live";
                lastStreamString = JSON.stringify(lastStream, null, 2);
                fs.writeFileSync("laststream.json", lastStreamString);
              } else if (lastGame != gameName) {
                console.log("Game has changed, sending new alert.");
                sendToBot(user_name, gameName, title, longDate, "new game", date, start_time.toLocaleString('default', {
                  hour: '2-digit'
                }), lastStream, currentIndex, startTime, isNewUser);
              } else {
                console.log(user_name + " is already live.\nIgnoring alert.");
              }
              res.status(200).send();

            }
          });
        });
        gameReq.on('error', (error) => {
          console.error(error)
        })
        gameReq.end();
      }
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
          for (var j = 0; j < offlineJSON.users.length; j++) {
            if (offlineJSON.users[j].user_name == offlineUserName) {
              if (offlineJSON.users[j].status == "offline") {
                console.log(offlineUserName + " is already marked as offline.");
                res.status(200).send();
                break;
              } else {
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
  //res.status(404).send("Page not found.<br>Please check the URL and try again.");
  res.status(404).send();
});
// Starting both http & https servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

httpServer.listen(80, () => {
  console.log('HTTP Server running on port 80');
});

httpsServer.listen(443, () => {
  console.log('HTTPS Server running on port 443');
});

//get status index
router.get('/api/status', (req, res) => {
  if (fs.existsSync("laststream.json")) {
    lastStreamJSON = JSON.parse(fs.readFileSync("laststream.json", "utf8"));
    //console.log(lastStreamJSON);
  } else {
    console.log("laststream.json does not exist.");
  }
  tableString = "<div id=\"indextable\" class=\"table\"><table><tr><th>User</th><th>Status</th><th>Game</th></tr>";
  for (var k = 0; k < lastStreamJSON.users.length; k++) {
    tableString += "<tr><td><a href=\"/api/status/" + lastStreamJSON.users[k].user_name +
      "\">" + lastStreamJSON.users[k].user_name + "</a></td><td>" +
      lastStreamJSON.users[k].status.charAt(0).toUpperCase() +
      lastStreamJSON.users[k].status.slice(1) + "</td><td>";
    /*if(lastStreamJSON.users[k].status == "offline"){
      tableString += "N/A";
    }else{
      */
    tableString += lastStreamJSON.users[k].game;
    /*
    }
    */
    tableString += "</td></tr>";
  }
  tableString += "</table></div>";
  res.status(200).send("<html><head>" + htmlMeta + "<link href=\"/css/status.css\" rel=\"stylesheet\"><title>" +
    "Twitch Index</title></head><body>" + tableString + kofiHTML + "</body></html>");
})

//get user status
router.get('/api/status/:userName', (req, res) => {
  //console.log("Outputting status for " + req.params.userName);
  lastGame = "";
  for (var i = 0; i < usersJSON.users.length; i++) {
    if (usersJSON.users[i].user_name.toLowerCase() == req.params.userName.toLowerCase() && usersJSON.users[i].user_id != "duplicate_user") {
      //console.log(usersJSON.users[i].user_name + " is in users.json");
      if (fs.existsSync("laststream.json")) {
        lastStreamJSON = JSON.parse(fs.readFileSync("laststream.json", "utf8"));
        //console.log(lastStreamJSON);
      } else {
        console.log("laststream.json does not exist.");
        break;
      }
      for (var j = 0; j < lastStreamJSON.users.length; j++) {
        if (usersJSON.users[i].user_name == lastStreamJSON.users[j].user_name) {
          //console.log(usersJSON.users[i].user_name + " has a log");
          if (lastStreamJSON.users[j].game == null) {
            lastGame = "in a category with no ID";
          } else {
            lastGame = lastStreamJSON.users[j].game;
          }
          oldTime = new Date(lastStreamJSON.users[j].timestamp);
          newTime = Date.now();
          timeDiff = newTime - oldTime;
          timeDiffH = (timeDiff / 36e5);
          if (timeDiffH < 1) {
            timeDiffH = Math.floor(timeDiffH)
          } else {
            timeDiffH = timeDiffH.toFixed();
          }
          timeDiffM = (timeDiff / 6e4).toFixed();
          timeDiffM = timeDiffM % 60;
          outputString = "<a class=\"username\" href=\"http://twitch.tv/" +
            lastStreamJSON.users[j].user_name.toLowerCase() + "\">" +
            lastStreamJSON.users[j].user_name + "</a> has been " +
            lastStreamJSON.users[j].status;
          if (timeDiffH >= 1) {
            if (timeDiffH == 1) {
              outputString += " for " + timeDiffH + " hour";
            } else {
              outputString += " for " + timeDiffH + " hours";
            }
            if (timeDiffM == 1) {
              outputString += " and " + timeDiffM + " minute,";
            } else if (timeDiffM > 1) {
              outputString += " and " + timeDiffM + " minutes,";
            } else if (timeDiffM == 0) {

            }
          } else {
            if (timeDiffM == 1) {
              outputString += " for " + timeDiffM + " minute";
            } else if (timeDiffM > 1) {
              outputString += " for " + timeDiffM + " minutes";
            } else if (timeDiffM == 0) {
              outputString += " since right this very minute"
            }
          }

          if (lastStreamJSON.users[j].status == "offline") {
            outputString += " and was last streaming " + lastGame;
          } else {
            outputString += " and is currently streaming " + lastGame;
          }
          if (lastStreamJSON.users[j].game_changed_count != 0) {
            outputString += " after changing games " + lastStreamJSON.users[j].game_changed_count + " time";
            if (lastStreamJSON.users[j].game_changed_count == 1) {
              outputString += ".";
            } else {
              outputString += "s."
            }
          } else {
            outputString += ".";
          }
          //console.log(outputString);
          currentStatus = "<div id=\"currentstatus\">" + outputString + "</div>"
          tableString = "<div id=\"indextable\" class=\"table\"><table><tr><th>User</th><th>Status</th><th>Game</th></tr>";
          for (var k = 0; k < lastStreamJSON.users.length; k++) {
            tableString += "<tr><td><a href=\"/api/status/" + lastStreamJSON.users[k].user_name +
              "\">" + lastStreamJSON.users[k].user_name + "</a></td><td>" +
              lastStreamJSON.users[k].status.charAt(0).toUpperCase() +
              lastStreamJSON.users[k].status.slice(1) + "</td><td>";
            /*if(lastStreamJSON.users[k].status == "offline"){
              tableString += "N/A";
            }else{
              */
            tableString += lastStreamJSON.users[k].game;
            /*
            }
            */
            tableString += "</td></tr>";
          }
          tableString += "</table></div>";
          //console.log(tableString);
          displayString = "<div id=\"streamembed\" class='container' style='width: 100vw; height: 56.25vw; max-height: 50vh; max-width: 88.89vh; margin-left: -8px; margin-top: -8px; position: relative; top:0; left:0;'><iframe style='position:absolute; top:0; left:0' src='https://player.twitch.tv/?channel=" +
            usersJSON.users[i].user_name + "&muted=true' height=100% width=100%" +
            " frameborder='0' scrolling='no' allowfullscreen='true'></iframe></div>" + currentStatus;
          res.status(200).send("<html><head>" + htmlMeta + "<link href=\"/css/status.css\" rel=\"stylesheet\"><title>" +
            lastStreamJSON.users[j].user_name + " status</title></head><body>" +
            displayString + tableString + kofiHTML + "</body></html>");
          break;
        }
      }
      break;
    } else if (i == (usersJSON.users.length - 1)) {
      console.log(req.params.userName + " is not in users.json");
      res.status(404).send("<!DOCTYPE html><html><head><title>Unregistered user</title></head><body>" +
        req.params.userName + " is not registered with this API.<br>Please contact " +
        "<a href=\"mailto:contact@tene.dev\">admin@tene.dev</a> or fill out <a href=\"/contact\">this form</a> if you would like to fix that.</body></html>");
    }
  }
});

//SEND POST REQUEST TO DISCORD WEBHOOK URL
function sendToBot(userName, gameName, streamTitle, startTime, reason, shortDate, hour, lastStream, jsonIndex, fullTimeStamp, isNewUser) {
  var message;
  var imgurURL = "";
  //console.log("Full timestamp: "+ fullTimeStamp );
  console.log("Start time: " + startTime);
  //console.log("Short date: " + shortDate);
  //console.log(usersJSONInput);
  //console.log(usersJSON);
  //console.log(usersJSON.users);

  console.log("Checking if user is in users.json");
  var found = false;
  for (var i = 0; i < usersJSON.users.length; i++) {
    lastStreamParsed = JSON.parse(lastStreamJSON);
    //console.log(usersJSON.users[i]);
    //console.log("Checking index " + (i + 1) + " for user " + userName);
    //console.log("Comparing " + userName + " to " + usersJSON.users[i].user_name);
    if (usersJSON.users[i].user_name == userName) {
      if (found == false) {
        console.log(userName + " is in users.json");
        found = true;
      } else {
        console.log("Duplicate entry found for " + userName);
      }

      //console.log("Last stream index: " + jsonIndex);
      var gameChangedCount;
      var thumbnailURL = "https://static-cdn.jtvnw.net/previews-ttv/live_user_" +
        usersJSON.users[i].internal_id + "-640x360.jpg?" + fullTimeStamp;

      if (!isNewUser) {
        if (reason == "new stream") {
          if (usersJSON.users[i].stream_message.includes("<game>")) {
            if(gameName == null){
              message = usersJSON.users[i].stream_message.replace("<game>", "Unknown Game");
            }else{
              message = usersJSON.users[i].stream_message.replace("<game>", gameName);
            }
          } else {
            message = usersJSON.users[i].stream_message;
          }

          gameChangedCount = 0;
        } else if (reason == "new game") {
          gameChangedCount = lastStreamParsed.users[jsonIndex].game_changed_count;
          gameChangedCount++;
          var changeStamp = new Date(Date.now());
          //console.log(changeStamp);
          var hours = changeStamp.toLocaleString('default', {
            hour: 'numeric'
          });
          var minutes = changeStamp.toLocaleString('default', {
            minute: '2-digit'
          });
          var ampm = hours >= 12 ? 'PM' : 'AM';
          if (hours != 12) {
            hours = hours % 12;
          }
          hours = hours < 10 ? '0' + hours : hours;
          minutes = minutes < 10 ? '0' + minutes : minutes;
          var strTime = hours + ':' + minutes + ampm;
          var changeLong = changeStamp.toLocaleString('default', {
            month: 'long',
            timeZone: 'UTC'
          }) + " " + changeStamp.toLocaleString('default', {
            day: '2-digit'
          }) + ", " + changeStamp.toLocaleString('default', {
            year: 'numeric'
          }) + " at " + strTime;
          console.log(userName + " has changed games " + gameChangedCount + " times this stream.\nLast game change was at " + changeLong);
          if (usersJSON.users[i].game_message.includes("<game>")) {
            if(gameName == null){
              message = usersJSON.users[i].game_message.replace("<game>", "something else");
            }else{
              message = usersJSON.users[i].game_message.replace("<game>", gameName);
            }
          } else {
            message = usersJSON.users[i].game_message;
          }
          thumbnailURL = thumbnailURL + "&newgame" + gameChangedCount;
        }
      } else {
        message = usersJSON.users[i].stream_message;
        gameChangedCount = 0;
      }
      console.log("Show timestamp? " + usersJSON.users[i].show_timestamp);
      console.log("Start time: " + startTime);
      //console.log("Thumbnail URL: " + thumbnailURL);
      if (usersJSON.users[i].show_timestamp == false) {
        changeLong = "";
      }else{
        if(reason == "new stream"){
          changeLong = startTime;
        }
      }
      if (gameName == null) {
        data = JSON.stringify({
          content: message,
          embeds: [{
            color: usersJSON.users[i].accent_colour,
            author: {
              icon_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].profile_image,
              name: userName,
              url: "http://twitch.tv/" + usersJSON.users[i].user_name
            },
            description: "**[" + streamTitle + "](http://twitch.tv/" + usersJSON.users[i].internal_id + ")**",
            thumbnail: {
              url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].profile_image
            },
            image: {
              url: thumbnailURL
            },
            footer: {
              text: changeLong
            }
          }]
        });
      } else {
        data = JSON.stringify({
          content: message,
          embeds: [{
            color: usersJSON.users[i].accent_colour,
            author: {
              icon_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/" + usersJSON.users[i].profile_image,
              name: userName,
              url: "http://twitch.tv/" + usersJSON.users[i].user_name
            },
            description: "**[" + streamTitle + "](http://twitch.tv/" + usersJSON.users[i].internal_id + ")**",
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
              text: changeLong
            }
          }]
        });

      }
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
      //console.log(userName + " and " + usersJSON.users[i].user_name + " do not match.");
      if (i == (usersJSON.users.length - 1)) {
        //console.log("End of JSON reached.");
        continue;
      } else {
        //console.log("Checking next entry...");
        continue;
      }
    }
    console.log("User not in JSON. Please add their data to users.json");
  }

}

function sendYoutube(title, videoId, webhookUrl, message) {
  data = JSON.stringify({
    content: message + "**" + title + "** https://youtu.be/" + videoId
  });
  console.log(data);
  youBotOptions = {
    hostname: 'discordapp.com',
    path: webhookUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }

  youBotReq = https.request(youBotOptions, youBotRes => {
    youBotRes.on('data', d => {
      process.stdout.write(d)
    });
  });
  youBotReq.on('error', error => {
    console.error(error)
  });
  youBotReq.write(data);
  youBotReq.end();
}

const getYTAPI = async (userIndex) => {
  await sleep(30000);
  console.log("Async succeeded at: " + Date(Date.now()).toString());
  console.log("Reloading lastvideo.json...");
  lastVideoJSON = JSON.parse(fs.readFileSync("lastvideo.json", "utf8"));
  console.log("lastvideo.json reloaded.")
  console.log("Checking YT API manually for " + youtubeJSON.users[userIndex].user + "'s latest video...");
  var yTOptions = {
    hostname: 'www.googleapis.com',
    path: '/youtube/v3/search?part=snippet&channelId=' + userID + "&maxResults=10&order=date&key=" + youtubeKey + "&type=video",
    method: 'GET'
  }
  //console.log(options);
  var youReq = https.request(yTOptions, (youRes) => {
    let data = ''
    youRes.on('data', (d) => {
      data += d;
    });
    youRes.on('end', () => {
      //console.log(data);
      let firstVideo = "";
      latestVideo = JSON.parse(data);
      if (latestVideo.items.length == 0) {
        console.log("No video in API request, google being slow.\nNot my fault.");
      } else {
        for (j = 0; j < lastVideoJSON.users.length; j++) {
          if (lastVideoJSON.users[j].id == userID) {
            console.log(lastVideoJSON.users[j].user + " has a YT log.\nLatest video: " + lastVideoJSON.users[j].video_id);
            if (latestVideo.items[0].id.videoId != lastVideoJSON.users[j].video_id) {
              console.log("Latest video has changed since last alert.\nChecking for multiple new videos.");
              let videos = [];
              for (let k = 0; k < latestVideo.items.length; k++) {
                if (latestVideo.items[k].id.videoId == lastVideoJSON.users[j].video_id) {
                  console.log("Reached the video from the latest alert.");
                  if (firstVideo != "") {
                    console.log("Updating JSON to show most recent video.");
                    lastVideoJSON.users[j].video_id = firstVideo;
                    fs.writeFileSync("lastvideo.json", JSON.stringify(lastVideoJSON, null, 2));
                    videos.reverse()
                    console.log("Video array:\n" + JSON.stringify(videos));
                  }
                  break;
                } else if (k == 0) {
                  console.log("Sending an alert for the first video in the list.\nTitle: " + latestVideo.items[k].snippet.title +
                    "\nURL: " + latestVideo.items[k].id.videoId + "\nMarking this as the most recent video.");
                    videos.push({
                      title: latestVideo.items[k].snippet.title,
                      id: latestVideo.items[k].id.videoId
                    });
                  sendYoutube(latestVideo.items[k].snippet.title, latestVideo.items[k].id.videoId, youtubeJSON.users[userIndex].webhook_url, youtubeJSON.users[userIndex].message);
                  firstVideo = latestVideo.items[k].id.videoId;
                  continue;
                } else if ((k + 1) == latestVideo.items.length) {
                  console.log("Sending an alert for the last video in the list.\nTitle: " + latestVideo.items[k].snippet.title +
                    "\nURL: " + latestVideo.items[k].id.videoId + "\nUpdating JSON to show most recent video.");
                  sendYoutube(latestVideo.items[k].snippet.title, latestVideo.items[k].id.videoId, youtubeJSON.users[userIndex].webhook_url, youtubeJSON.users[userIndex].message);
                  lastVideoJSON.users[j].video_id = firstVideo;
                  videos.push({
                    title: latestVideo.items[k].snippet.title,
                    id: latestVideo.items[k].id.videoId
                  });
                  fs.writeFileSync("lastvideo.json", JSON.stringify(lastVideoJSON, null, 2));
                  videos.reverse()
                  console.log("Video array:\n" + JSON.parse(videos));
                  break;
                } else {
                  console.log("Sending an alert for video titled: " + latestVideo.items[k].snippet.title + "\nURL: " + latestVideo.items[k].id.videoId);
                  videos.push({
                    title: latestVideo.items[k].snippet.title,
                    id: latestVideo.items[k].id.videoId
                  });
                  sendYoutube(latestVideo.items[k].snippet.title, latestVideo.items[k].id.videoId, youtubeJSON.users[userIndex].webhook_url, youtubeJSON.users[userIndex].message);
                  continue;
                }
              }

            } else {
              console.log("Latest video has not changed since last alert.");
              break;
            }
          } else if (j == (lastVideoJSON.users.length - 1) && lastVideoJSON.users[j].id != userID && firstVideo == "") {
            console.log("Current index: " + j + ", length: " + lastVideoJSON.users.length);
            console.log("JSON ID: " + lastVideoJSON.users[j].id + ", userID: " + userID);
            console.log("User does not have a log.\nAssuming latest video is new and populating JSON...");
            videos.push({
              title: latestVideo.items[0].snippet.title,
              id: latestVideo.items[0].id.videoId
            });
            sendYoutube(videos, youtubeJSON.users[userIndex].webhook_url, youtubeJSON.users[userIndex].message);
            lastVideoJSON.users.push({
              user: youtubeJSON.users[userIndex].user,
              id: youtubeJSON.users[userIndex].id,
              video_id: latestVideo.items[0].id.videoId
            });
            fs.writeFileSync("lastvideo.json", JSON.stringify(lastVideoJSON, null, 2));
            break;
          }
        }
      }
    });
  });
  youReq.on('error', (error) => {
    console.error(error);
  });
  youReq.end();
}
