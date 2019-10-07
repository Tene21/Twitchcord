# Twitchcord
A small NodeJS-powered webhook handler designed to receive a stream status notification from Twitch's API and convert it into a Discord webhook message payload

Originally developed to replace IFTTT as Twitch streamer Limealicious' live alert provider due to slow response times.

Relies on local JSON files storing essential data regarding target streams, in the following format:
```JSON
{
	"users": [{
		"user_name": "ExampleUser",
		"stream_message": "A message to be displayed when a new stream starts.",
		"game_message": "A message to be displayed when the stream changes game mid-stream.",
		"webhook_url": "The path to the Discord webhook endpoint, starting with /api/webhooks/...",
		"internal_id": "The internal ID of the streamer, obtained by observing the URL of their stream thumbnails. Often just their username in lowercase, but has sometimes been observed to be different."
	}]
}
```
Note that `"users"` is an array, allowing for expansion to function for multiple streamers.

Will also store information about the most recent stream for comparison to new alerts, again in JSON:
```JSON
{
	"users": [{
		"user_name": "ExampleUser",
		"timestamp": "YYYY-MM-DDTHH:MM:SS.000Z",
		"game": "The game being played as of the latest alert"
	}]
}
```
