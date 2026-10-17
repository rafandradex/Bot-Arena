const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const { LeaderboardModel } = require('../utils/models');

const {
  buildLeaderboardEmbed,
  refreshLeaderboardMessage
} = require('../utils/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Staff: publishes the automatic tournament leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('Select the game')
        .setRequired(true)
        .addChoices(
          { name: 'Brawlhalla', value: 'brawlhalla' },
          { name: 'Valorant', value: 'valorant' },
          { name: 'CS2', value: 'cs2' }
        )
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where the leaderboard will be published')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    const member = await interaction.guild.members.fetch(
      interaction.user.id
    );

    const isStaff =
      Boolean(process.env.STAFF_ROLE_ID) &&
      member.roles.cache.has(process.env.STAFF_ROLE_ID);

    const canManageMessages = member.permissions.has(
      PermissionFlagsBits.ManageMessages
    );

    if (!isStaff && !canManageMessages) {
      return interaction.editReply({
        content: '❌ Only staff can publish the leaderboard.'
      });
    }

    const game = interaction.options
      .getString('game')
      .trim()
      .toLowerCase();

    if (!game) {
      return interaction.editReply({
        content: '❌ Enter a game name.'
      });
    }

    const channel =
      interaction.options.getChannel('channel') ||
      interaction.channel;

    if (
      !channel ||
      ![
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement
      ].includes(channel.type)
    ) {
      return interaction.editReply({
        content: '❌ Select a text or announcement channel.'
      });
    }

    const botMember = await interaction.guild.members.fetchMe();
    const permissions = channel.permissionsFor(botMember);

    if (!permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory
    ])) {
      return interaction.editReply({
        content:
          '❌ The bot needs View Channel, Send Messages, Embed Links and Read Message History permissions.'
      });
    }

    const board = await LeaderboardModel.findOne({ game });

    // Envia uma mensagem normal e permanente no canal.
    const message = await channel.send({
      embeds: [
        buildLeaderboardEmbed(
          board || {
            game,
            players: new Map(),
            playerNames: new Map()
          },
          interaction.guild
        )
      ],
      allowedMentions: {
        parse: []
      }
    });

    const filter = { game };

    const update = {
      $set: {
        leaderboardChannelId: channel.id,
        leaderboardMessageId: message.id
      }
    };

    try {
      try {
        await LeaderboardModel.findOneAndUpdate(
          filter,
          update,
          { upsert: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;

        const saved = await LeaderboardModel.findOneAndUpdate(
          filter,
          update
        );

        if (!saved) throw error;
      }
    } catch (error) {
      console.error('Error saving leaderboard panel:', error);

      await message.delete().catch(() => { });

      return interaction.editReply({
        content:
          '❌ Could not configure the automatic leaderboard. Check the database connection.'
      });
    }

    let warning = '';

    try {
      await refreshLeaderboardMessage(
        interaction.client,
        game
      );
    } catch (error) {
      console.error('Error refreshing leaderboard:', error);

      warning =
        '\n⚠️ The initial refresh failed. Check the bot channel permissions.';
    }

    // Desativa visualmente o painel anterior, se existir.
    if (
      board?.leaderboardChannelId &&
      board?.leaderboardMessageId
    ) {
      try {
        const oldChannel = await interaction.guild.channels.fetch(
          board.leaderboardChannelId
        );

        if (oldChannel?.messages) {
          const oldMessage = await oldChannel.messages.fetch(
            board.leaderboardMessageId
          );

          await oldMessage.edit({
            content:
              `📌 This leaderboard has moved: ${message.url}`,
            embeds: [],
            allowedMentions: {
              parse: []
            }
          });
        }
      } catch (error) {
        console.error(
          'Could not update the previous leaderboard panel:',
          error
        );

        warning +=
          '\n⚠️ The previous panel could not be marked as replaced. Remove it manually if needed.';
      }
    }

    return interaction.editReply({
      content:
        `✅ Leaderboard published in ${channel}!\n` +
        'It will update automatically after new /result entries.' +
        warning
    });
  }
};