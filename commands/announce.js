const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const TITLE_PREFIX = '📢 ';
const MAX_TITLE_LENGTH = 256 - TITLE_PREFIX.length;
const MAX_MESSAGE_LENGTH = 4096;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Sends a formal announcement formatted in an embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('Announcement title')
                .setMinLength(1)
                .setMaxLength(MAX_TITLE_LENGTH)
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Announcement content')
                .setMinLength(1)
                .setMaxLength(MAX_MESSAGE_LENGTH)
                .setRequired(true)
        )

        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to publish the announcement')
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
                .setRequired(true)
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

        const staffRoleId = process.env.STAFF_ROLE_ID?.trim();

        const isStaff =
            Boolean(staffRoleId) &&
            member.roles.cache.has(staffRoleId);

        if (
            !isStaff &&
            !member.permissions.has(PermissionFlagsBits.ManageMessages)
        ) {
            return interaction.editReply({
                content: '❌ Only staff can publish announcements.'
            });
        }

        const title = interaction.options
            .getString('title', true)
            .trim();

        const message = interaction.options
            .getString('message', true)
            .trim();

        if (!title || title.length > MAX_TITLE_LENGTH) {
            return interaction.editReply({
                content:
                    `❌ The title must contain between 1 and ${MAX_TITLE_LENGTH} characters.`
            });
        }

        if (!message || message.length > MAX_MESSAGE_LENGTH) {
            return interaction.editReply({
                content:
                    `❌ The message must contain between 1 and ${MAX_MESSAGE_LENGTH} characters.`
            });
        }

        const channel = interaction.options.getChannel(
            'channel',
            true
        );

        if (
            channel.guildId !== interaction.guildId ||
            ![
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement
            ].includes(channel.type)
        ) {
            return interaction.editReply({
                content:
                    '❌ Select a text or announcement channel in this server.'
            });
        }

        const botMember = await interaction.guild.members.fetchMe();

        const permissions = channel.permissionsFor(botMember);

        if (!permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ])) {
            return interaction.editReply({
                content:
                    '❌ The bot needs View Channel, Send Messages and Embed Links permissions in that channel.'
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${TITLE_PREFIX}${title}`)
            .setDescription(message)
            .setColor(0xe53935)
            .setTimestamp()
            .setFooter({
                text: `Announcement by ${interaction.user.tag}`,
                ...(interaction.guild.iconURL()
                    ? { iconURL: interaction.guild.iconURL() }
                    : {})
            });

        let announcement;

        try {
            announcement = await channel.send({
                embeds: [embed],
                allowedMentions: {
                    parse: []
                }
            });
        } catch (error) {
            console.error('Error publishing announcement:', error);

            return interaction.editReply({
                content:
                    '❌ Could not publish the announcement. Check the bot channel permissions and try again.'
            });
        }

        return interaction.editReply({
            content:
                `✅ Announcement published in ${channel}!\n${announcement.url}`,
            allowedMentions: {
                parse: []
            }
        });
    }
};