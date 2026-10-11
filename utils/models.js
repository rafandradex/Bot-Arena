const { Schema, model } = require('mongoose');

const EventSchema = new Schema({
    messageId: { type: String, required: true, unique: true },
    title: String,
    description: String,
    location: String,
    timestamp: Number,
    authorId: String,
    authorTag: String,
    channelId: String,
    going: { type: [String], default: [] },
    maybe: { type: [String], default: [] },
    no: { type: [String], default: [] },
    cancelled: { type: Boolean, default: false }
});

const SuggMetaSchema = new Schema({
    id: { type: String, default: 'main' },
    lastPromptId: String
});

const LeaderboardSchema = new Schema({
    game: { type: String, required: true, unique: true },
    players: { type: Map, of: Number, default: {} }
});

// 👉 NOVO: Molde para o XP
const XpSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 }
});

module.exports = {
    EventModel: model('Event', EventSchema),
    SuggMetaModel: model('SuggMeta', SuggMetaSchema),
    LeaderboardModel: model('Leaderboard', LeaderboardSchema),
    XpModel: model('Xp', XpSchema) // Exportado aqui
};