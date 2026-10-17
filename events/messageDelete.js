const { Events, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/helpers');

module.exports = {
  name: Events.MessageDelete,
  async execute(message, client) {
    // Ignorar mensagens de bots ou DMs
    if (!message.guild || !message.author || message.author.bot) return;

    let executor = 'Unknown / Author';

    try {
      // Procurar nas Audit Logs quem apagou a mensagem
      const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete,
      });
      const deletionLog = fetchedLogs.entries.first();

      if (deletionLog) {
        const { executor: logExecutor, target, createdTimestamp } = deletionLog;
        // Se a log for muito recente e bater certo com o autor da mensagem apagada, foi a Staff
        if (target.id === message.author.id && Date.now() - createdTimestamp < 5000) {
          executor = `<@${logExecutor.id}>`;
        }
      }
    } catch (err) {
      console.error('Error fetching audit logs for deleted message:', err);
    }

    const content = message.content 
      ? (message.content.length > 1024 ? message.content.slice(0, 1021) + '...' : message.content) 
      : 'No text (Embed/Image/Attachment)';

    await sendLog(
      client,
      '🗑️ Message Deleted',
      `**Author:** <@${message.author.id}>\n**Channel:** <#${message.channel.id}>\n**Deleted by:** ${executor}\n**Content:**\n${content}`,
      0xffa500 // Laranja
    );
  }
};