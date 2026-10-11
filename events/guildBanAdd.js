const { Events, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/helpers');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban, client) {
    let executor = 'Unknown';
    let reason = ban.reason || 'No reason provided';

    try {
      const fetchedLogs = await ban.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd,
      });
      const banLog = fetchedLogs.entries.first();

      if (banLog && banLog.target.id === ban.user.id) {
        executor = `<@${banLog.executor.id}>`;
        if (!ban.reason && banLog.reason) reason = banLog.reason;
      }
    } catch (err) {
      console.error('Error fetching audit logs for ban:', err);
    }

    await sendLog(
      client,
      '🔨 Member Banned',
      `**Member:** ${ban.user.tag} (<@${ban.user.id}>)\n**Banned by:** ${executor}\n**Reason:** ${reason}`,
      0x992d22 // Vermelho Escuro (Crimson)
    );
  }
};