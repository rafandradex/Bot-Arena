const {
    EmbedBuilder,
    escapeMarkdown
} = require('discord.js');

const { LeaderboardModel } = require('./models');

const updateQueues = new Map();

function getPlayerDisplay(board, playerId) {
    if (playerId.startsWith('name_')) {
        return escapeMarkdown(
            board.playerNames?.get(playerId) || 'Unknown player'
        );
    }

    return `<@${playerId}>`;
}

function buildLeaderboardEmbed(board, guild) {
    const players = board?.players
        ? Array.from(board.players.entries())
            .filter(([, wins]) => wins > 0)
        : [];

    // Ordena pelas vitórias; em empate usa uma ordem estável.
    players.sort((a, b) =>
        b[1] - a[1] || a[0].localeCompare(b[0])
    );

    const topPlayers = players.slice(0, 10);

    const totalWins = players.reduce(
        (total, [, wins]) => total + wins,
        0
    );

    const gameTitle = board.game.toUpperCase();

    const embed = new EmbedBuilder()
        .setAuthor({
            name: 'GLITCH ARENA • COMPETITIVE RANKINGS',
            ...(guild.iconURL()
                ? { iconURL: guild.iconURL() }
                : {})
        })
        .setTitle(`🏆 ${gameTitle} LEADERBOARD`)
        .setColor(0xffc857)
        .setDescription(
            '## THE ARENA’S BEST\n' +
            'Every tournament. Every victory. One place at the top.\n\n' +
            '**Official ranking • Tournament championships**'
        )
        .addFields(
            {
                name: '👥 RANKED PLAYERS',
                value: `**${players.length}**`,
                inline: true
            },
            {
                name: '🏆 RECORDED TITLES',
                value: `**${totalWins}**`,
                inline: true
            },
            {
                name: '🎮 GAME',
                value: escapeMarkdown(gameTitle),
                inline: true
            }
        )
        .setFooter({
            text:
                'GLITCH ARENA • Ranked by titles • Ties share the same win total'
        })
        .setTimestamp();

    if (topPlayers.length === 0) {
        embed.addFields({
            name: '🥇 THE PODIUM IS WAITING',
            value:
                'No tournament results recorded yet.\n' +
                'Win a tournament and claim your place here.'
        });

        return embed;
    }

    const podiumLabels = [
        '🥇 FIRST PLACE',
        '🥈 SECOND PLACE',
        '🥉 THIRD PLACE'
    ];

    // Cada jogador do pódio ocupa uma secção inteira.
    topPlayers.slice(0, 3).forEach(([playerId, wins], index) => {
        const player = getPlayerDisplay(board, playerId);
        const titleLabel = wins === 1 ? 'TITLE' : 'TITLES';

        embed.addFields({
            name: podiumLabels[index],
            value:
                `**${player}**\n` +
                `🏆 **${wins} ${titleLabel}**`,
            inline: false
        });
    });

    const remaining = topPlayers.slice(3);

    if (remaining.length > 0) {
        const rows = remaining.map(([playerId, wins], index) => {
            const position = String(index + 4).padStart(2, '0');
            const player = getPlayerDisplay(board, playerId);

            return (
                `**${position}.** ${player}\n` +
                `↳ 🏆 **${wins}** ${wins === 1 ? 'title' : 'titles'}`
            );
        });

        // Divide o restante Top 10 para respeitar os limites dos embeds.
        embed.addFields({
            name: '⚔️ THE CONTENDERS',
            value: rows.slice(0, 4).join('\n\n'),
            inline: false
        });

        if (rows.length > 4) {
            embed.addFields({
                name: '🎯 STILL IN THE FIGHT',
                value: rows.slice(4).join('\n\n'),
                inline: false
            });
        }
    }

    embed.addFields({
        name: '📡 LIVE RANKING',
        value:
            'Updated automatically when staff records a new tournament result.\n' +
            '**The next title could be yours.**'
    });

    return embed;
}

function refreshLeaderboardMessage(client, game) {
    const previous = updateQueues.get(game) || Promise.resolve();

    const task = previous.catch(() => { }).then(async () => {
        const board = await LeaderboardModel.findOne({ game });

        if (
            !board?.leaderboardChannelId ||
            !board?.leaderboardMessageId
        ) {
            return false;
        }

        const channel = await client.channels.fetch(
            board.leaderboardChannelId
        );

        if (!channel?.guild || !channel.messages) {
            throw new Error('Leaderboard channel unavailable.');
        }

        const message = await channel.messages.fetch(
            board.leaderboardMessageId
        );

        await message.edit({
            embeds: [
                buildLeaderboardEmbed(board, channel.guild)
            ],
            allowedMentions: {
                parse: []
            }
        });

        return true;
    });

    updateQueues.set(game, task);

    const cleanup = () => {
        if (updateQueues.get(game) === task) {
            updateQueues.delete(game);
        }
    };

    task.then(cleanup, cleanup);

    return task;
}

module.exports = {
    buildLeaderboardEmbed,
    refreshLeaderboardMessage
};