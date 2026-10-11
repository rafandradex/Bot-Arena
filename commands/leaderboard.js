const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getLeaderboard } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Shows the Top 10 players for a specific game')
    .addStringOption(o => o.setName('game').setDescription('Game name (e.g., Brawlhalla)').setRequired(true)),
    
  async execute(interaction) {
    await interaction.deferReply(); 
    
    const game = interaction.options.getString('game');
    const gameKey = game.toLowerCase().trim();
    
    const leaderboard = await getLeaderboard();
    const gameData = leaderboard[gameKey];

    // Se ainda não houver vitórias registadas para este jogo
    if (!gameData || Object.keys(gameData).length === 0) {
      return interaction.editReply({ content: `❌ No tournament records found for **${game}** yet.` });
    }

    // Organizar jogadores pelo número de vitórias (do maior para o menor) e pegar no Top 10
    const topPlayers = Object.entries(gameData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${game} - Leaderboard Top 10`)
      .setDescription('Who reigns supreme in the Glitch Arena?\n\n')
      .setColor(0xffd700)
      .setThumbnail(interaction.guild.iconURL())
      .setTimestamp();

    let description = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    // Gerar a lista formatada
    for (let i = 0; i < topPlayers.length; i++) {
      const [userId, wins] = topPlayers[i];
      const medal = medals[i] || `**#${i + 1}**`;
      const winText = wins === 1 ? 'Win' : 'Wins';
      description += `${medal} <@${userId}> — **${wins}** ${winText}\n`;
    }

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  }
};