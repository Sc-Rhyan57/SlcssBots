const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Veja o ranking dos usuários por nível'),

    async execute(interaction, utils) {
        const { getGitHubFile } = utils;
        
        const userData = await getGitHubFile('users.json');
        
        const sortedUsers = Object.entries(userData)
            .sort(([,a], [,b]) => b.xp - a.xp)
            .slice(0, 10);
        
        if (sortedUsers.length === 0) {
            return await interaction.reply({
                content: 'Ainda não há usuários no ranking!',
                ephemeral: true
            });
        }
        
        let description = '';
        const medals = ['🥇', '🥈', '🥉'];
        
        for (let i = 0; i < sortedUsers.length; i++) {
            const [userId, stats] = sortedUsers[i];
            const user = await interaction.client.users.fetch(userId).catch(() => null);
            const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
            const username = user ? user.displayName : 'Usuário Desconhecido';
            
            description += `${medal} ${username}\n`;
            description += `📊 Level **${stats.level}** • ⚡ **${stats.xp.toLocaleString()}** XP\n\n`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Ranking de Níveis')
            .setDescription(description)
            .setColor('#ffd700')
            .setFooter({ text: `Top ${sortedUsers.length} usuários` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};