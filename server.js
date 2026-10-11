const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const EventEmitter = require('events');
const {
  clientId,
  clientSecret,
  broadcasterId,
  broadcasterUsername,
  refreshToken: initialRefreshToken
} = require('./config.json');

const app = express();
const PORT = 8082;
const chatEmitter = new EventEmitter();

app.use(express.json());
app.use((req, res, next) => {
  if (req.path === '/config.json') {
    return res.sendStatus(404);
  }
  next();
});
app.use(express.static(__dirname));
app.use(cors());

module.exports = { app, chatEmitter };

require('./discord/login.js')

app.get('/public-config', (req, res) => {
  res.json({ clientId, broadcasterUsername });
});

let sessionId;
let accessToken;
let newFollowers = [];
let newestFollower = null;
let newSubs = [];
let followers;

let ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=600');
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log(msg);
  if (msg.metadata.message_type === 'session_reconnect') {
    const newWs = new WebSocket(msg.payload.reconnect_url)
    newWs.on('message', (newData) => {
      const newMsg = JSON.parse(newData);
      if(newMsg.metadata.message_type === 'session_welcome') {
        ws.close();
        ws = newWs;
      }
    });
  }
  if (msg.payload && msg.payload.session && msg.payload.session.id) {
    sessionId = msg.payload.session.id;
  }

  if (
    msg.metadata.message_type === 'notification' &&
    msg.payload.subscription.type === 'channel.follow'
  ) {
    console.log(data.toString('utf8'));
    const event = msg.payload.event;
    console.log(`New follower: ${event.user_name} (${event.user_id})`);
    newFollowers.push(event.user_name);
    newestFollower = event.user_name;
  }

  if (
    msg.metadata.message_type === 'notification' &&
    msg.payload.subscription.type === 'channel.subscribe'
  ) {
    console.log(data.toString('utf8'));
    const event = msg.payload.event;
    console.log(`New sub: ${event.user_name} (${event.user_id})`);
    newSubs.push([event.user_name, event.tier]);
  }

  console.log(msg);
});

async function subscribeToFollowers() {
  const headerParams = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + accessToken,
    'Client-Id': clientId
  };

  const bodyParams = {
    type: "channel.follow",
    version: "2",
    condition: {
      broadcaster_user_id: broadcasterId,
      moderator_user_id: broadcasterId
    },
    transport: {
      method: "websocket",
      session_id: sessionId
    }
  };

  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: headerParams,
    body: JSON.stringify(bodyParams)
  });
  const data = await response.json();
  console.log('EventSub subscription response:', data);
  return data;
}


async function subscribeToSubs() {
  const headerParams = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + accessToken,
    'Client-Id': clientId
  };

  const bodyParams = {
    type: "channel.subscribe",
    version: "1",
    condition: {
      broadcaster_user_id: broadcasterId,
    },
    transport: {
      method: "websocket",
      session_id: sessionId
    }
  };

  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: headerParams,
    body: JSON.stringify(bodyParams)
  });
  const data = await response.json();
  console.log('EventSub subscription response:', data);
  return data;
}

async function getFollowerCount() {
  if (!accessToken) {
    console.log('No access token available');
    return null;
  }

  const headerParams = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + accessToken,
    'Client-Id': clientId
  };

  try {
    const response = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}`, {
      method: 'GET',
      headers: headerParams
    });
    const data = await response.json();
    if (data.total !== undefined) {
      followers = Number(data.total);
      console.log('Current follower count:', followers);
      return followers;
    } else {
      console.log('Failed to get follower count:', data);
      return null;
    }
  } catch (error) {
    console.error('Error fetching follower count:', error);
    return null;
  }
}

// ============================= //
app.get('/new-follower', (req, res) => {
  res.json({ followers: newFollowers });
  newFollowers = [];
});

// Relay Twitch messages to Discord
app.post('/relay-message', (req, res) => {
  const { username, message, platform, extra } = req.body;
  
  // Emit event for Discord bot to pick up
  chatEmitter.emit('twitch_message', {
    username,
    message,
    platform: platform || 'twitch',
    extra
  });
  
  res.json({ success: true });
});

app.post('/access-token', async (req, res) => {
  if (typeof req.body.accessToken !== 'string' || !req.body.accessToken) {
    return res.status(400).json({ error: 'A valid access token is required' });
  }

  accessToken = req.body.accessToken;
  await subscribeToFollowers();
  await subscribeToSubs();
  await getFollowerCount(); // Get initial follower count
  res.json({ success: true });
});

app.post('/refresh-token', async (req, res) => {
  const refreshToken = req.body.refreshToken || initialRefreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({ error: 'A refresh token is required' });
  }

  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    const data = await response.json();

    if (!response.ok || typeof data.access_token !== 'string') {
      console.error('Twitch token refresh failed:', data);
      return res.status(401).json({
        error: data.message || data.error_description || data.error || 'Twitch rejected the refresh token'
      });
    }

    res.json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in
    });
  } catch (error) {
    console.error('Error refreshing Twitch token:', error);
    res.status(502).json({ error: 'Unable to contact Twitch token service' });
  }
});

app.get('/new-sub', async (req, res) => {
  res.json({subs: newSubs});
  newSubs = [];
});

app.get('/newest-follower', async (req, res) => {
  if(newestFollower) {
    res.send(newestFollower);
    newestFollower = null;
  } else {
    res.send('');
  }
})

app.get('/follower-goal', async (req, res) => {
  const count = await getFollowerCount();
  if (Number.isInteger(count)) {
    res.send(count);
  } else {
    res.send('');
  }
}) 

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});