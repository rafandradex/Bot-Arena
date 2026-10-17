const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags,
    escapeMarkdown
} = require('discord.js');

const { LeaderboardModel } = require('../utils/models');

const gameNames = {
    brawlhalla: 'Brawlhalla',
    valorant: 'Valorant',
    cs2: 'CS2'
};

const PAGE_SIZE = 5;

function safeText(value, maxLength = 100) {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    // Limita depois de escapar para respeitar os limites do embed.
    const escaped = escapeMarkdown(text);

    return escaped.length > maxLength
        ? `${escaped.slice(0, maxLength - 1)}…`
        : escaped;
}

function playerDisplay(player) {
    if (!player || typeof player !== 'object') {
        return 'Not recorded';
    }

    if (/^\d{17,20}$/.test(player.discordId || '')) {
        return `<@${player.discordId}>`;
    }

    return player.name
        ? safeText(player.name)
        : 'Unknown player';
}

function userDisplay(id) {
    return /^\d{17,20}$/.test(id || '')
        ? `<@${id}>`
        : 'Not recorded';
}

function dateDisplay(value) {
    if (!value) return 'Not recorded';

    const milliseconds = new Date(value).getTime();

    return Number.isFinite(milliseconds)
        ? `<t:${Math.floor(milliseconds / 1000)}:f>`
        : 'Not recorded';
}

function dateValue(value) {
    if (!value) return 0;

    const milliseconds = new Date(value).getTime();

    return Number.isFinite(milliseconds) ? milliseconds : 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Staff: views recorded tournament results')
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

        .addStringOption(option =>
            option
                .setName('tournament_id')
                .setDescription('Optional: search for an exact tournament ID')
                .setMaxLength(100)
        )

        .addStringOption(option =>
            option
                .setName('status')
                .setDescription('Filter results by status')
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Active', value: 'active' },
                    { name: 'Cancelled', value: 'cancelled' }
                )
        )

        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Page number')
                .setMinValue(1)
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

        const staffRoleId = process.env.STAFF_ROLE_ID?.trim();

        const isStaff =
            Boolean(staffRoleId) &&
            member.roles.cache.has(staffRoleId);

        if (
            !isStaff &&
            !member.permissions.has(PermissionFlagsBits.ManageMessages)
        ) {
            return interaction.editReply({
                content: '❌ Only staff can view tournament history.'
            });
        }

        const game = interaction.options.getString('game', true);

        const tournamentId = interaction.options
            .getString('tournament_id')
            ?.trim()
            .toLowerCase();

        const status =
            interaction.options.getString('status') || 'all';

        const page = interaction.options.getInteger('page') ?? 1;

        if (
            !Object.prototype.hasOwnProperty.call(gameNames, game) ||
            !['all', 'active', 'cancelled'].includes(status) ||
            !Number.isSafeInteger(page) ||
            page < 1
        ) {
            return interaction.editReply({
                content: '❌ Select valid search options.'
            });
        }

        if (
            tournamentId !== undefined &&
            !/^[a-z0-9_-]{1,100}$/.test(tournamentId)
        ) {
            return interaction.editReply({
                content:
                    '❌ Enter the tournament ID using only letters, numbers, hyphens or underscores.'
            });
        }

        let board;

        try {
            // Leitura sem conversão do Mongoose.
            // Não modifica nem tenta reparar o histórico.
            board = await LeaderboardModel.collection.findOne(
                { game },
                {
                    projection: {
                        tournamentHistory: 1
                    }
                }
            );
        } catch (error) {
            console.error('Error reading tournament history:', error);

            return interaction.editReply({
                content:
                    '❌ Could not load tournament history. Please try again later.'
            });
        }

        const history = Array.isArray(board?.tournamentHistory)
            ? board.tournamentHistory
            : [];

        let incompleteCount = 0;

        const results = history
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => {
                if (
                    !entry ||
                    typeof entry !== 'object' ||
                    typeof entry.tournamentId !== 'string' ||
                    !entry.tournamentId.trim() ||
                    typeof entry.gameName !== 'string' ||
                    !entry.gameName.trim()
                ) {
                    incompleteCount++;
                    return false;
                }

                // Mostra apenas resultados deste servidor.
                if (entry.guildId !== interaction.guildId) {
                    return false;
                }

                if (
                    tournamentId !== undefined &&
                    entry.tournamentId !== tournamentId
                ) {
                    return false;
                }

                const cancelled = entry.voidedAt != null;

                if (status === 'active' && cancelled) return false;
                if (status === 'cancelled' && !cancelled) return false;

                return true;
            })
            .sort((a, b) =>
                dateValue(b.entry.recordedAt) -
                    dateValue(a.entry.recordedAt) ||
                b.index - a.index
            );

        const incompleteWarning = incompleteCount > 0
            ? (
                `\n⚠️ ${incompleteCount} incomplete entry/entries in this game's stored history ` +
                'could not be listed. They were preserved.'
            )
            : '';

        if (results.length === 0) {
            return interaction.editReply({
                content:
                    '📋 No results match these filters in this server.' +
                    incompleteWarning
            });
        }

        const totalPages = Math.ceil(results.length / PAGE_SIZE);

        if (page > totalPages) {
            return interaction.editReply({
                content:
                    `❌ This search has **${totalPages}** page(s). Choose a page between 1 and ${totalPages}.` +
                    incompleteWarning
            });
        }

        const start = (page - 1) * PAGE_SIZE;
        const entries = results.slice(start, start + PAGE_SIZE);

        const embed = new EmbedBuilder()
            .setTitle(`📋 ${gameNames[game]} — Tournament History`)
            .setColor(0xe53935)
            .setDescription(
                `**${results.length}** matching record(s) • ` +
                `Status: **${status}**\n` +
                'Ordered by recording date, newest first.' +
                incompleteWarning
            )
            .setFooter({
                text:
                    `Glitch Arena • Page ${page}/${totalPages} • ` +
                    'Use /history with page to view more'
            })
            .setTimestamp();

        for (const { entry, index } of entries) {
            const cancelled = entry.voidedAt != null;

            const lines = [
                `**Status:** ${cancelled ? '🔴 Cancelled' : '🟢 Active'}`,
                `🥇 ${playerDisplay(entry.firstPlace)}`,
                `🥈 ${playerDisplay(entry.secondPlace)}`,
                `🥉 ${playerDisplay(entry.thirdPlace)}`,
                `**Recorded by:** ${userDisplay(entry.recordedBy)}`,
                `**Recorded at:** ${dateDisplay(entry.recordedAt)}`
            ];

            if (cancelled) {
                lines.push(
                    `**Cancelled by:** ${userDisplay(entry.voidedBy)}`,
                    `**Cancelled at:** ${dateDisplay(entry.voidedAt)}`,
                    `**Reason:** ${
                        entry.voidReason
                            ? safeText(entry.voidReason, 200)
                            : 'Not recorded'
                    }`
                );
            }

            embed.addFields({
                name:
                    `#${index + 1} • ` +
                    safeText(entry.tournamentId, 120),
                value: lines.join('\n'),
                inline: false
            });
        }

        return interaction.editReply({
            embeds: [embed],
            allowedMentions: {
                parse: []
            }
        });
    }
};