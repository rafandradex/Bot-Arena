const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getLeaderboard, saveLeaderboard, sendLog } = require('../utils/helpers'); // Importar as novas funções

module.exports = {
    data: new SlashCommandBuilder()
        .setName('result')
        .setDescription('Publishes tournament results and adds +1 win to the champion')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('game').setDescription('Game name (e.g., Brawlhalla)').setRequired(true))
        .addUserOption(o => o.setName('first_place').setDescription('1st Place Winner').setRequired(true))
        .addUserOption(o => o.setName('second_place').setDescription('2nd Place').setRequired(false))
        .addUserOption(o => o.setName('third_place').setDescription('3rd Place').setRequired(false))
        .addRoleOption(o => o.setName('champion_role').setDescription('Role for 1st Place').setRequired(false))
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post').addChannelTypes(ChannelType.GuildText).setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const game = interaction.options.getString('game');
        const first = interaction.options.getUser('first_place');
        const role = interaction.options.getRole('champion_role');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        // Construir o Embed
        const embed = new EmbedBuilder().setTitle(`🏆 ${game} Tournament - Results!`).setDescription('Congratulations to our top players:').setColor(0xffd700).addFields({ name: '🥇 1st Place', value: `<@${first.id}>`, inline: false });
        if (interaction.options.getUser('second_place')) embed.addFields({ name: '🥈 2nd Place', value: `<@${interaction.options.getUser('second_place').id}>`, inline: false });
        if (interaction.options.getUser('third_place')) embed.addFields({ name: '🥉 3rd Place', value: `<@${interaction.options.getUser('third_place').id}>`, inline: false });
        embed.setFooter({ text: 'Glitch Arena Hall of Fame', iconURL: interaction.guild.iconURL() }).setTimestamp();

        // Entregar o Cargo (se selecionado)
        if (role) {
            const member = await interaction.guild.members.fetch(first.id).catch(() => null);
            if (member) {
                await member.roles.add(role.id).catch(() => { });
                embed.addFields({ name: '👑 Title Awarded', value: `<@${first.id}> is the new ${role.name}!`, inline: false });
            }
        }

        // 👉 ADICIONAR +1 VITÓRIA AO LEADERBOARD
        const leaderboard = await getLeaderboard();
        const gameKey = game.toLowerCase().trim(); // Padronizar o nome do jogo

        if (!leaderboard[gameKey]) leaderboard[gameKey] = {}; // Cria a categoria se não existir
        leaderboard[gameKey][first.id] = (leaderboard[gameKey][first.id] || 0) + 1;

        await saveLeaderboard(leaderboard);

        // Mandar log (opcional, para a Staff ver)
        await sendLog(interaction.client, '📊 Leaderboard Updated', `**Winner:** <@${first.id}>\n**Game:** ${game}\n**Total Wins:** ${leaderboard[gameKey][first.id]}`, 0x57f287);

        await channel.send({ embeds: [embed] });
        await interaction.editReply({ content: `✅ Results published and Leaderboard updated!` });
    }
};