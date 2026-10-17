const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    escapeMarkdown
} = require('discord.js');

const cooldowns = new Map();

const COOLDOWN_MS = 60_000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Submit a suggestion to the server')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('Your suggestion')
                .setMinLength(5)
                .setMaxLength(2000)
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

        const text = interaction.options.getString('text').trim();

        if (text.length < 5) {
            return interaction.editReply({
                content: '❌ Your suggestion must contain at least 5 characters.'
            });
        }

        const channelId = process.env.SUGGESTIONS_CHANNEL_ID?.trim();

        if (!channelId) {
            return interaction.editReply({
                content:
                    '❌ The suggestions channel has not been configured. Please contact staff.'
            });
        }

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const now = Date.now();
        const availableAt = cooldowns.get(key) || 0;

        if (availableAt > now) {
            const seconds = Math.ceil(
                (availableAt - now) / 1000
            );

            return interaction.editReply({
                content:
                    `⏳ Wait ${seconds} second(s) before sending another suggestion.`
            });
        }

        // Reserva o intervalo antes das operações assíncronas.
        const reservation = now + COOLDOWN_MS;
        cooldowns.set(key, reservation);

        const cleanupTimer = setTimeout(() => {
            if (cooldowns.get(key) === reservation) {
                cooldowns.delete(key);
            }
        }, COOLDOWN_MS);

        cleanupTimer.unref();

        let sent = false;

        try {
            // Procura apenas dentro deste servidor.
            const channel = await interaction.guild.channels
                .fetch(channelId)
                .catch(() => null);

            if (
                !channel ||
                channel.type !== ChannelType.GuildText
            ) {
                return await interaction.editReply({
                    content:
                        '❌ The suggestions channel is unavailable or is not a text channel. Please contact staff.'
                });
            }

            const botMember = await interaction.guild.members.fetchMe();
            const permissions = channel.permissionsFor(botMember);

            if (!permissions?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return await interaction.editReply({
                    content:
                        '❌ The bot cannot publish suggestions in the configured channel. Please contact staff.'
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('💡 New Suggestion')
                .setDescription(escapeMarkdown(text))
                .setColor(0xfee75c)
                .setAuthor({
                    name: interaction.user.tag,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setFooter({
                    text: 'Glitch Arena • Community Suggestions'
                })
                .setTimestamp();

            const message = await channel.send({
                embeds: [embed],
                allowedMentions: {
                    parse: []
                }
            });

            sent = true;

            // Uma falha nas reações não invalida a sugestão enviada.
            let votingAvailable = true;

            try {
                await message.react('👍');
                await message.react('👎');
            } catch (error) {
                votingAvailable = false;

                console.error(
                    'Error adding suggestion reactions:',
                    error
                );
            }

            return await interaction.editReply({
                content:
                    `✅ Suggestion sent to ${channel}!\n${message.url}` +
                    (
                        votingAvailable
                            ? ''
                            : '\n⚠️ Voting reactions could not be added. Please notify staff.'
                    )
            });
        } catch (error) {
            console.error('Error submitting suggestion:', error);

            return await interaction.editReply({
                content: sent
                    ? '⚠️ Your suggestion was published, but an error occurred afterwards. Check the suggestions channel before trying again.'
                    : '❌ Could not send your suggestion. Please try again later.'
            });
        } finally {
            // Não penaliza o membro se a sugestão não foi publicada.
            if (!sent) {
                clearTimeout(cleanupTimer);

                if (cooldowns.get(key) === reservation) {
                    cooldowns.delete(key);
                }
            }
        }
    }
};