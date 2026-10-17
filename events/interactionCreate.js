const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const { sendLog } = require('../utils/helpers');

const openingTickets = new Set();

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    try {
      // Executar comandos de barra.
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(
          interaction.commandName
        );

        if (!command) return;

        return await command.execute(interaction);
      }

      if (!interaction.inGuild()) return;

      // Fechar ticket.
      if (
        interaction.isButton() &&
        interaction.customId === 'ticket_close'
      ) {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });

        const topic = interaction.channel.topic;

        if (!topic?.startsWith('ticket:')) {
          return await interaction.editReply({
            content: '❌ This channel is not a ticket.'
          });
        }

        const member = await interaction.guild.members.fetch(
          interaction.user.id
        );

        const isStaff =
          Boolean(process.env.STAFF_ROLE_ID) &&
          member.roles.cache.has(process.env.STAFF_ROLE_ID);

        const isOwner =
          interaction.user.id === topic.split(':')[1];

        const canManageChannels = member.permissions.has(
          PermissionFlagsBits.ManageChannels
        );

        if (!isStaff && !isOwner && !canManageChannels) {
          return await interaction.editReply({
            content: '❌ You cannot close this ticket.'
          });
        }

        await interaction.editReply({
          content: '🔒 Closing in 5 seconds...'
        });

        const channel = interaction.channel;

        setTimeout(() => {
          channel.delete().catch(error => {
            console.error('Error deleting ticket:', error);
          });
        }, 5000);

        await sendLog(
          client,
          '🔒 Ticket Closing',
          `**Ticket:** ${channel.name}\n` +
          `**Closed by:** <@${interaction.user.id}>`,
          0xed4245
        );

        return;
      }

      // Criar ticket através do menu.
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'ticket_select'
      ) {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });

        const { guild, user } = interaction;
        const category = interaction.values[0];

        const allowedCategories = [
          'general',
          'partnership',
          'report'
        ];

        if (!allowedCategories.includes(category)) {
          return await interaction.editReply({
            content: '❌ Invalid ticket category.'
          });
        }

        const ticketKey = `${guild.id}:${user.id}`;

        if (openingTickets.has(ticketKey)) {
          return await interaction.editReply({
            content: '⏳ Your ticket is already being created.'
          });
        }

        // Evita criações simultâneas nesta instância do bot.
        openingTickets.add(ticketKey);

        try {
          const channels = await guild.channels.fetch();

          const existingTicket = channels.find(
            channel =>
              channel?.topic === `ticket:${user.id}`
          );

          if (existingTicket) {
            return await interaction.editReply({
              content:
                `❌ You already have an open ticket: ${existingTicket}`
            });
          }

          const allow = [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ];

          const permissionOverwrites = [
            {
              id: guild.id,
              deny: [
                PermissionFlagsBits.ViewChannel
              ]
            },
            {
              id: user.id,
              allow
            },
            {
              id: client.user.id,
              allow: [
                ...allow,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.EmbedLinks
              ]
            }
          ];

          if (process.env.STAFF_ROLE_ID) {
            permissionOverwrites.push({
              id: process.env.STAFF_ROLE_ID,
              allow
            });
          }

          const channel = await guild.channels.create({
            name: `ticket-${category}-${user.username}`
              .slice(0, 90),
            type: ChannelType.GuildText,
            parent:
              process.env.TICKET_CATEGORY_ID || null,
            topic: `ticket:${user.id}`,
            permissionOverwrites
          });

          const embed = new EmbedBuilder()
            .setTitle(
              `🎫 Ticket Opened - ${category.toUpperCase()}`
            )
            .setDescription(
              `Hello ${user}! You selected **${category}**. Explain your issue.`
            )
            .setColor(0x57f287);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_close')
              .setLabel('Close Ticket')
              .setEmoji('🔒')
              .setStyle(ButtonStyle.Danger)
          );

          try {
            await channel.send({
              content:
                `${user}` +
                (
                  process.env.STAFF_ROLE_ID
                    ? ` <@&${process.env.STAFF_ROLE_ID}>`
                    : ''
                ),
              embeds: [embed],
              components: [row],
              allowedMentions: {
                users: [user.id],
                roles: process.env.STAFF_ROLE_ID
                  ? [process.env.STAFF_ROLE_ID]
                  : []
              }
            });
          } catch (error) {
            console.error(
              'Error sending ticket welcome message:',
              error
            );

            return await interaction.editReply({
              content:
                `⚠️ Ticket created: ${channel}, but the welcome message could not be sent. Please contact staff.`
            });
          }

          await sendLog(
            client,
            '🎫 Ticket Opened',
            `**Ticket:** ${channel}\n` +
            `**Category:** ${category}\n` +
            `**Opened by:** <@${user.id}>`,
            0x57f287
          );

          return await interaction.editReply({
            content: `✅ Ticket created: ${channel}`
          });
        } finally {
          openingTickets.delete(ticketKey);
        }
      }
    } catch (error) {
      console.error('Interaction error:', error);

      const content = '❌ An error occurred.';

      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({ content });
        } else if (interaction.replied) {
          await interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({
            content,
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (responseError) {
        console.error(
          'Error sending interaction error response:',
          responseError
        );
      }
    }
  }
};