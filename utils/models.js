const { Schema, model } = require('mongoose');

const SuggMetaSchema = new Schema({
    id: {
        type: String,
        default: 'main'
    },
    lastPromptId: String
});

const TournamentPlayerSchema = new Schema(
    {
        playerKey: {
            type: String,
            required: true
        },
        name: String,
        discordId: String
    },
    { _id: false }
);

const TournamentResultSchema = new Schema(
    {
        tournamentId: {
            type: String,
            required: true
        },

        gameName: {
            type: String,
            required: true
        },

        firstPlace: {
            type: TournamentPlayerSchema,
            required: true
        },

        secondPlace: {
            type: TournamentPlayerSchema,
            default: null
        },

        thirdPlace: {
            type: TournamentPlayerSchema,
            default: null
        },

        recordedBy: {
            type: String,
            required: true
        },

        voidedAt: {
            type: Date,
            default: null
        },

        voidedBy: {
            type: String,
            default: null
        },

        voidReason: {
            type: String,
            default: null
        },

        recordedByName: String,

        guildId: {
            type: String,
            required: true
        },

        channelId: {
            type: String,
            required: true
        },

        recordedAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const LeaderboardSchema = new Schema({
    game: {
        type: String,
        required: true,
        unique: true
    },

    players: {
        type: Map,
        of: Number,
        default: () => ({})
    },

    playerNames: {
        type: Map,
        of: String,
        default: () => ({})
    },

    processedTournamentIds: {
        type: [String],
        default: []
    },

    tournamentHistory: {
        type: [TournamentResultSchema],
        default: []
    },

    playerAliases: {
        type: Map,
        of: String,
        default: () => ({})
    },

    leaderboardChannelId: String,
    leaderboardMessageId: String
});

const XpSchema = new Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },

    xp: {
        type: Number,
        default: 0
    },

    level: {
        type: Number,
        default: 0
    }
});

module.exports = {
    SuggMetaModel: model('SuggMeta', SuggMetaSchema),
    LeaderboardModel: model('Leaderboard', LeaderboardSchema),
    XpModel: model('Xp', XpSchema)
};