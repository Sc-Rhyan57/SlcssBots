const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Veja as informações de XP e nível')
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Usuário para verificar (opcional)')
                .setRequired(false)
        ),

    async execute(interaction, utils) {
        const { getGitHubFile, calculateXPForLevel } = utils;
        
        // Pegar o usuário (mencionado ou quem executou o comando)
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const userData = await getGitHubFile('users.json');
        
        // Verificar se o usuário tem dados
        if (!userData[targetUser.id]) {
            const isOwn = targetUser.id === interaction.user.id;
            return await interaction.reply({
                content: `${isOwn ? 'Você ainda não possui' : `${targetUser.displayName} ainda não possui`} dados no sistema!`,
                ephemeral: true
            });
        }
        
        const userStats = userData[targetUser.id];
        const currentLevel = userStats.level;
        const currentXP = userStats.xp;
        
        // Calcular XP necessário para o próximo nível
        const xpForCurrentLevel = calculateXPForLevel(currentLevel);
        const xpForNextLevel = calculateXPForLevel(currentLevel + 1);
        const xpNeededForNext = xpForNextLevel - currentXP;
        const xpProgressInLevel = currentXP - xpForCurrentLevel;
        const xpRequiredForLevel = xpForNextLevel - xpForCurrentLevel;
        
        // Calcular progresso em porcentagem
        const progressPercentage = Math.floor((xpProgressInLevel / xpRequiredForLevel) * 100);
        
        // Criar barra de progresso visual
        const progressBar = createProgressBar(progressPercentage);
        
        // Buscar posição no ranking
        const allUsers = Object.entries(userData)
            .sort(([,a], [,b]) => b.xp - a.xp);
        const userRank = allUsers.findIndex(([userId]) => userId === targetUser.id) + 1;
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 Informações de XP`)
            .setDescription(`**${targetUser.displayName}**`)
            .addFields(
                { 
                    name: '🏆 Nível Atual', 
                    value: `**${currentLevel}**`, 
                    inline: true 
                },
                { 
                    name: '⚡ XP Total', 
                    value: `**${currentXP.toLocaleString()}**`, 
                    inline: true 
                },
                { 
                    name: '📈 Ranking', 
                    value: `**#${userRank}**`, 
                    inline: true 
                },
                { 
                    name: '🎯 Progresso para o Próximo Nível', 
                    value: `${progressBar}\n**${xpProgressInLevel.toLocaleString()}** / **${xpRequiredForLevel.toLocaleString()}** XP (${progressPercentage}%)`, 
                    inline: false 
                },
                { 
                    name: '🚀 XP Necessário', 
                    value: `**${xpNeededForNext.toLocaleString()}** XP para o nível **${currentLevel + 1}**`, 
                    inline: false 
                }
            )
            .setColor(getLevelColor(currentLevel))
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ text: `Level ${currentLevel} • ${currentXP.toLocaleString()} XP Total` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};

// Função para criar barra de progresso visual
function createProgressBar(percentage) {
    const totalBars = 20;
    const filledBars = Math.floor((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    
    const filled = '█'.repeat(filledBars);
    const empty = '░'.repeat(emptyBars);
    
    return `[${filled}${empty}]`;
}

// Função para definir cor baseada no nível
function getLevelColor(level) {
    if (level <= 20) return '#808080'; // Cinza
    if (level <= 40) return '#00ff00'; // Verde
    if (level <= 60) return '#0099ff'; // Azul
    if (level <= 80) return '#9966cc'; // Roxo
    return '#ffd700'; // Dourado
}