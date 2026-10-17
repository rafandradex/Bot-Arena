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
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (user.bot) return;

        // Traz a mensagem para a memória caso seja antiga
        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();

        const roleId = cargosPorEmoji[reaction.emoji.name];

        if (roleId) {
            const member = await reaction.message.guild.members.fetch(user.id);
            const role = reaction.message.guild.roles.cache.get(roleId);
            
            if (role) {
                await member.roles.add(role).catch(console.error);
            }
        }
    }
};