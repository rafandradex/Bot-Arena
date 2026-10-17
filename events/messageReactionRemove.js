const { Events } = require('discord.js');

const cargosPorEmoji = {
    // '♟️': process.env.ROLE_TFT_ID,
    // '🃏': process.env.ROLE_LOR_ID,
    '🔫': process.env.ROLE_VALORANT_ID,
    '⚔️': process.env.ROLE_BRAWLHALLA_ID,
    // '📱': process.env.ROLE_WILD_RIFT_ID,
    // '🏰': process.env.ROLE_THRONE_ID,
    // '🧛': process.env.ROLE_VRISING_ID,
    // '🎭': process.env.ROLE_SOULMASK_ID
};

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        if (user.bot) return;

        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();

        const roleId = cargosPorEmoji[reaction.emoji.name];

        if (roleId) {
            const member = await reaction.message.guild.members.fetch(user.id);
            const role = reaction.message.guild.roles.cache.get(roleId);
            
            if (role) {
                await member.roles.remove(role).catch(console.error);
            }
        }
    }
};