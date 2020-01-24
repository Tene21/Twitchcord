# Twitchcord
A small NodeJS-powered webhook handler designed to receive a stream status notification from Twitch's API and convert it into a Discord webhook message payload

Originally developed to replace IFTTT as Twitch streamer Limealicious' live alert provider due to slow response times.

Relies on local JSON files storing essential data regarding target streams, in the following format:

##Twitch

### User data

```JSON
{
	"users": [{
		"user_name": "ExampleUser",
		"stream_message": "A message to be displayed when a new stream starts.",
		"game_message": "A message to be displayed when the stream changes game mid-stream.",
		"webhook_url": "The path to the Discord webhook endpoint, starting with /api/webhooks/...",
		"internal_id": "The internal ID of the streamer, obtained by observing the URL of their stream thumbnails. Often just their username in lowercase, but has sometimes been observed to be different.",
		"user_id": "The numeric ID of the user",
		"accent_colour": "The colour to be used as the accent on the Discord message embed",
		"profile_image": "The filename of the user's profile image on the Twitch CDN"
	}]
}
```
Note that `"users"` is an array, allowing for expansion to function for multiple streamers.

### Latest stream

The server also stores data regarding the previous stream of each user in a similar array for comparison to incoming alerts.
```JSON
{
	"users": [{
		"user_name": "ExampleUser",
		"timestamp": "The start time of the latest stream, in ISO8601 format: YYYY-MM-DDTHH:MM:SSZ",
		"game": "The game being played as of the latest alert",
		"game_changed_count": "The number of times the game has been changed in one stream",
		"status": "The status of the user, as either 'live' or 'offline'"
	}]
}
```

## Serving webpages

The server is capable of serving HTML pages, and will attempt to serve index.html upon receiving a GET request at a root path, otherwise it will serve a generic page warning that no HTML was provided.

## YouTube
#### CURRENTLY BROKEN
Can now provide Discord alerts for YouTube uploads. Relies on JSON similar to the Twitch functionality:

### User data

```JSON
{
	"users": [{
		"user": "ExampleUser",
		"id": "The channel ID of the user",
		"message": "The message to be displayed when the user uploads a video. Should always be followed by either a trailing space or a line break.",
		"webhook_url": "The path to the Discord webhook endpoint, starting with /api/webhooks/..."
		}]
}
```
### Latest video

```JSON
{
  "users": [
    {
      "user": "ExampleUser",
      "id": "The channel ID of the user",
      "video_id": "The ID of the user's latest upload"
    }]
}
```
