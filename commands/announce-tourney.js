const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

function truncate(value, maxLength) {
    const text = String(value);

    return text.length > maxLength
        ? `${text.slice(0, maxLength - 1)}…`
        : text;
}

function validImageUrl(value) {
    if (typeof value !== 'string') return null;

    try {
        const url = new URL(value);

        return url.protocol === 'https:'
            ? url.href
            : null;
    } catch {
        return null;
    }
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        // Não inclui tokens nem o conteúdo da resposta no erro.
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce-tourney')
        .setDescription('Fetches and announces a Challengermode tournament')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('Challengermode tournament ID, not the full link')
                .setMaxLength(36)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel where the announcement will be published')
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        if (!interaction.inGuild()) {
            return interaction.editReply({
                content: '❌ This command can only be used in a server.'
            });
        }

        const member = await interaction.guild.members.fetch(
            interaction.user.id
        );

        const isStaff =
            Boolean(process.env.STAFF_ROLE_ID) &&
            member.roles.cache.has(process.env.STAFF_ROLE_ID);

        const canManageChannels = member.permissions.has(
            PermissionFlagsBits.ManageChannels
        );

        if (!isStaff && !canManageChannels) {
            return interaction.editReply({
                content: '❌ Only staff can announce tournaments.'
            });
        }

        const tournamentId = interaction.options
            .getString('id')
            .trim();

        if (
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
                .test(tournamentId)
        ) {
            return interaction.editReply({
                content:
                    '❌ Enter a valid tournament ID, for example: 12345678-1234-1234-1234-123456789abc. Do not paste the full link.'
            });
        }

        const refreshKey =
            process.env.CHALLENGERMODE_REFRESH_KEY?.trim();

        if (!refreshKey) {
            return interaction.editReply({
                content:
                    '❌ CHALLENGERMODE_REFRESH_KEY is missing from the bot configuration.'
            });
        }

        const channel = interaction.options.getChannel('channel');

        const botMember = await interaction.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);

        if (!permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ])) {
            return interaction.editReply({
                content:
                    '❌ The bot needs View Channel, Send Messages and Embed Links permissions in that channel.'
            });
        }

        let tournament;

        try {
            // Fluxo de autenticação usado na versão original do bot.
            const authData = await fetchJson(
                'https://publicapi.challengermode.com/mk1/v1/auth/access_keys',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        refreshKey
                    })
                }
            );

            if (
                typeof authData.value !== 'string' ||
                !authData.value.trim()
            ) {
                throw new Error('Invalid access token response');
            }

            tournament = await fetchJson(
                `https://publicapi.challengermode.com/mk1/v1/tournaments/${tournamentId}`,
                {
                    headers: {
                        Authorization: `Bearer ${authData.value}`
                    }
                }
            );

            if (
                !tournament ||
                typeof tournament !== 'object' ||
                typeof tournament.name !== 'string' ||
                !tournament.name.trim()
            ) {
                throw new Error('Invalid tournament response');
            }
        } catch (error) {
            console.error(
                'Challengermode request failed:',
                error.name,
                error.message
            );

            const timedOut =
                error.name === 'TimeoutError' ||
                error.name === 'AbortError';

            return interaction.editReply({
                content: timedOut
                    ? '❌ Challengermode took too long to respond. Please try again.'
                    : '❌ Could not fetch the tournament. Check the tournament ID, API key and access permissions.'
            });
        }

        const tournamentUrl =
            'https://www.challengermode.com/s/GlitchArena/tournaments/' +
            tournamentId;

        const startMilliseconds = tournament.scheduledStartTime
            ? Date.parse(tournament.scheduledStartTime)
            : NaN;

        const startText = Number.isFinite(startMilliseconds)
            ? (
                `<t:${Math.floor(startMilliseconds / 1000)}:F>\n` +
                `(<t:${Math.floor(startMilliseconds / 1000)}:R>)`
            )
            : 'Check the tournament page';

        const game =
            typeof tournament.gameTitle === 'string' &&
                tournament.gameTitle.trim()
                ? tournament.gameTitle.trim()
                : 'Check the tournament page';

        const prize =
            typeof tournament.customPrizeText === 'string' &&
                tournament.customPrizeText.trim()
                ? tournament.customPrizeText.trim()
                : 'Check the tournament page';

        const embed = new EmbedBuilder()
            .setTitle(
                truncate(`🏆 ${tournament.name.trim()}`, 256)
            )
            .setURL(tournamentUrl)
            .setDescription(
                'Registration for our next tournament is open!\n\n' +
                '**Click the title above to visit the tournament page and sign up.**'
            )
            .setColor(0xe53935)
            .addFields(
                {
                    name: '🎮 Game',
                    value: truncate(game, 1024),
                    inline: true
                },
                {
                    name: '💰 Prize Pool',
                    value: truncate(prize, 1024),
                    inline: true
                },
                {
                    name: '📅 Start Date',
                    value: startText,
                    inline: false
                }
            )
            .setFooter({
                text: 'Glitch Arena Esports',
                ...(interaction.guild.iconURL()
                    ? { iconURL: interaction.guild.iconURL() }
                    : {})
            })
            .setTimestamp();

        const imageUrl = validImageUrl(
            tournament.logoImage?.xlarge?.url
        );

        if (imageUrl) {
            embed.setImage(imageUrl);
        }

        try {
            await channel.send({
                embeds: [embed],
                allowedMentions: {
                    parse: []
                }
            });
        } catch (error) {
            console.error(
                'Error publishing tournament announcement:',
                error
            );

            return interaction.editReply({
                content:
                    '❌ The tournament was fetched, but the announcement could not be sent. Check the bot channel permissions.'
            });
        }

        return interaction.editReply({
            content: `✅ Tournament announced successfully in ${channel}!`
        });
    }
};