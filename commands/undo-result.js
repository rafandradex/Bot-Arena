const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const { LeaderboardModel } = require('../utils/models');

const {
    refreshLeaderboardMessage
} = require('../utils/leaderboard');

const gameNames = {
    brawlhalla: 'Brawlhalla',
    valorant: 'Valorant',
    cs2: 'CS2'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('undo-result')
        .setDescription('Staff: cancels a recorded tournament result')
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
                .setDescription('ID of the tournament to cancel')
                .setMaxLength(100)
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for cancelling this result')
                .setMinLength(5)
                .setMaxLength(500)
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
                content: '❌ Only staff can cancel tournament results.'
            });
        }

        const game = interaction.options.getString('game', true);

        const tournamentId = interaction.options
            .getString('tournament_id', true)
            .trim()
            .toLowerCase();

        const reason = interaction.options
            .getString('reason', true)
            .trim();

        if (
            !Object.prototype.hasOwnProperty.call(gameNames, game) ||
            !/^[a-z0-9_-]{1,100}$/.test(tournamentId) ||
            reason.length < 5 ||
            reason.length > 500
        ) {
            return interaction.editReply({
                content:
                    '❌ Select a supported game, enter a valid tournament ID and provide a reason between 5 and 500 characters.'
            });
        }

        const historySchema = LeaderboardModel.schema
            .path('tournamentHistory')?.schema;

        if (
            !historySchema?.path('voidedAt') ||
            !historySchema?.path('voidedBy') ||
            !historySchema?.path('voidReason')
        ) {
            return interaction.editReply({
                content:
                    '❌ Update the cancellation fields in utils/models.js and restart the bot.'
            });
        }

        let cancelled = false;
        let remainingWins = 0;

        try {
            // Acesso direto para preservar os dados tal como estão
            // guardados, incluindo entradas antigas incompletas.
            const collection = LeaderboardModel.collection;

            for (let attempt = 0; attempt < 3; attempt++) {
                const board = await collection.findOne({ game });

                const history = board?.tournamentHistory;

                if (!board || !Array.isArray(history)) {
                    return interaction.editReply({
                        content:
                            '❌ No tournament history exists for this game.'
                    });
                }

                const matches = [];

                history.forEach((entry, index) => {
                    if (
                        entry &&
                        entry.tournamentId === tournamentId &&
                        entry.guildId === interaction.guildId &&
                        entry.voidedAt == null
                    ) {
                        matches.push(index);
                    }
                });

                if (matches.length === 0) {
                    return interaction.editReply({
                        content:
                            '❌ No active result was found for this tournament in this server. It may already be cancelled or have incomplete history.'
                    });
                }

                if (matches.length > 1) {
                    return interaction.editReply({
                        content:
                            '❌ Multiple active history entries exist for this tournament. Staff must review them before cancelling.'
                    });
                }

                const index = matches[0];
                const result = history[index];

                const playerKey = result.firstPlace?.playerKey;

                if (
                    !/^(?:\d{17,20}|name_[a-f0-9]{64})$/.test(
                        playerKey || ''
                    ) ||
                    typeof result.gameName !== 'string' ||
                    !result.gameName.trim() ||
                    !result.recordedAt
                ) {
                    return interaction.editReply({
                        content:
                            '❌ This result has incomplete history. No changes were made.'
                    });
                }

                const wins = board.players?.[playerKey];

                if (
                    !Number.isSafeInteger(wins) ||
                    wins < 1 ||
                    !Array.isArray(board.processedTournamentIds) ||
                    !board.processedTournamentIds.includes(tournamentId)
                ) {
                    return interaction.editReply({
                        content:
                            '❌ The win count or processed tournament ID is inconsistent with this result. No changes were made.'
                    });
                }

                const playerPath = `players.${playerKey}`;
                const historyPath = `tournamentHistory.${index}`;

                // Uma operação atómica:
                // - retira uma vitória;
                // - liberta o ID para uma correção;
                // - acrescenta os dados da anulação ao registo original.
                //
                // A comparação do histórico completo impede usar um
                // índice desatualizado se outra operação o alterar.
                const writeResult = await collection.updateOne(
                    {
                        _id: board._id,
                        tournamentHistory: { $eq: history },
                        processedTournamentIds: tournamentId,
                        [playerPath]: wins
                    },
                    {
                        $inc: {
                            [playerPath]: -1
                        },
                        $pull: {
                            processedTournamentIds: tournamentId
                        },
                        $set: {
                            [`${historyPath}.voidedAt`]: new Date(),
                            [`${historyPath}.voidedBy`]:
                                interaction.user.id,
                            [`${historyPath}.voidReason`]: reason
                        }
                    }
                );

                if (!writeResult.acknowledged) {
                    throw new Error(
                        'Cancellation write was not acknowledged'
                    );
                }

                if (writeResult.matchedCount === 1) {
                    cancelled = true;
                    remainingWins = wins - 1;
                    break;
                }
            }
        } catch (error) {
            console.error('Error cancelling tournament result:', error);

            return interaction.editReply({
                content:
                    '❌ Could not confirm the cancellation in the database. Check the result before retrying.'
            });
        }

        if (!cancelled) {
            return interaction.editReply({
                content:
                    '❌ The result changed during this operation. Please try again.'
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
                '\n⚠️ The cancellation was saved, but the leaderboard could not be refreshed. Run /leaderboard again.';
        }

        return interaction.editReply({
            content:
                `✅ Result cancelled for tournament \`${tournamentId}\` (${gameNames[game]}).\n` +
                `One win was removed. The player now has **${remainingWins}** win(s).\n` +
                'The original podium and cancellation details were preserved.\n' +
                'You can record the corrected result with /result using the same tournament ID.\n' +
                'Review the original announcement and champion role manually.' +
                warning,
            allowedMentions: {
                parse: []
            }
        });
    }
};