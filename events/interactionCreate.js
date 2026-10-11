const { Events, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getEvents, saveEvents, buildEventEmbed, eventButtons, sendLog } = require('../utils/helpers');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      // 1. Executar Comandos de Barra (Slash Commands)
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        return await command.execute(interaction);
      }

      // 2. Gerir Botões
      if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Botões de Eventos (Going, Maybe, Not Going)
        if (customId.startsWith('ev_')) {
          await interaction.deferUpdate(); 
          
          const events = await getEvents();
          const ev = events[interaction.message.id];
          if (!ev || ev.cancelled) return interaction.followUp({ content: '❌ Inactive event.', flags: MessageFlags.Ephemeral });
          
          const uid = interaction.user.id;
          const choice = customId.replace('ev_', '');
          for (const k of ['going', 'maybe', 'no']) ev[k] = ev[k].filter(x => x !== uid);
          ev[choice].push(uid); 
          
          await saveEvents(events);

          if (process.env.EVENT_PARTICIPANT_ROLE_ID) {
            if (choice === 'going') await interaction.member.roles.add(process.env.EVENT_PARTICIPANT_ROLE_ID).catch(() => {});
            else await interaction.member.roles.remove(process.env.EVENT_PARTICIPANT_ROLE_ID).catch(() => {});
          }
          return interaction.editReply({ embeds: [buildEventEmbed(ev)], components: [eventButtons()] });
        }

        // Botão de Fechar Ticket
        if (customId === 'ticket_close') {
          if (!interaction.channel.topic?.startsWith('ticket:')) return;
          const isStaff = process.env.STAFF_ROLE_ID && interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID);
          const isOwner = interaction.user.id === interaction.channel.topic.split(':')[1];
          if (!isStaff && !isOwner && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '❌ Cannot close.', flags: MessageFlags.Ephemeral });
          
          await interaction.reply('🔒 Closing in 5s...');
          await sendLog(client, '🔒 Ticket Closed', `**Ticket:** ${interaction.channel.name}\n**Closed by:** <@${interaction.user.id}>`, 0xed4245);
          return setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }
      }

      // 3. Gerir Menus Dropdown (Select Menus)
      if (interaction.isStringSelectMenu()) {
        
        // NOVO: Dropdown de Cargos (Painel de Jogos)
        if (interaction.customId === 'role_select') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const roleMap = {
            'valorant': process.env.ROLE_VALORANT_ID,
            'brawlhalla': process.env.ROLE_BRAWLHALLA_ID,
            'cs2': process.env.ROLE_CS2_ID 
          };

          const selected = interaction.values;
          const memberRoles = interaction.member.roles;
          
          let added = [];
          let removed = [];

          for (const [game, roleId] of Object.entries(roleMap)) {
            if (!roleId) continue; 

            if (selected.includes(game)) {
              if (!memberRoles.cache.has(roleId)) {
                await memberRoles.add(roleId).catch(() => {});
                added.push(`<@&${roleId}>`);
              }
            } else {
              if (memberRoles.cache.has(roleId)) {
                await memberRoles.remove(roleId).catch(() => {});
                removed.push(`<@&${roleId}>`);
              }
            }
          }

          let replyMsg = '**Cargos atualizados!**\n';
          if (added.length > 0) replyMsg += `✅ Adicionado: ${added.join(', ')}\n`;
          if (removed.length > 0) replyMsg += `➖ Removido: ${removed.join(', ')}\n`;
          if (added.length === 0 && removed.length === 0) replyMsg = 'Nenhuma alteração feita aos teus cargos.';

          return interaction.editReply({ content: replyMsg });
        }

        // Dropdown de Criar Ticket
        if (interaction.customId === 'ticket_select') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
          const { guild, user } = interaction;
          const category = interaction.values[0];
          await interaction.message.edit({ components: interaction.message.components }).catch(() => {});

          if (guild.channels.cache.find(c => c.topic === `ticket:${user.id}`)) {
            return interaction.editReply({ content: '❌ You already have an open ticket.' });
          }

          const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
          const overwrites = [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, 
            { id: user.id, allow }, 
            { id: client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels] }
          ];
          if (process.env.STAFF_ROLE_ID) overwrites.push({ id: process.env.STAFF_ROLE_ID, allow });

          const channel = await guild.channels.create({ 
            name: `ticket-${category}-${user.username}`.slice(0, 90), 
            type: ChannelType.GuildText, 
            parent: process.env.TICKET_CATEGORY_ID || null, 
            topic: `ticket:${user.id}`, 
            permissionOverwrites: overwrites 
          });
          
          const embed = new EmbedBuilder().setTitle(`🎫 Ticket Opened - ${category.toUpperCase()}`).setDescription(`Hello ${user}! You selected **${category}**. Explain your issue.`).setColor(0x57f287);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
          await channel.send({ content: `${user}${process.env.STAFF_ROLE_ID ? ` <@&${process.env.STAFF_ROLE_ID}>` : ''}`, embeds: [embed], components: [row] });
          
          await sendLog(client, '🎫 Ticket Opened', `**Ticket:** ${channel}\n**Category:** ${category}\n**Opened by:** <@${user.id}>`, 0x57f287);
          return interaction.editReply({ content: `✅ Ticket created: ${channel}` });
        }
      }
    } catch (err) {
      console.error(err);
      const msg = { content: '❌ An error occurred.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  }
};