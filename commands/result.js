const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    escapeMarkdown
} = require('discord.js');

const { createHash } = require('node:crypto');

const { sendLog } = require('../utils/helpers');
const { LeaderboardModel } = require('../utils/models');

const {
    refreshLeaderboardMessage
} = require('../utils/leaderboard');

const GAME_NAMES = {
    brawlhalla: 'Brawlhalla',
    valorant: 'Valorant',
    cs2: 'CS2'
};

function parsePlayer(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const name = value
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');

    if (!name || name.length > 80) {
        throw new Error(
            'Player names must contain between 1 and 80 characters.'
        );
    }

    const mention = /^<@!?(\d{17,20})>$/.exec(name);

    if (mention) {
        return {
            key: mention[1],
            name: null,
            discordId: mention[1],
            display: `<@${mention[1]}>`
        };
    }

    const hash = createHash('sha256')
        .update(name.toLowerCase())
        .digest('hex');

    return {
        key: `name_${hash}`,
        name,
        discordId: null,
        display: escapeMarkdown(name)
    };
}

function toHistoryPlayer(player) {
    if (!player) return null;

    return {
        playerKey: player.key,
        name: player.name || null,
        discordId: player.discordId || null
    };
}

async function recordWin(
    game,
    tournamentId,
    winner,
    historyEntry,
    aliasChecks
) {
    // Cria apenas o documento do ranking, se ainda não existir.
    // Nenhuma vitória é registada nesta operação.
    try {
        await LeaderboardModel.updateOne(
            { game },
            {
                $setOnInsert: { game }
            },
            {
                upsert: true,
                setDefaultsOnInsert: true,
                runValidators: true
            }
        );
    } catch (error) {
        if (error.code !== 11000) throw error;

        const exists = await LeaderboardModel.exists({ game });

        if (!exists) throw error;
    }

    const filter = {
        game,
        processedTournamentIds: {
            $ne: tournamentId
        }
    };

    // Confirma as associações na própria operação de gravação.
    // Inclui nomes que ainda não tinham associação na leitura.
    for (const { nameKey, discordId } of aliasChecks) {
        const path = `playerAliases.${nameKey}`;

        filter[path] = discordId
            ? { $eq: discordId }
            : { $exists: false };
    }

    const update = {
        $inc: {
            [`players.${winner.key}`]: 1
        },
        $addToSet: {
            processedTournamentIds: tournamentId
        },
        $push: {
            tournamentHistory: historyEntry
        }
    };

    const playerNames = {};

    for (const player of [
        historyEntry.firstPlace,
        historyEntry.secondPlace,
        historyEntry.thirdPlace
    ]) {
        if (player?.name) {
            playerNames[
                `playerNames.${player.playerKey}`
            ] = player.name;
        }
    }

    if (Object.keys(playerNames).length > 0) {
        update.$set = playerNames;
    }

    // Sem upsert: uma associação alterada não pode criar outro ranking.
    const saved = await LeaderboardModel.findOneAndUpdate(
        filter,
        update,
        {
            returnDocument: 'after',
            runValidators: true
        }
    );

    if (saved) return saved;

    const duplicate = await LeaderboardModel.exists({
        game,
        processedTournamentIds: tournamentId
    });

    if (duplicate) return null;

    const error = new Error(
        'Player associations changed before the result was saved'
    );

    error.code = 'PLAYER_ASSOCIATIONS_CHANGED';

    throw error;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('result')
        .setDescription('Publishes tournament results and records the champion')
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
                .setDescription('Unique tournament ID')
                .setMaxLength(100)
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('first_place')
                .setDescription('Player name or Discord mention')
                .setMaxLength(80)
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('second_place')
                .setDescription('Player name or Discord mention')
                .setMaxLength(80)
        )

        .addStringOption(option =>
            option
                .setName('third_place')
                .setDescription('Player name or Discord mention')
                .setMaxLength(80)
        )

        .addRoleOption(option =>
            option
                .setName('champion_role')
                .setDescription('Authorized champion role (Discord members only)')
        )

        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to publish results')
                .addChannelTypes(ChannelType.GuildText)
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

        const staffMember = await interaction.guild.members.fetch(
            interaction.user.id
        );

        const staffRoleId = process.env.STAFF_ROLE_ID?.trim();

        const isStaff =
            Boolean(staffRoleId) &&
            staffMember.roles.cache.has(staffRoleId);

        const canManageMessages = staffMember.permissions.has(
            PermissionFlagsBits.ManageMessages
        );

        if (!isStaff && !canManageMessages) {
            return interaction.editReply({
                content: '❌ Only staff can record tournament results.'
            });
        }

        if (
            !LeaderboardModel.schema.path('tournamentHistory') ||
            !LeaderboardModel.schema.path('playerAliases')
        ) {
            return interaction.editReply({
                content:
                    '❌ Update tournamentHistory and playerAliases in utils/models.js and restart the bot.'
            });
        }

        const gameKey = interaction.options.getString('game', true);

        if (
            !Object.prototype.hasOwnProperty.call(
                GAME_NAMES,
                gameKey
            )
        ) {
            return interaction.editReply({
                content:
                    '❌ Select a supported game: Brawlhalla, Valorant or CS2.'
            });
        }

        const game = GAME_NAMES[gameKey];

        const tournamentId = interaction.options
            .getString('tournament_id', true)
            .trim()
            .toLowerCase();

        if (!/^[a-z0-9_-]{1,100}$/.test(tournamentId)) {
            return interaction.editReply({
                content:
                    '❌ Enter the tournament ID using only letters, numbers, hyphens or underscores.'
            });
        }

        let first;
        let second;
        let third;

        try {
            first = parsePlayer(
                interaction.options.getString('first_place', true)
            );

            second = parsePlayer(
                interaction.options.getString('second_place')
            );

            third = parsePlayer(
                interaction.options.getString('third_place')
            );
        } catch (error) {
            return interaction.editReply({
                content: `❌ ${error.message}`
            });
        }

        if (!first) {
            return interaction.editReply({
                content: '❌ Enter the first-place player.'
            });
        }

        if (third && !second) {
            return interaction.editReply({
                content:
                    '❌ Enter second place before adding third place.'
            });
        }

        const aliasChecks = [];

        try {
            const aliasBoard = await LeaderboardModel
                .findOne({ game: gameKey })
                .select('playerAliases');

            for (const player of [first, second, third].filter(Boolean)) {
                if (player.discordId) continue;

                const nameKey = player.key;

                const discordId =
                    aliasBoard?.playerAliases?.get(nameKey);

                if (
                    discordId !== undefined &&
                    !/^\d{17,20}$/.test(discordId)
                ) {
                    throw new Error('Invalid stored player association');
                }

                aliasChecks.push({
                    nameKey,
                    discordId: discordId || null
                });

                if (!discordId) continue;

                player.key = discordId;
                player.discordId = discordId;
                player.display = `<@${discordId}>`;
            }
        } catch (error) {
            console.error('Error resolving player aliases:', error);

            return interaction.editReply({
                content:
                    '❌ Could not verify player associations. Please contact staff or try again later.'
            });
        }

        const placements = [first, second, third].filter(Boolean);

        if (
            new Set(placements.map(player => player.key)).size !==
            placements.length
        ) {
            return interaction.editReply({
                content:
                    '❌ Each podium position must have a different player. Linked names and Discord mentions count as the same player.'
            });
        }

        // Verifica os utilizadores e guarda o nome atual no histórico.
        for (const player of placements) {
            if (!player.discordId) continue;

            let user;

            try {
                user = await interaction.client.users.fetch(
                    player.discordId
                );
            } catch {
                return interaction.editReply({
                    content:
                        `❌ Could not verify ${player.display}. Check the mention or player association.`,
                    allowedMentions: {
                        parse: []
                    }
                });
            }

            if (user.bot) {
                return interaction.editReply({
                    content: '❌ Bots cannot occupy podium positions.'
                });
            }

            player.name = user.globalName || user.username;
        }

        const channel =
            interaction.options.getChannel('channel') ||
            interaction.channel;

        if (
            !channel ||
            channel.guildId !== interaction.guildId ||
            !channel.isTextBased() ||
            typeof channel.send !== 'function'
        ) {
            return interaction.editReply({
                content:
                    '❌ Select a channel in this server where results can be published.'
            });
        }

        const botMember = await interaction.guild.members.fetchMe();

        const permissions = channel.permissionsFor(botMember);

        const canSend = channel.isThread()
            ? permissions?.has(
                PermissionFlagsBits.SendMessagesInThreads
            )
            : permissions?.has(
                PermissionFlagsBits.SendMessages
            );

        if (
            !canSend ||
            !permissions?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.EmbedLinks
            ])
        ) {
            return interaction.editReply({
                content:
                    '❌ The bot does not have permission to publish results in this channel.'
            });
        }

        const role = interaction.options.getRole('champion_role');

        let championMember = null;

        if (role) {
            const allowedRoleIds = new Set(
                (process.env.CHAMPION_ROLE_IDS || '')
                    .split(',')
                    .map(id => id.trim())
                    .filter(Boolean)
            );

            if (!allowedRoleIds.has(role.id)) {
                return interaction.editReply({
                    content:
                        '❌ This role is not authorized. Configure CHAMPION_ROLE_IDS in the bot settings.'
                });
            }

            if (role.managed || role.id === interaction.guild.id) {
                return interaction.editReply({
                    content:
                        '❌ This role cannot be assigned as a champion role.'
                });
            }

            const restrictedPermissions = [
                PermissionFlagsBits.Administrator,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.ManageRoles,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.ManageWebhooks,
                PermissionFlagsBits.ManageEvents,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.MentionEveryone
            ];

            if (
                restrictedPermissions.some(permission =>
                    role.permissions.has(permission)
                )
            ) {
                return interaction.editReply({
                    content:
                        '❌ Use a dedicated champion role without administrative or moderation permissions.'
                });
            }

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return interaction.editReply({
                    content: '❌ The bot needs Manage Roles permission.'
                });
            }

            if (
                botMember.roles.highest.comparePositionTo(role) <= 0
            ) {
                return interaction.editReply({
                    content:
                        '❌ Move the champion role below the bot’s highest role.'
                });
            }

            if (!first.discordId) {
                return interaction.editReply({
                    content:
                        '❌ To award a role, mention the winner or use a name linked to their Discord account. Otherwise, leave champion_role empty.'
                });
            }

            championMember = await interaction.guild.members
                .fetch(first.discordId)
                .catch(() => null);

            if (!championMember || championMember.user.bot) {
                return interaction.editReply({
                    content:
                        '❌ The champion role requires a player who is a member of this server and is not a bot.'
                });
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${game} Tournament - Results!`)
            .setDescription('Congratulations to our top players:')
            .setColor(0xffd700)
            .addFields(
                {
                    name: '🎟️ Tournament ID',
                    value: tournamentId
                },
                {
                    name: '🥇 1st Place',
                    value: first.display
                }
            )
            .setFooter({
                text: 'Glitch Arena Hall of Fame',
                ...(interaction.guild.iconURL()
                    ? { iconURL: interaction.guild.iconURL() }
                    : {})
            })
            .setTimestamp();

        if (second) {
            embed.addFields({
                name: '🥈 2nd Place',
                value: second.display
            });
        }

        if (third) {
            embed.addFields({
                name: '🥉 3rd Place',
                value: third.display
            });
        }

        const historyEntry = {
            tournamentId,
            gameName: game,
            firstPlace: toHistoryPlayer(first),
            secondPlace: toHistoryPlayer(second),
            thirdPlace: toHistoryPlayer(third),
            recordedBy: interaction.user.id,
            recordedByName: interaction.user.tag,
            guildId: interaction.guildId,
            channelId: channel.id,
            recordedAt: new Date()
        };

        let board;

        try {
            board = await recordWin(
                gameKey,
                tournamentId,
                first,
                historyEntry,
                aliasChecks
            );
        } catch (error) {
            if (error.code === 'PLAYER_ASSOCIATIONS_CHANGED') {
                return interaction.editReply({
                    content:
                        '⚠️ A player association changed while this command was running. This attempt did not save a result. Run /result again with the same tournament ID.'
                });
            }

            console.error('Error recording tournament result:', error);

            return interaction.editReply({
                content:
                    '❌ Could not confirm the result in the database. No announcement was sent. Retry with the same tournament ID to avoid counting it twice.'
            });
        }

        if (!board) {
            return interaction.editReply({
                content:
                    `❌ Tournament \`${tournamentId}\` has already been recorded for **${game}**. No extra win or history entry was added.`
            });
        }

        const totalWins = board.players.get(first.key);
        const warnings = [];

        try {
            const updated = await refreshLeaderboardMessage(
                interaction.client,
                gameKey
            );

            if (!updated) {
                warnings.push(
                    '⚠️ No automatic leaderboard message is configured. Staff can create one with /leaderboard.'
                );
            }
        } catch (error) {
            console.error('Error updating leaderboard message:', error);

            warnings.push(
                '⚠️ The result was saved, but the leaderboard could not be updated. Check permissions or configure a new message with /leaderboard.'
            );
        }

        if (role && championMember) {
            try {
                await championMember.roles.add(
                    role.id,
                    `Tournament champion: ${tournamentId}`
                );

                embed.addFields({
                    name: '👑 Title Awarded',
                    value:
                        `${first.display} is the new ${escapeMarkdown(role.name)}!`
                });
            } catch (error) {
                console.error('Error assigning champion role:', error);

                warnings.push(
                    '⚠️ The champion role could not be assigned. Check permissions and role hierarchy.'
                );
            }
        }

        // Uma falha no log não deve impedir a publicação dos resultados.
        try {
            await sendLog(
                interaction.client,
                '📊 Tournament Result Recorded',
                `**Tournament ID:** ${tournamentId}\n` +
                `**Winner:** ${first.display}\n` +
                `**Game:** ${game}\n` +
                `**Total Wins:** ${totalWins}\n` +
                `**Recorded by:** <@${interaction.user.id}>`,
                0x57f287
            );
        } catch (error) {
            console.error('Error logging tournament result:', error);

            warnings.push(
                '⚠️ The result was saved, but the staff log could not be sent.'
            );
        }

        try {
            await channel.send({
                embeds: [embed],
                allowedMentions: {
                    parse: []
                }
            });
        } catch (error) {
            console.error('Error publishing results:', error);

            return interaction.editReply({
                content: [
                    `⚠️ Tournament \`${tournamentId}\`, the win and the podium history were saved, but the announcement could not be sent. Publish it manually; this ID is already recorded.`,
                    ...warnings
                ].join('\n'),
                allowedMentions: {
                    parse: []
                }
            });
        }

        return interaction.editReply({
            content: [
                `✅ Results published and history saved! ${first.display} now has **${totalWins}** win(s).`,
                ...warnings
            ].join('\n'),
            allowedMentions: {
                parse: []
            }
        });
    }
};