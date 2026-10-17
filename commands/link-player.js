const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const { createHash } = require('node:crypto');

const { LeaderboardModel } = require('../utils/models');

const {
    refreshLeaderboardMessage
} = require('../utils/leaderboard');

const games = ['brawlhalla', 'valorant', 'cs2'];

function toPlainObject(value) {
    if (value == null) return value;

    return typeof value.toObject === 'function'
        ? value.toObject()
        : value;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link-player')
        .setDescription('Staff: links a player name to a Discord user')
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
                .setName('name')
                .setDescription('Player name previously used in results')
                .setMaxLength(80)
                .setRequired(true)
        )

        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Discord user who owns this player name')
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

        const staffRoleId = process.env.STAFF_ROLE_ID?.trim();

        const isStaff =
            Boolean(staffRoleId) &&
            member.roles.cache.has(staffRoleId);

        if (
            !isStaff &&
            !member.permissions.has(PermissionFlagsBits.ManageMessages)
        ) {
            return interaction.editReply({
                content: '❌ Only staff can link player accounts.'
            });
        }

        if (!LeaderboardModel.schema.path('playerAliases')) {
            return interaction.editReply({
                content:
                    '❌ Update the playerAliases schema in utils/models.js and restart the bot.'
            });
        }

        const game = interaction.options.getString('game', true);

        const name = interaction.options
            .getString('name', true)
            .normalize('NFKC')
            .trim()
            .replace(/\s+/g, ' ');

        const user = interaction.options.getUser('user', true);

        if (
            !games.includes(game) ||
            !name ||
            name.length > 80 ||
            /^<@!?\d{17,20}>$/.test(name) ||
            !/^\d{17,20}$/.test(user.id) ||
            user.bot
        ) {
            return interaction.editReply({
                content:
                    '❌ Select a supported game, enter a player name and choose a Discord user who is not a bot.'
            });
        }

        const hash = createHash('sha256')
            .update(name.toLowerCase())
            .digest('hex');

        const nameKey = `name_${hash}`;

        let saved = null;
        let transferredWins = 0;

        try {
            const collection = LeaderboardModel.collection;

            for (let attempt = 0; attempt < 3; attempt++) {
                // Lê os valores originais sem conversão do Mongoose.
                const board = await collection.findOne({ game });

                if (!board) {
                    return interaction.editReply({
                        content:
                            '❌ No leaderboard exists for this game yet.'
                    });
                }

                const aliases = board.playerAliases || {};
                const linkedId = aliases[nameKey];

                if (linkedId && linkedId !== user.id) {
                    return interaction.editReply({
                        content:
                            '❌ This name is already linked to another Discord user. Review the existing association first.'
                    });
                }

                if (
                    board.tournamentHistory != null &&
                    !Array.isArray(board.tournamentHistory)
                ) {
                    throw new Error('Invalid tournament history format');
                }

                const history = board.tournamentHistory || [];
                const podiumConflicts = [];

                // Verifica o efeito da associação em cada pódio,
                // incluindo os resultados anulados.
                history.forEach((entry, index) => {
                    const original = toPlainObject(entry);

                    if (!original || typeof original !== 'object') {
                        return;
                    }

                    const positions = [
                        original.firstPlace,
                        original.secondPlace,
                        original.thirdPlace
                    ].map(toPlainObject);

                    const containsName = positions.some(
                        player => player?.playerKey === nameKey
                    );

                    if (!containsName) return;

                    const resolvedKeys = positions
                        .filter(Boolean)
                        .map(player => {
                            const key = player.playerKey;

                            if (key === nameKey) {
                                return user.id;
                            }

                            return (
                                aliases[key] ||
                                player.discordId ||
                                key
                            );
                        })
                        .filter(Boolean);

                    if (
                        new Set(resolvedKeys).size !== resolvedKeys.length
                    ) {
                        podiumConflicts.push({
                            index,
                            tournamentId: original.tournamentId
                        });
                    }
                });

                if (podiumConflicts.length > 0) {
                    const details = podiumConflicts
                        .slice(0, 5)
                        .map(({ index, tournamentId }) => {
                            const id = typeof tournamentId === 'string'
                                ? tournamentId
                                    .replace(/[^a-zA-Z0-9_-]/g, '')
                                    .slice(0, 100)
                                : '';

                            return id
                                ? `• Tournament: \`${id}\` — history entry ${index + 1}`
                                : `• History entry ${index + 1}`;
                        })
                        .join('\n');

                    return interaction.editReply({
                        content:
                            '❌ This association would place the same Discord user in multiple podium positions.\n\n' +
                            details +
                            (
                                podiumConflicts.length > 5
                                    ? `\n• And ${podiumConflicts.length - 5} more conflict(s).`
                                    : ''
                            ) +
                            '\n\nReview the affected podiums, including cancelled entries, before linking this player. No changes were saved.',
                        allowedMentions: {
                            parse: []
                        }
                    });
                }

                const players = {
                    ...(board.players || {})
                };

                const playerNames = {
                    ...(board.playerNames || {})
                };

                transferredWins = players[nameKey] ?? 0;

                const currentWins = players[user.id] ?? 0;

                if (
                    !Number.isSafeInteger(transferredWins) ||
                    transferredWins < 0 ||
                    !Number.isSafeInteger(currentWins) ||
                    currentWins < 0
                ) {
                    throw new Error('Invalid player win count');
                }

                const totalWins = currentWins + transferredWins;

                if (!Number.isSafeInteger(totalWins)) {
                    throw new Error('Invalid merged win count');
                }

                delete players[nameKey];
                delete playerNames[nameKey];

                if (totalWins > 0) {
                    players[user.id] = totalWins;
                }

                playerNames[user.id] =
                    user.globalName || user.username;

                const historyUpdates = {};

                // Atualiza apenas os campos de identificação.
                // Preserva nomes históricos, datas, anulações
                // e eventuais entradas incompletas.
                history.forEach((entry, index) => {
                    const original = toPlainObject(entry);

                    if (!original) return;

                    for (const position of [
                        'firstPlace',
                        'secondPlace',
                        'thirdPlace'
                    ]) {
                        const player = toPlainObject(
                            original[position]
                        );

                        if (player?.playerKey !== nameKey) {
                            continue;
                        }

                        const path =
                            `tournamentHistory.${index}.${position}`;

                        historyUpdates[`${path}.playerKey`] = user.id;
                        historyUpdates[`${path}.discordId`] = user.id;
                    }
                });

                // Só guarda se os dados continuarem iguais aos lidos.
                // Se mudarem, a próxima tentativa repete também
                // a verificação dos conflitos no pódio.
                const filter = {
                    _id: board._id
                };

                for (const field of [
                    'players',
                    'playerNames',
                    'playerAliases',
                    'tournamentHistory'
                ]) {
                    filter[field] =
                        Object.prototype.hasOwnProperty.call(
                            board,
                            field
                        )
                            ? { $eq: board[field] }
                            : { $exists: false };
                }

                // Acesso direto: as contagens e os dados da
                // associação são validados acima.
                const writeResult = await collection.updateOne(
                    filter,
                    {
                        $set: {
                            players,
                            playerNames,
                            playerAliases: {
                                ...aliases,
                                [nameKey]: user.id
                            },
                            ...historyUpdates
                        }
                    }
                );

                if (!writeResult.acknowledged) {
                    throw new Error(
                        'Player association write was not acknowledged'
                    );
                }

                if (writeResult.matchedCount === 1) {
                    saved = { totalWins };
                    break;
                }
            }
        } catch (error) {
            console.error('Error linking player:', error);

            return interaction.editReply({
                content:
                    '❌ Could not confirm the player association. Check the database before retrying.'
            });
        }

        if (!saved) {
            return interaction.editReply({
                content:
                    '❌ The leaderboard changed during this operation. Please try again.'
            });
        }

        let warning = '';

        try {
            const refreshed = await refreshLeaderboardMessage(
                interaction.client,
                game
            );

            if (!refreshed) {
                warning =
                    '\n⚠️ No automatic leaderboard is configured. Use /leaderboard to create one.';
            }
        } catch (error) {
            console.error('Error refreshing leaderboard:', error);

            warning =
                '\n⚠️ The association was saved, but the leaderboard could not be refreshed. Run /leaderboard again.';
        }

        return interaction.editReply({
            content:
                `✅ Player name linked to <@${user.id}>.\n` +
                `Transferred wins: **${transferredWins}**.\n` +
                `Total wins: **${saved.totalWins}**.` +
                warning,
            allowedMentions: {
                parse: []
            }
        });
    }
};