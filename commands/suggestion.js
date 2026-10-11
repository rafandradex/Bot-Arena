const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const { getSuggMeta, saveSuggMeta } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Submit a suggestion to the server')
        .addStringOption(o => o.setName('text').setDescription('Your suggestion').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Suggestions channel').addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
        const text = interaction.options.getString('text');
        const channel = interaction.options.getChannel('channel') || (process.env.SUGGESTIONS_CHANNEL_ID && await interaction.guild.channels.fetch(process.env.SUGGESTIONS_CHANNEL_ID).catch(() => null)) || interaction.channel;

        const embed = new EmbedBuilder().setTitle('💡 New Suggestion').setDescription(text).setColor(0xfee75c).setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) }).setTimestamp();
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('👍').catch(() => { }); await msg.react('👎').catch(() => { });

        const meta = await getSuggMeta(); // <-- AWAIT AQUI
        if (meta.lastPromptId) {
            const oldPrompt = await channel.messages.fetch(meta.lastPromptId).catch(() => null);
            if (oldPrompt) await oldPrompt.delete().catch(() => { });
        }

        const newPrompt = await channel.send('💬 **If you want to leave a suggestion, just type `/suggestion [text]`**');
        meta.lastPromptId = newPrompt.id;
        await saveSuggMeta(meta); // <-- AWAIT AQUI

        await interaction.reply({ content: `✅ Sent to ${channel}!`, flags: MessageFlags.Ephemeral });
    }
};