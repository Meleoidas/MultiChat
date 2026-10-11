export default function emotesToImages(message, platform, messageEmotes) {
  let msg = message;
  if (platform === 'discord') {
    const staticEmoji = /<:(\w+):(\d+)>/g;
    const animatedEmoji = /<a:(\w+):(\d+)>/g;
    
    msg = msg.replace(staticEmoji, (match, name, id) => {
      return `<img src="https://cdn.discordapp.com/emojis/${id}.webp" alt="${name}" class="image discord-emoji" style="vertical-align:middle; margin: 0; padding: 0;">`;
    });

    msg = msg.replace(animatedEmoji, (match, name, id) => {
      return `<img src="https://cdn.discordapp.com/emojis/${id}.gif" alt="${name}" class="image discord-emoji" style="vertical-align:middle; margin: 0; padding: 0;">`;
    });

  } else {
    if (!messageEmotes) return message;

    let emoteReplacements = [];
    for (const [emoteId, positions] of Object.entries(messageEmotes)) {
      positions.forEach(pos => {
        const [start, end] = pos.split('-').map(Number);
        emoteReplacements.push({
          start,
          end,
          emoteId
        });
      });
    }

    emoteReplacements.sort((a, b) => b.start - a.start);
    emoteReplacements.forEach(({ start, end, emoteId }) => {
      const emoteText = msg.substring(start, end + 1);
      const emoteImg = `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0" alt="${emoteText}" class="image" style="vertical-align:middle;">`;
      msg = msg.slice(0, start) + emoteImg + msg.slice(end + 1);
    }); 
  }
  return msg;
}