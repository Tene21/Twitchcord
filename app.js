// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const imgur = require('imgur');
const express = require('express');
const xhub = require('express-x-hub');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');
const FormData = require('form-data');

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
var usersJSONInput = fs.readFileSync("users.json", "utf8");
var usersJSON = JSON.parse(usersJSONInput);

//automatically refresh topic subscriptions every day at midnight
var j = schedule.scheduleJob('0 0 * * *', function() {
  console.log("Checking for changes in users.JSON...");
  newUsersJSONInput = fs.readFileSync("users.json", "utf8");
  if (newUsersJSONInput != usersJSONInput) {
    console.log("users.JSON has been modified. Loading new users.JSON...");
    usersJSONInput = newUsersJSONInput;
    usersJSON = newUsersJSONInput;
    console.log("users.JSON loaded.");
  } else {
    console.log("No changes detected.");
  }
  console.log("usersJSON:");
  console.log(usersJSON);
  for (let i = 0; i < usersJSON.users.length; i++) {
    let currentUser = usersJSON.users[i].user_name;
    console.log("Refreshing subscription for " + currentUser + "...");
    if (usersJSON.users[i].user_id == "test_id") {
      console.log("Test user doesn't need refreshed.");
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
  if (newYoutubeJSONInput != youtubeJSON) {
    console.log("youtubeusers.JSON has been modified. Loading new youtubeusers.JSON...");
    youtubeJSON = newYoutubeJSONInput;
    console.log("youtubeusers.JSON loaded.");
  } else {
    console.log("No changes detected.");
  }
  //console.log("youtubeJSON parsed:");
  youtubeJSON = JSON.parse(youtubeJSON);
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
app.use(bodyParser.raw());

router.use(function(req, res, next) {
  console.log("/" + req.method + " from " + req.ip + " to " + req.originalUrl);
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
  console.log(JSON.stringify(req.headers));
  console.log("GET request received at " + Date(Date.now()).toString());
  //console.log(Object.keys(req.query));
  for (var i = 0; i < Object.keys(req.query).length; i++) {
    if (Object.keys(req.query)[i] == 'hub.challenge') {
      console.log("hub.challenge exists");
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
  console.log(JSON.stringify(req.headers));
  console.log("GET request received at " + Date(Date.now()).toString());
  //console.log(Object.keys(req.query));
  for (var i = 0; i < Object.keys(req.query).length; i++) {
    if (Object.keys(req.query)[i] == 'hub.challenge') {
      console.log("hub.challenge exists");
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
  console.log(JSON.stringify(req.headers));
  if (req.headers.link !== undefined) {
    userID = req.headers.link.split(';', 1)[0].split('=')[1].slice(0, -1);
    console.log(userID);
  }
  //GET https://www.googleapis.com/youtube/v3/search
  console.log("Checking if " + userID + " matches a user in the logs.");
  for (let i = 0; i < youtubeJSON.users.length; i++) {
    if (userID == youtubeJSON.users[i].id) {
      console.log(userID + " is " + youtubeJSON.users[i].user);
      console.log("Checking if user has a record.");
      lastVideoJSON = JSON.parse(fs.readFileSync("lastvideo.json", "utf8"));
      for (let j = 0; j < lastVideoJSON.users.length; j++) {

				lastVideoJSON = JSON.parse(fs.readFileSync("lastvideo.json", "utf8"));

        if (lastVideoJSON.users[j].id == userID) {
          //console.log("")
          newYoutubeKey = youtubeKey.replace(/\\n/g, "\\n")
            .replace(/\\'/g, "\\'")
            .replace(/\\"/g, '\\"')
            .replace(/\\&/g, "\\&")
            .replace(/\\r/g, "\\r")
            .replace(/\\t/g, "\\t")
            .replace(/\\b/g, "\\b")
            .replace(/\\f/g, "\\f");
          var options = {
            hostname: 'www.googleapis.com',
            path: '/youtube/v3/search?part=snippet&channelId=' + userID + '&order=date&maxResults=1&key=' + newYoutubeKey,
            method: 'GET'
          }
          console.log(options.path + "testforspaces");
          var youtubeReq = https.request(options, (youtubeRes) => {
            let data = '';
            youtubeRes.on('data', (d) => {
              data += d;
            });
            youtubeRes.on('end', () => {
              videoJSON = JSON.parse(data);
              //console.log(lastVideoJSON);
              //console.log("Latest id: " + videoJSON.items[0].id.videoId);
              //console.log("Last id: " + lastVideoJSON.users[j].video_id);
              if (videoJSON.items[0].id.videoId != lastVideoJSON.users[j].video_id) {
                if (videoJSON.items[0].snippet.channelTitle != lastVideoJSON.users[j].user) {
                  console.log("Update username in records.");
                  lastVideoJSON.users[j].user = videoJSON.items[0].snippet.channelTitle;
                }
                console.log("New video!")
                url = videoJSON.items[0].id.videoId;
                title = videoJSON.items[0].snippet.title;
                //console.log("Latest video: " + title);
                sendYoutube = JSON.stringify({
                  content: youtubeJSON.users[i].message + " **" + title + "** http://youtu.be/" + url
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
                //console.log(lastVideoJSON);
                lastVideoJSON.users[j].video_id = url;
                //console.log("Modified:");
                //console.log(lastVideoJSON);
                newLastVideoString = JSON.stringify(lastVideoJSON, null, 2);
                fs.writeFileSync("lastvideo.json", newLastVideoString);
              } else {
                console.log("Latest video hasn't changed since last notification.");
              }
            });
          });
          youtubeReq.end();
        }else if((j + 1) == lastVideoJSON.users.length){
					console.log("User has no logs, generating logs from response.");
					newYoutubeKey = youtubeKey.replace(/\\n/g, "\\n")
            .replace(/\\'/g, "\\'")
            .replace(/\\"/g, '\\"')
            .replace(/\\&/g, "\\&")
            .replace(/\\r/g, "\\r")
            .replace(/\\t/g, "\\t")
            .replace(/\\b/g, "\\b")
            .replace(/\\f/g, "\\f");
          var options = {
            hostname: 'www.googleapis.com',
            path: '/youtube/v3/search?part=snippet&channelId=' + userID + '&order=date&maxResults=1&key=' + newYoutubeKey,
            method: 'GET'
          }
          console.log(options.path + "testforspaces");
          var youtubeReq = https.request(options, (youtubeRes) => {
            let data = '';
            youtubeRes.on('data', (d) => {
              data += d;
            });
            youtubeRes.on('end', () => {
              videoJSON = JSON.parse(data);
              //console.log(lastVideoJSON);
              //console.log("Latest id: " + videoJSON.items[0].id.videoId);
              //console.log("Last id: " + lastVideoJSON.users[j].video_id);



                console.log("New video!")
                url = videoJSON.items[0].id.videoId;
                title = videoJSON.items[0].snippet.title;
                //console.log("Latest video: " + title);
                sendYoutube = JSON.stringify({
                  content: youtubeJSON.users[i].message + " **" + title + "** http://youtu.be/" + url
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
                //console.log(lastVideoJSON);
								lastVideoJSON.users.push({
									user: videoJSON.items[0].snippet.channelTitle,
									id: youtubeJSON.users[i].id,
									video_id: url
								});
                //console.log("Modified:");
                //console.log(lastVideoJSON);
                newLastVideoString = JSON.stringify(lastVideoJSON, null, 2);
                fs.writeFileSync("lastvideo.json", newLastVideoString);

            });
          });
          youtubeReq.end();
				}
      }
    }
  }
//console.log(req.body);
res.status(200).send();
}
);

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
    console.log("Valid XHub signature");
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
              console.log("Checking logs in index " + j);
              if (user_name == lastStream.users[j].user_name) {
                console.log("User " + user_name + " has a log, comparing...");
                currentIndex = j;
                //console.log(currentIndex);
                lastGame = lastStream.users[j].game;
                lastStreamTimestamp = lastStream.users[j].timestamp;
                isNewUser = false;
                break;
              }
              //console.log("Current index: " + j + " and length: " + lastStream.users.length);
              if (j == (lastStream.users.length - 1) && user_name != lastStream.users[j].user_name) {
                console.log("User " + user_name + " does not have a log.");
                lastGame = "";
                lastStreamTimestamp = "";
                isNewUser = true;
              }
            }
          }
          //console.log("Current index: " + currentIndex);
          var oldDate = new Date(lastStreamTimestamp);
          var newDate = new Date(start_time);
          var streamDiff = newDate - oldDate;
          if (streamDiff > 8 * 36e5) {
            console.log("More than 8 hours since last stream, new stream");
            sendToBot(user_name, gameName, title, longDate, "new stream", date, start_time.toLocaleString('default', {
              hour: '2-digit'
            }), lastStream, currentIndex, startTime, isNewUser);
          } else if (lastGame != gameName) {
            console.log("Less than 8 hours since last stream but game has changed");
            sendToBot(user_name, gameName, title, longDate, "new game", date, start_time.toLocaleString('default', {
              hour: '2-digit'
            }), lastStream, currentIndex, startTime, isNewUser);
          } else {
            console.log("<8 hours since last stream, game has not changed");
          }
        });
      });
      gameReq.on('error', (error) => {
        console.error(error)
      })
      gameReq.end();
      //EVERYTHING SHOULD WORK HERE, TEST DISCORD WEBHOOK POST NEXT
    } else {
      console.log("Empty array, stream is offline.");
    }
    res.send(req.body);
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
          message = usersJSON.users[i].game_message;
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
      //console.log("Outputting JSON");
      //console.log(lastStreamJSON);
      //console.log("Modifying JSON...");
      if (!isNewUser) {
        lastStreamParsed.users[jsonIndex].game = gameName;
        lastStreamParsed.users[jsonIndex].timestamp = fullTimeStamp;
        lastStreamParsed.users[jsonIndex].game_changed_count = gameChangedCount;
        newLastStreamString = JSON.stringify(lastStreamParsed, null, 2);
        //console.log(newLastStreamString);
        fs.writeFileSync("laststream.json", newLastStreamString);
      } else if (isNewUser) {
        lastStreamParsed.users.push({
          user_name: userName,
          timestamp: fullTimeStamp,
          game: gameName,
          game_changed_count: 0
        })
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
