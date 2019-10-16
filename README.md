# Twitchcord
A small NodeJS-powered webhook handler designed to receive a stream status notification from Twitch's API and convert it into a Discord webhook message payload

Originally developed to replace IFTTT as Twitch streamer Limealicious' live alert provider due to slow response times.

Relies on local JSON files storing essential data regarding target streams, in the following format:

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
		"accent_colour": "The colour to be used as the accent on the Discord message embed"
	}]
}
```
Note that `"users"` is an array, allowing for expansion to function for multiple streamers.

## Latest stream

The server also stores data regarding the previous stream of each user in a similar array for comparison to incoming alerts.
```JSON
{
	"users": [{
		"user_name": "ExampleUser",
		"timestamp": "The start time of the latest stream, in ISO8601 format: YYYY-MM-DDTHH:MM:SS.000Z",
		"game": "The game being played as of the latest alert"
	}]
}
```

## Serving webpages

The server is capable of serving HTML pages, and will attempt to serve index.html upon receiving a GET request at a root path, otherwise it will serve a generic page warning that no HTML was provided.
