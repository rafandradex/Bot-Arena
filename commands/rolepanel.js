const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('Envia o painel de cargos com menu dropdown (Apenas Staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Escolhe os teus Jogos!')
      .setDescription('Seleciona os jogos que jogas no menu abaixo para receberes os cargos e seres notificado de torneios e eventos!')
      .setColor(0x5865f2)
      .setFooter({ text: 'Glitch Arena', iconURL: interaction.guild.iconURL() });

    const select = new StringSelectMenuBuilder()
      .setCustomId('role_select')
      .setPlaceholder('Clica aqui para escolher...')
      .setMinValues(0) // Permite remover todos os cargos
      .setMaxValues(2) // O número máximo de jogos disponíveis (muda se adicionares mais)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Valorant')
          .setValue('valorant')
          .setEmoji('🔫'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Brawlhalla')
          .setValue('brawlhalla')
          .setEmoji('⚔️'),
        // new StringSelectMenuOptionBuilder()
        //   .setLabel('Counter-Strike 2')
        //   .setValue('cs2')
        //   .setEmoji('💣')
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Painel de cargos (Dropdown) enviado com sucesso!', flags: MessageFlags.Ephemeral });
  }
};