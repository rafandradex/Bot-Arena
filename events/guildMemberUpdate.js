const { Events, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/helpers');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    // Se o Timestamp do Timeout (CommunicationDisabledUntil) mudou
    if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
      let executor = 'Unknown';
      let reason = 'No reason provided';

      try {
        const fetchedLogs = await newMember.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberUpdate,
        });
        const updateLog = fetchedLogs.entries.first();

        // Verificar se a log é recente e sobre este membro
        if (updateLog && updateLog.target.id === newMember.id && Date.now() - updateLog.createdTimestamp < 5000) {
          executor = `<@${updateLog.executor.id}>`;
          if (updateLog.reason) reason = updateLog.reason;
        }
      } catch (err) {
        console.error('Error fetching audit logs for timeout:', err);
      }

      // Se o utilizador recebeu um Mute (data do timeout é no futuro)
      if (newMember.communicationDisabledUntilTimestamp > Date.now()) {
        const until = Math.floor(newMember.communicationDisabledUntilTimestamp / 1000);
        await sendLog(
          client,
          '🔇 Member Muted (Timeout)',
          `**Member:** <@${newMember.id}>\n**Muted by:** ${executor}\n**Until:** <t:${until}:F> (<t:${until}:R>)\n**Reason:** ${reason}`,
          0xfee75c // Amarelo
        );
      } 
      // Se a Staff removeu o Mute antecipadamente (ou se ele expirou)
      else if (oldMember.communicationDisabledUntilTimestamp > Date.now() && !newMember.communicationDisabledUntilTimestamp) {
        await sendLog(
          client,
          '🔊 Member Unmuted',
          `**Member:** <@${newMember.id}>\n**Action by:** ${executor}`,
          0x57f287 // Verde
        );
      }
    }
  }
};