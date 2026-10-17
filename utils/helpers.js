const { EmbedBuilder } = require('discord.js');

const {
  SuggMetaModel,
  LeaderboardModel
} = require('./models');

module.exports = {
  // Ler os dados da mensagem de instruções das sugestões.
  getSuggMeta: async () => {
    const meta = await SuggMetaModel.findOne({
      id: 'main'
    });

    return {
      lastPromptId: meta?.lastPromptId || null
    };
  },

  // Guardar a mensagem de instruções das sugestões.
  saveSuggMeta: async (meta) => {
    await SuggMetaModel.findOneAndUpdate(
      { id: 'main' },
      {
        $set: {
          lastPromptId: meta.lastPromptId
        }
      },
      { upsert: true }
    );
  },

  // Ler os rankings para o comando /leaderboard.
  // As vitórias são atualizadas diretamente pelo novo /result.
  getLeaderboard: async () => {
    const boards = await LeaderboardModel.find();
    const leaderboard = Object.create(null);

    for (const board of boards) {
      leaderboard[board.game] = board.players
        ? Object.fromEntries(board.players)
        : {};
    }

    return leaderboard;
  },

  // Enviar registos para o canal configurado.
  sendLog: async (
    client,
    title,
    description,
    color = 0x2b2d31
  ) => {
    const channelId = process.env.LOGS_CHANNEL_ID;

    if (!channelId) return;

    try {
      const channel = await client.channels
        .fetch(channelId)
        .catch(() => null);

      if (
        !channel ||
        !channel.isTextBased() ||
        typeof channel.send !== 'function'
      ) {
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

      await channel.send({
        embeds: [embed],
        allowedMentions: {
          parse: []
        }
      });
    } catch (error) {
      console.error('Failed to send log:', error);
    }
  }
};