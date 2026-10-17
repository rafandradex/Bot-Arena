const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('Sends the role selection panel (Staff Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      // Define a cor da barra lateral esquerda (na imagem é um tom de roxo)
      .setColor('#9b59b6')

      // Topo do painel (como o "Wolfoxy e-sports" na imagem)
      .setAuthor({
        name: 'Glitch Arena', // Podes mudar para o nome do teu servidor
        iconURL: interaction.guild.iconURL()
      })

      // Título principal traduzido
      .setTitle('Choose your game or genre to see the channels')

      // Descrição traduzida e formatada com o losango azul
      .setDescription(
        // "🔹 ⚔️ **League of Legends**\n\n" +
        // "🔹 ♟️ **TFT**\n\n" +
        // "🔹 🃏 **LOR**\n\n" +
        "🔹 🔫 **Valorant**\n\n" +
        "🔹 ⚔️ **Brawlhalla**\n\n"
        // "🔹 🏰 **Throne and Liberty**\n\n" +
        // "🔹 🧛 **V Rising**\n\n" +
        // "🔹 🎭 **Soulmask**\n\n" 
        // +"👉 **Note:** If you can't see the emojis to click, go to: *User Settings > Text & Images > (enable) Show emoji reactions on messages*\n" +
        // "👉 **Note 2:** If the problem persists, try leaving our server and joining again. If it still persists, contact one of our admins."
      )

    // Imagem pequena no canto superior direito (substitui o link)
    // .setThumbnail('LINK_DA_IMAGEM_DO_BLITZCRANK_AQUI')

    // Imagem grande no meio (substitui o link)
    // .setImage('LINK_DA_IMAGEM_DO_YASUO_AQUI');

    // Envia o painel para o canal
    const message = await interaction.channel.send({ embeds: [embed] });

    // Responde a quem usou o comando (mensagem invisível para os outros)
    await interaction.reply({ content: '✅ Role panel sent successfully!', flags: MessageFlags.Ephemeral });

    // Adiciona as reações à mensagem
    try {
      // await message.react('♟️');
      // await message.react('🃏');
      await message.react('🔫');
      await message.react('⚔️');
      // await message.react('📱');
      // await message.react('🏰');
      // await message.react('🧛');
      // await message.react('🎭');
    } catch (error) {
      console.error('Failed to add a reaction:', error);
    }
  }
};