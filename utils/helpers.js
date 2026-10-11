const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EventModel, SuggMetaModel, LeaderboardModel } = require('./models'); // Importar o MongoDB

module.exports = {
  // Ler Eventos da Nuvem
  getEvents: async () => {
    try {
      const eventsList = await EventModel.find();
      const eventsObj = {};
      eventsList.forEach(ev => {
        eventsObj[ev.messageId] = {
          title: ev.title, description: ev.description, location: ev.location,
          timestamp: ev.timestamp, authorId: ev.authorId, authorTag: ev.authorTag,
          channelId: ev.channelId, going: ev.going, maybe: ev.maybe, no: ev.no, cancelled: ev.cancelled
        };
      });
      return eventsObj;
    } catch (err) { console.error(err); return {}; }
  },

  // Gravar Eventos na Nuvem
  saveEvents: async (eventsObj) => {
    for (const [messageId, ev] of Object.entries(eventsObj)) {
      await EventModel.findOneAndUpdate(
        { messageId },
        { messageId, ...ev },
        { upsert: true, new: true } // Upsert: Atualiza se existir, Cria se for novo
      );
    }
  },
  
  getSuggMeta: async () => {
    const meta = await SuggMetaModel.findOne({ id: 'main' });
    return meta ? { lastPromptId: meta.lastPromptId } : { lastPromptId: null };
  },

  saveSuggMeta: async (meta) => {
    await SuggMetaModel.findOneAndUpdate(
      { id: 'main' },
      { lastPromptId: meta.lastPromptId },
      { upsert: true }
    );
  },

  getLeaderboard: async () => {
    const boards = await LeaderboardModel.find();
    const ldbObj = {};
    boards.forEach(b => {
      // Converte o Map do Mongoose num Objeto normal do JS
      ldbObj[b.game] = b.players ? Object.fromEntries(b.players) : {};
    });
    return ldbObj;
  },

  saveLeaderboard: async (ldbObj) => {
    for (const [game, players] of Object.entries(ldbObj)) {
      await LeaderboardModel.findOneAndUpdate(
        { game },
        { game, players },
        { upsert: true }
      );
    }
  },

  // AS CONSTRUÇÕES VISUAIS CONTINUAM INTATAS
  buildEventEmbed: (ev) => {
    const list = (arr) => (arr.length ? arr.map((id) => `<@${id}>`).join('\n') : '—');
    return new EmbedBuilder()
      .setTitle(`📅 ${ev.title}`)
      .setDescription(ev.description || 'No description provided.')
      .setColor(ev.cancelled ? 0x808080 : 0x5865f2)
      .addFields(
        { name: '🕒 Date & Time', value: `<t:${ev.timestamp}:F>\n(<t:${ev.timestamp}:R>)` },
        { name: '📍 Location', value: ev.location || 'Not defined' },
        { name: `✅ Going (${ev.going.length})`, value: list(ev.going), inline: true },
        { name: `❔ Maybe (${ev.maybe.length})`, value: list(ev.maybe), inline: true },
        { name: `❌ Not Going (${ev.no.length})`, value: list(ev.no), inline: true }
      )
      .setFooter({ text: ev.cancelled ? 'EVENT CANCELLED' : `Organized by ${ev.authorTag}` });
  },

  eventButtons: (disabled = false) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ev_going').setLabel('Going').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('ev_maybe').setLabel('Maybe').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('ev_no').setLabel('Not Going').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  ),

  sendLog: async (client, title, description, color = 0x2b2d31) => {
    const channelId = process.env.LOGS_CHANNEL_ID;
    if (!channelId) return;
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;
      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('Failed to send log:', err);
    }
  }
};