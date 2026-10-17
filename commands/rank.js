const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { XpModel } = require('../utils/models');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your current Level and XP')
    .addUserOption(o => o.setName('user').setDescription('Select a user to check their rank').setRequired(false)),

  async execute(interaction) {
    // 👉 VERIFICAÇÃO DE CANAL ESPECÍFICO
    if (process.env.BOT_COMMANDS_CHANNEL_ID && interaction.channelId !== process.env.BOT_COMMANDS_CHANNEL_ID) {
      return interaction.reply({
        content: `❌ You can only use the \`/rank\` command in <#${process.env.BOT_COMMANDS_CHANNEL_ID}>!`,
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply();

    const target = interaction.options.getUser('user') || interaction.user;

    if (target.bot) {
      return interaction.editReply({ content: '❌ Bots do not earn XP.' });
    }

    try {
      const userXp = await XpModel.findOne({ userId: target.id });

      if (!userXp || userXp.xp === 0) {
        return interaction.editReply({ content: `❌ **${target.username}** hasn't earned any XP yet. Start chatting!` });
      }

      const currentLevel = userXp.level;
      const currentXp = userXp.xp;

      // Cálculo para saber quanto XP falta para o próximo nível
      const nextLevelXp = Math.pow((currentLevel + 1) / 0.1, 2);

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Rank - ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(0x5865f2)
        .addFields(
          { name: 'Level', value: `**${currentLevel}**`, inline: true },
          { name: 'XP', value: `**${currentXp}** / ${Math.floor(nextLevelXp)}`, inline: true }
        )
        .setFooter({ text: 'Glitch Arena XP System', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error fetching rank:', err);
      await interaction.editReply({ content: '❌ Failed to fetch rank data.' });
    }
  }
};