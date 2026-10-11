const {Client, GatewayIntentBits} = require('discord.js');
const { app, chatEmitter } = require('../server.js');
const { discordToken, discordChannelId } = require('../config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
})

client.on('ready', async () => {
  console.log(`${client.user.tag} is online`);
});

// Listen for Twitch messages relayed from frontend
chatEmitter.on('twitch_message', async (data) => {
  const { username, message, platform, extra } = data;
  
  // Only relay Twitch messages to Discord (avoid loops)
  if (platform === 'twitch') {
    try {
      const channel = client.channels.cache.get(discordChannelId);
      if (channel) {
        // Format the message nicely for Discord
        let discordMessage = `**${username}**: ${message}`;
        
        await channel.send(discordMessage);
      }
    } catch (error) {
      console.error('Error sending Twitch message to Discord:', error);
    }
  }
});

let messages = [];
client.on('messageCreate', (message) => {
  if(message.author.bot) return;
  if (message.channel.id === discordChannelId) {
    if(!message.content) return;
    let msg = {
      message: message.content,
      user: message.author.tag,
      extra: {
        platform: 'discord'
      }
    };
    messages.push(msg);
    // console.log(`${message.author.tag}: ${message.content}`);
  }
});

app.get('/msg/discord', async (req, res) => {
  if (messages.length > 0) {
    res.json(messages);
    messages = [];
  } else {
    res.json([]);
  }
});

client.login(discordToken);