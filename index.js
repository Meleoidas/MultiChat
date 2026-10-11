import emotesToImages from '/utils/emotesToImages.js';
import darkenColor from '/utils/darkenColor.js';

let clientId;
let accessToken;
let refreshToken = localStorage.getItem('twitch_refresh_token');

let badges = [];
let messages = [];
let userColors = new Map();
let chat = document.querySelector('#chat');

async function fetchBadges(token) {
  const response = await fetch('https://api.twitch.tv/helix/chat/badges/global', {
    headers: {
      'Client-ID': clientId,
      'Authorization': 'Bearer ' + token,
    }
  });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.data)) {
    console.error('Failed to fetch Twitch global badges:', data);
    return;
  }

  badges = data.data;
}

async function refreshAccessToken() {
  const response = await fetch('http://localhost:8082/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  const data = await response.json();
  if (!response.ok || typeof data.accessToken !== 'string' || !data.accessToken) {
    throw new Error(data.error || `Twitch token refresh failed (${response.status})`);
  }
  if (!Number.isFinite(data.expiresIn) || data.expiresIn <= 60) {
    throw new Error('Twitch returned an invalid access token expiration');
  }

  accessToken = data.accessToken;
  refreshToken = data.refreshToken || refreshToken;
  localStorage.setItem('twitch_refresh_token', refreshToken);

  const serverResponse = await fetch('http://localhost:8082/access-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({accessToken})
  });
  if (!serverResponse.ok) {
    throw new Error(`Could not update the chat server with the access token (${serverResponse.status})`);
  }

  setTimeout(() => {
    refreshAccessToken().catch(error => {
      console.error('Unable to refresh Twitch access token:', error);
    });
  }, (data.expiresIn - 60) * 1000);

  await fetchBadges(accessToken);
}

async function initializeTwitch() {
  const response = await fetch('http://localhost:8082/public-config');
  if (!response.ok) {
    throw new Error(`Could not load public configuration (${response.status})`);
  }

  const config = await response.json();
  if (typeof config.broadcasterUsername !== 'string' || !config.broadcasterUsername) {
    throw new Error('No Twitch channel name is configured');
  }
  if (typeof config.clientId !== 'string' || !config.clientId) {
    throw new Error('No Twitch client ID is configured');
  }

  clientId = config.clientId;
  initializeComfyJS(config.broadcasterUsername);
  refreshAccessToken().catch(error => {
    console.error('Unable to refresh Twitch access token:', error);
  });
}

async function addNewMessage({message, user, extra}) {
  let color;
  color = extra.platform === 'discord' ? '#5165f6' : (extra.userColor || '#8A2BE2');
  
  userColors.set(user, color);

  // Relay Twitch messages to Discord (but not Discord messages back to Discord)
  if (extra.platform !== 'discord') {
    try {
      await fetch('http://localhost:8082/relay-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user,
          message: message,
          platform: 'twitch',
          extra: extra
        })
      });
    } catch (error) {
      console.error('Error relaying message to Discord:', error);
    }
  }

  const newMessage = document.createElement('div');
  newMessage.classList.add('message');
  let newMessageContent = '';
  let contentHtml;

  if(extra.platform === 'discord') {
    const badgeLink = 'https://logos-world.net/wp-content/uploads/2020/12/Discord-Logo.png';
    newMessageContent = newMessageContent + `<img src="${badgeLink}" class="image">`;

    contentHtml = emotesToImages(message, 'discord');
  } else {
    if (extra.userBadges && typeof extra.userBadges === 'object') {
      for (const [badgeName, version] of Object.entries(extra.userBadges)) {
        const badgeObject = badges.find(b => b.set_id === badgeName);
        const badgeVersion = badgeObject?.versions?.find(b => b.id === version);
        if (badgeVersion?.image_url_4x) {
          newMessageContent += `<img src="${badgeVersion.image_url_4x}" class="image">`;
        }
      }
    };
    contentHtml = emotesToImages(message, 'twitch', extra.messageEmotes);
  }


  const glowColor = darkenColor(color, 40);
  newMessageContent += `
    <div style="color: ${color}; text-shadow: 0 0 2px ${glowColor}, 0 0 4px ${glowColor}, 0 0 6px ${glowColor}, 0 0 8px ${glowColor}, 0 0 10px ${glowColor}, 0 0 12px ${glowColor}, 0 0 14px ${glowColor};" class="username"></div>
    <div class="content"></div>
  `
  newMessage.innerHTML = newMessageContent;
  newMessage.querySelector('.username').innerText = user;
  
  // Safely handle content with emotes
  const contentDiv = newMessage.querySelector('.content');
  if (contentHtml.includes('<img')) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentHtml;
    
    for (const child of tempDiv.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        contentDiv.appendChild(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'IMG') {
        const img = document.createElement('img');
        img.src = child.src;
        img.alt = child.alt || '';
        img.className = child.className || '';
        contentDiv.appendChild(img);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // Shame the injection attempt by displaying it as plain text
        contentDiv.appendChild(document.createTextNode(child.outerHTML));
      }
    }
  } else {
    contentDiv.innerText = contentHtml;
  }
  
  if (extra.isEmoteOnly) {
    newMessage.querySelectorAll('.content img').forEach(img => {
      img.style.setProperty('transform', 'scale(2)', "important");
    });
  }

  messages.push(newMessage);
  if(messages.length > 10) {
    const oldMessage = messages.shift();
    oldMessage.remove();
  }

  chat.append(newMessage);
}
function initializeComfyJS(channel) {
  if (typeof ComfyJS === 'undefined') {
    console.error('ComfyJS did not load; Twitch chat cannot connect');
    return;
  }

  ComfyJS.onConnected = (address, port, isFirstConnect) => {
    console.info(`ComfyJS connected to ${channel} (${address}:${port})`);
  };
  ComfyJS.onError = (...details) => {
    console.error('ComfyJS connection error:', ...details);
  };
  ComfyJS.onChat = (user, message, flags, self, extra) => {
    console.log(user, message, flags, self, extra);
    addNewMessage({message, user, extra});
  };

  console.info(`Starting ComfyJS for Twitch channel "${channel}"`);
  ComfyJS.Init(channel);
}

initializeTwitch().catch(error => {
  console.error('Unable to initialize Twitch integration:', error);
});

let followers = new Set();
setInterval(async () => {
  const response = await fetch('http://localhost:8082/new-follower');
  const data = await response.json();
  console.log(data);
  for (const username of data.followers) {
    if (username && !followers.has(username)) {
      followers.add(username);
      alertNewFollower(username);
    }
  }
}, 3000);

function alertNewFollower(username) {
  const newMessage = document.createElement('div');
  newMessage.classList.add('follow');
  const userColor = userColors.get(username) || '#8A2BE2';
  const newMessageContent = `
    <div class="outer">
      <div class="inner">
        <div style="color: ${userColor};" class="follower">${username}</div>
        <div class="follower-extra">ty for following !<span style="font-style: italic;">!</span></div>
      </div>
    </div>
  `

  newMessage.innerHTML = newMessageContent;
  messages.push(newMessage);
  if(messages.length > 10) {
    const oldMessage = messages.shift();
    oldMessage.remove();
  }
  chat.append(newMessage);
}

setInterval(async () => {
  const response = await fetch('http://localhost:8082/new-sub');
  const data = await response.json();
  for (const [username, tier] of data.subs) {
    if (username) {
      alertNewSub(username, tier);
    }
  }
}, 3000);

function alertNewSub(username, tier) {
  const newMessage = document.createElement('div');
  newMessage.classList.add('follow');
  newMessage.classList.add('sub');

  const newMessageContent = `
    <div class="outer">
        <div class="inner">
          <div style="color: rgb(255,232,208); text-shadow: 0 0 2px #998b7d, 0 0 4px #998b7d, 0 0 6px #998b7d, 0 0 8px #998b7d, 0 0 10px #998b7d, 0 0 12px #998b7d, 0 0 14px #998b7d;" class="follower">${username}<br></div>
          <div class="follower-extra sub-tier"><span style="text-decoration:underline">TI</span>ER ${tier}</div>
          <div class="follower-extra">ty for the sub !<span style="font-style: italic;">!</span></div>
        </div>
      </div>
  `

  newMessage.innerHTML = newMessageContent;
  messages.push(newMessage);
  if(messages.length > 10) {
    const oldMessage = messages.shift();
    oldMessage.remove();
  }
  chat.append(newMessage);
}

setInterval(async () => {
  try {
    const response = await fetch('http://localhost:8082/msg/discord');
    const data = await response.json();
    if(data.length === 0) return;
    for (const msg of data) {
      addNewMessage(msg);
    }
  } catch (error) {
    console.error('Error fetching Discord messages:', error);
  }
}, 1000); 