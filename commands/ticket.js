const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('panel').setDescription('Sends the ticket panel')),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🎫 Support')
      .setDescription('Need help? Select a category from the menu below to open a private ticket with the staff team.')
      .setColor(0x57f287);

    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select the ticket subject...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('General').setDescription('General questions').setValue('general').setEmoji('💬'),
        new StringSelectMenuOptionBuilder().setLabel('Partnership').setDescription('Partnership proposals').setValue('partnership').setEmoji('🤝'),
        new StringSelectMenuOptionBuilder().setLabel('Report').setDescription('Report a member').setValue('report').setEmoji('⚠️')
      );

    await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    await interaction.reply({ content: '✅ Panel sent.', flags: MessageFlags.Ephemeral });
  }
};