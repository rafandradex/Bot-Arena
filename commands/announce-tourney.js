const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce-tourney')
        .setDescription('Automatically fetches and announces a Challengermode tournament')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The Challengermode tournament ID (e.g., 8e1ae7b7...)')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to publish the tournament announcement')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const tournamentId = interaction.options.getString('id');
        const channel = interaction.options.getChannel('channel');

        try {
            // 1. Obter Token
            const authResponse = await fetch('https://publicapi.challengermode.com/mk1/v1/auth/access_keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshKey: process.env.CHALLENGERMODE_REFRESH_KEY })
            });

            if (!authResponse.ok) throw new Error('Failed to generate access token.');
            const authData = await authResponse.json();
            const accessToken = authData.value;

            // 2. Obter Informação do Torneio
            const tourneyResponse = await fetch(`https://publicapi.challengermode.com/mk1/v1/tournaments/${tournamentId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!tourneyResponse.ok) throw new Error('Tournament not found or access denied.');
            const tourney = await tourneyResponse.json();

            // 3. Mapear as propriedades corretas reveladas pelo teu JSON
            const dateUnix = tourney.scheduledStartTime
                ? Math.floor(new Date(tourney.scheduledStartTime).getTime() / 1000)
                : Math.floor(Date.now() / 1000);

            const gameStr = tourney.gameTitle || 'TBA';
            const prizeStr = tourney.customPrizeText || 'Check the page';

            // Usa a imagem maior fornecida pela API, ou um link de fallback
            const imageUrl = tourney.logoImage?.xlarge?.url || 'https://i.imgur.com/your_default_image_link.jpg';

            // 4. Construir o Embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${tourney.name || 'New Tournament - Glitch Arena'}`)
                .setURL(`https://www.challengermode.com/s/GlitchArena/tournaments/${tournamentId}`)
                .setDescription('Registration for our next tournament is now open! Click the title above to access the official page.')
                .setColor(0x5865f2)
                .addFields(
                    { name: '🎮 Game', value: gameStr, inline: true },
                    { name: '💰 Prize Pool', value: prizeStr, inline: true },
                    { name: '📅 Start Date', value: `<t:${dateUnix}:F>\n(<t:${dateUnix}:R>)`, inline: false }
                )
                .setThumbnail(imageUrl)
                .setFooter({ text: 'Glitch Arena Esports', iconURL: interaction.guild.iconURL() });

            // 5. Enviar o Anúncio
            await channel.send({ embeds: [embed] });
            await interaction.editReply({ content: `✅ Tournament announced successfully in ${channel}!` });

        } catch (error) {
            console.error('Challengermode API Error:', error);
            await interaction.editReply({ content: `❌ API Error: ${error.message}` });
        }
    }
};