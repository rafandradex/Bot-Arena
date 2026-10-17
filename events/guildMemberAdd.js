const {
  Events,
  AttachmentBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');

const { sendLog } = require('../utils/helpers');

function parseRoleIds(value) {
  return [
    ...new Set(
      (value || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    )
  ];
}

async function assignAutomaticRoles(member) {
  const roleIds = member.user.bot
    ? parseRoleIds(process.env.BOT_ROLE_IDS)
    : parseRoleIds(process.env.AUTO_ROLE_IDS);

  if (roleIds.length === 0) return;

  try {
    const botMember = await member.guild.members.fetchMe();
    const guildRoles = await member.guild.roles.fetch();

    const canManageRoles = botMember.permissions.has(
      PermissionFlagsBits.ManageRoles
    );

    const failures = [];
    const assignableRoles = [];

    for (const roleId of roleIds) {
      const role = guildRoles.get(roleId);

      if (!role) {
        failures.push(`Cargo inexistente: \`${roleId}\`.`);
        continue;
      }

      if (member.roles.cache.has(roleId)) continue;

      if (role.id === member.guild.id) {
        failures.push('Não é possível atribuir @everyone.');
        continue;
      }

      if (role.managed) {
        failures.push(
          `${role.name}: cargo gerido por uma integração.`
        );
        continue;
      }

      if (!canManageRoles) {
        failures.push(
          `${role.name}: falta a permissão Manage Roles.`
        );
        continue;
      }

      if (botMember.roles.highest.comparePositionTo(role) <= 0) {
        failures.push(
          `${role.name}: deve estar abaixo do cargo mais alto do bot.`
        );
        continue;
      }

      assignableRoles.push(role);
    }

    // Tenta atribuir cada cargo individualmente.
    for (const role of assignableRoles) {
      try {
        await member.roles.add(
          role.id,
          'Automatic role on joining'
        );
      } catch (error) {
        console.error(
          `Failed to assign auto-role ${role.id} to ${member.id}:`,
          error
        );

        failures.push(
          `${role.name}: o Discord recusou a atribuição.`
        );
      }
    }

    if (failures.length > 0) {
      console.warn(
        `Auto-role failures for member ${member.id}:`,
        failures
      );

      const details = (
        `**Member:** <@${member.id}>\n\n` +
        failures.map(reason => `• ${reason}`).join('\n')
      ).slice(0, 4000);

      await sendLog(
        member.client,
        '⚠️ Auto-role Failed',
        details,
        0xed4245
      );
    }
  } catch (error) {
    console.error(
      `Error preparing auto-roles for ${member.id}:`,
      error
    );

    await sendLog(
      member.client,
      '⚠️ Auto-role Error',
      `Could not prepare automatic roles for <@${member.id}>. Check the bot permissions and console logs.`,
      0xed4245
    );
  }
}

function fitText(context, text, maxWidth, startingSize, minimumSize) {
  let fontSize = startingSize;

  context.font = `bold ${fontSize}px sans-serif`;

  while (
    context.measureText(text).width > maxWidth &&
    fontSize > minimumSize
  ) {
    fontSize--;
    context.font = `bold ${fontSize}px sans-serif`;
  }

  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  const characters = Array.from(text);

  while (
    characters.length > 0 &&
    context.measureText(`${characters.join('')}…`).width > maxWidth
  ) {
    characters.pop();
  }

  return `${characters.join('')}…`;
}

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member) {
    // Uma falha nos cargos não impede as boas-vindas.
    await assignAutomaticRoles(member);

    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;

    if (!welcomeChannelId) return;

    let channel;

    try {
      channel = await member.guild.channels.fetch(
        welcomeChannelId
      );
    } catch (error) {
      console.error(
        'Error fetching welcome channel:',
        error
      );
    }

    if (
      !channel ||
      !channel.isTextBased() ||
      typeof channel.send !== 'function'
    ) {
      console.warn(
        `Welcome channel unavailable: ${welcomeChannelId}`
      );

      await sendLog(
        member.client,
        '⚠️ Welcome Channel Error',
        'The configured welcome channel is unavailable or does not support messages.',
        0xed4245
      );

      return;
    }

    const allowedMentions = {
      users: [member.id],
      roles: [],
      parse: []
    };

    try {
      const canvas = createCanvas(700, 250);
      const context = canvas.getContext('2d');

      // Fundo.
      try {
        const background = await loadImage(
          path.join(__dirname, '../assets/welcome.jpg')
        );

        context.drawImage(
          background,
          0,
          0,
          canvas.width,
          canvas.height
        );
      } catch {
        context.fillStyle = '#2b2d31';

        context.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      // Camada escura para facilitar a leitura.
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const textX = 225;
      const textWidth = canvas.width - textX - 25;

      // Título ajustado à largura disponível.
      context.fillStyle = '#ffffff';

      const title = fitText(
        context,
        'WELCOME TO GLITCH ARENA',
        textWidth,
        36,
        20
      );

      context.fillText(title, textX, 90);

      // Nome do membro.
      context.fillStyle = '#57f287';

      const displayName = fitText(
        context,
        member.user.displayName || member.user.username,
        textWidth,
        32,
        20
      );

      context.fillText(displayName, textX, 140);

      // Número de membros.
      context.font = '22px sans-serif';
      context.fillStyle = '#aaaaaa';

      context.fillText(
        `Member #${member.guild.memberCount}`,
        textX,
        180
      );

      // Avatar circular.
      const avatarUrl = member.user.displayAvatarURL({
        extension: 'png',
        size: 256
      });

      const avatar = await loadImage(avatarUrl);

      context.save();
      context.beginPath();
      context.arc(125, 125, 75, 0, Math.PI * 2);
      context.closePath();
      context.clip();

      context.drawImage(
        avatar,
        50,
        50,
        150,
        150
      );

      context.restore();

      const attachment = new AttachmentBuilder(
        await canvas.encode('png'),
        { name: 'welcome-image.png' }
      );

      await channel.send({
        content: `🎉 Look who arrived, ${member}!`,
        files: [attachment],
        allowedMentions
      });
    } catch (error) {
      console.error(
        'Error generating or sending welcome image:',
        error
      );

      // Alternativa em texto se a imagem falhar.
      try {
        await channel.send({
          content:
            `🎉 Welcome to **Glitch Arena**, ${member}! ` +
            `You are member #${member.guild.memberCount}!`,
          allowedMentions
        });
      } catch (fallbackError) {
        console.error(
          'Error sending welcome fallback:',
          fallbackError
        );

        await sendLog(
          member.client,
          '⚠️ Welcome Message Failed',
          `Could not send a welcome message for <@${member.id}>. Check the welcome channel permissions.`,
          0xed4245
        );
      }
    }
  }
};