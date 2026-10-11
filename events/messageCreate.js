const { Events, EmbedBuilder } = require('discord.js');
const { XpModel } = require('../utils/models');

// Evitar Spam: Guarda quem enviou mensagem nos últimos 60 segundos
const cooldowns = new Set();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        // Lógica do Canal de Sugestões
        if (process.env.SUGGESTIONS_CHANNEL_ID && message.channelId === process.env.SUGGESTIONS_CHANNEL_ID) {
            return await message.delete().catch(() => { });
        }

        // 👉 SISTEMA DE XP
        // Se o membro estiver em cooldown, ignora
        if (cooldowns.has(message.author.id)) return;

        // Adiciona o membro ao cooldown por 60 segundos
        cooldowns.add(message.author.id);
        setTimeout(() => cooldowns.delete(message.author.id), 60000);

        // Dá um valor aleatório entre 15 e 25 XP
        const xpToAdd = Math.floor(Math.random() * 11) + 15;

        try {
            let userXp = await XpModel.findOne({ userId: message.author.id });

            if (!userXp) {
                userXp = new XpModel({ userId: message.author.id, xp: 0, level: 0 });
            }

            userXp.xp += xpToAdd;

            // Fórmula de Nível (Ex: Nível 1 = 100xp | Nível 2 = 400xp | Nível 3 = 900xp)
            const newLevel = Math.floor(0.1 * Math.sqrt(userXp.xp));

            // Verifica se o membro subiu de nível
            if (newLevel > userXp.level) {
                userXp.level = newLevel;

                const embed = new EmbedBuilder()
                    .setTitle('🎉 Level Up!')
                    .setDescription(`Congratulations ${message.author}, you just advanced to **Level ${newLevel}**!`)
                    .setColor(0xffd700);

                // Envia a mensagem e apaga passado 10 segundos para não sujar o chat
                const levelMsg = await message.channel.send({ embeds: [embed] }).catch(() => null);
                if (levelMsg) {
                    setTimeout(() => levelMsg.delete().catch(() => null), 10000);
                }
            }

            await userXp.save();
        } catch (err) {
            console.error('Error saving XP:', err);
        }
    }
};