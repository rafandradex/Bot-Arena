const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Sends a formal announcement formatted in an embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('title').setDescription('Announcement title').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Announcement content').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to publish').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const embed = new EmbedBuilder()
      .setTitle(`📢 ${interaction.options.getString('title')}`)
      .setDescription(interaction.options.getString('message'))
      .setColor(0x5865f2).setTimestamp().setFooter({ text: `Announcement by ${interaction.user.tag}`, iconURL: interaction.guild.iconURL() });
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Announcement published in ${channel}!`, flags: MessageFlags.Ephemeral });
  }
};