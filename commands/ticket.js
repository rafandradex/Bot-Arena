const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Sends the ticket panel')
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

        if (
            !member.permissions.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return interaction.editReply({
                content:
                    '❌ You need Manage Server permission to publish the ticket panel.'
            });
        }

        const channel = interaction.channel;

        if (
            !channel ||
            !channel.isTextBased() ||
            typeof channel.send !== 'function'
        ) {
            return interaction.editReply({
                content:
                    '❌ Use this command in a channel where the ticket panel can be published.'
            });
        }

        const botMember = await interaction.guild.members.fetchMe();

        const permissions = channel.permissionsFor(botMember);

        const sendPermission = channel.isThread()
            ? PermissionFlagsBits.SendMessagesInThreads
            : PermissionFlagsBits.SendMessages;

        if (!permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.EmbedLinks,
            sendPermission
        ])) {
            return interaction.editReply({
                content:
                    '❌ The bot needs permission to view this channel, send messages and embed links.'
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎫 Support')
            .setDescription(
                'Need help? Select a category below to open a private ticket with our staff team.\n\n' +
                '**General** — Questions and support\n' +
                '**Partnership** — Partnership proposals\n' +
                '**Report** — Report a member or an incident'
            )
            .setColor(0xe53935)
            .setFooter({
                text: 'Glitch Arena • Support'
            });

        const select = new StringSelectMenuBuilder()
            .setCustomId('ticket_select')
            .setPlaceholder('Select the ticket subject...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('General questions and support')
                    .setValue('general')
                    .setEmoji('💬'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Partnership')
                    .setDescription('Partnership proposals')
                    .setValue('partnership')
                    .setEmoji('🤝'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Report')
                    .setDescription('Report a member or an incident')
                    .setValue('report')
                    .setEmoji('⚠️')
            );

        const row = new ActionRowBuilder()
            .addComponents(select);

        let panel;

        try {
            panel = await channel.send({
                embeds: [embed],
                components: [row],
                allowedMentions: {
                    parse: []
                }
            });
        } catch (error) {
            console.error('Error publishing ticket panel:', error);

            return interaction.editReply({
                content:
                    '❌ Could not publish the ticket panel. Check the bot channel permissions.'
            });
        }

        return interaction.editReply({
            content: `✅ Ticket panel published!\n${panel.url}`,
            allowedMentions: {
                parse: []
            }
        });
    }
};