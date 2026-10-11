# Twitch + Discord Chat Overlay

A somewhat sketchy (and sometimes broken) self-hosted chat overlay that merges Twitch and Discord, built entirely from scratch using JavaScript, ComfyJs, Node.js.

### Main Features include:
- a Discord + Twitch chat overlay
- Twitch badge and emote rendering, Discord emoji rendering
- follow and subscription alerts
- Twitch messages relayed to a Discord channel
- newest follower widget and a follower-goal widget

## `config.json` Content:
   ```json
   {
     "refreshToken": "TWITCH_REFRESH_TOKEN",
     "clientId": "TWITCH_CLIENT_ID",
     "clientSecret": "TWITCH_CLIENT_SECRET",
     "broadcasterUsername": "TWITCH_CHANNEL",
     "broadcasterId": "TWITCH_USER_ID",
     "discordToken": "DISCORD_BOT_TOKEN",
     "discordChannelId": "DISCORD_CHANNEL_ID"
   }
   ```

@Claude generate HTTP endpoint descriptions
## HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/public-config` | Returns the public Twitch client ID and channel username. |
| `POST` | `/refresh-token` | Exchanges a refresh token for a Twitch access token. The request body is `{ "refreshToken": "..." }`; an omitted token falls back to the configured initial refresh token. |
| `POST` | `/access-token` | Gives the server an access token so it can register EventSub subscriptions and fetch follower count. |
| `GET` | `/new-follower` | Returns queued follower usernames and clears the queue. |
| `GET` | `/new-sub` | Returns queued subscriptions and clears the queue. |
| `GET` | `/newest-follower` | Returns the latest follower username, then clears it; returns an empty response if none is queued. |
| `GET` | `/follower-goal` | Returns the current follower count, or an empty response if it cannot be retrieved. |
| `POST` | `/relay-message` | Emits a chat message for the Discord bot to relay. |
| `GET` | `/msg/discord` | Returns Discord messages queued for the overlay and clears the queue. |