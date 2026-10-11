const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getEvents, saveEvents, buildEventEmbed, eventButtons, sendLog } = require('../utils/helpers');

function parseDate(data, hora) {
    const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(data.trim());
    const h = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
    if (!d || !h) return null;
    const date = new Date(+d[3], +d[2] - 1, +d[1], +h[1], +h[2]);
    if (isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / 1000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Event management')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .addSubcommand(s => s.setName('create').setDescription('Creates an event')
            .addStringOption(o => o.setName('title').setDescription('Event title').setRequired(true))
            .addStringOption(o => o.setName('date').setDescription('Date (DD/MM/YYYY)').setRequired(true))
            .addStringOption(o => o.setName('time').setDescription('Time (HH:MM)').setRequired(true))
            .addStringOption(o => o.setName('description').setDescription('Event description'))
            .addStringOption(o => o.setName('location').setDescription('Location'))
            .addChannelOption(o => o.setName('channel').setDescription('Channel to publish').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand(s => s.setName('cancel').setDescription('Cancels an event')
            .addStringOption(o => o.setName('message_id').setDescription('Event message ID').setRequired(true))
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        const events = await getEvents(); // <-- AWAIT AQUI

        if (sub === 'create') {
            const ts = parseDate(interaction.options.getString('date'), interaction.options.getString('time'));
            if (!ts || ts * 1000 < Date.now()) return interaction.editReply({ content: '❌ Invalid or past date.' });

            const channel = interaction.options.getChannel('channel') || (process.env.EVENTS_CHANNEL_ID && await interaction.guild.channels.fetch(process.env.EVENTS_CHANNEL_ID).catch(() => null)) || interaction.channel;

            const ev = {
                title: interaction.options.getString('title'), description: interaction.options.getString('description'),
                location: interaction.options.getString('location'), timestamp: ts, authorId: interaction.user.id,
                authorTag: interaction.user.username, channelId: channel.id, going: [], maybe: [], no: [], cancelled: false
            };

            const msg = await channel.send({ embeds: [buildEventEmbed(ev)], components: [eventButtons()] });
            events[msg.id] = ev;
            await saveEvents(events); // <-- AWAIT AQUI

            await sendLog(interaction.client, '📅 Event Created', `**Title:** ${ev.title}\n**Author:** <@${interaction.user.id}>\n**Channel:** ${channel}`, 0x57f287);
            await interaction.editReply({ content: `✅ Event created in ${channel}.` });
        } else {
            const id = interaction.options.getString('message_id');
            const ev = events[id];
            if (!ev) return interaction.editReply({ content: '❌ Event not found.' });

            ev.cancelled = true;
            await saveEvents(events); // <-- AWAIT AQUI

            const channel = await interaction.guild.channels.fetch(ev.channelId).catch(() => null);
            const msg = channel && await channel.messages.fetch(id).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildEventEmbed(ev)], components: [eventButtons(true)] });

            await sendLog(interaction.client, '🗑️ Event Cancelled', `**Event:** ${ev.title}\n**Cancelled by:** <@${interaction.user.id}>`, 0xed4245);
            await interaction.editReply({ content: '🗑️ Event cancelled.' });
        }
    }
};