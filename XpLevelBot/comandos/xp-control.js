const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp-control')
        .setDescription('Controle o XP de um usuário (Apenas admins)')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para modificar o XP')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('acao')
                .setDescription('Ação a ser realizada')
                .setRequired(true)
                .addChoices(
                    { name: 'Adicionar XP', value: 'add' },
                    { name: 'Remover XP', value: 'remove' },
                    { name: 'Definir XP', value: 'set' }
                )
        )
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Quantidade de XP')
                .setRequired(true)
                .setMinValue(0)
        ),

    async execute(interaction, utils) {
        const { getGitHubFile, updateGitHubFile, calculateLevelFromXP, updateUserLevel, config } = utils;
        
        const hasPermission = interaction.member.roles.cache.some(role => 
            config.adminRoles.includes(role.id)
        ) || interaction.member.permissions.has('Administrator');
        
        if (!hasPermission) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar este comando!',
                ephemeral: true
            });
        }
        
        const targetUser = interaction.options.getUser('usuario');
        const action = interaction.options.getString('acao');
        const amount = interaction.options.getInteger('quantidade');
        
        const userData = await getGitHubFile('users.json');
        
        if (!userData[targetUser.id]) {
            userData[targetUser.id] = { xp: 0, level: 1 };
        }
        
        const oldLevel = userData[targetUser.id].level;
        const oldXP = userData[targetUser.id].xp;
        
        switch (action) {
            case 'add':
                userData[targetUser.id].xp += amount;
                break;
            case 'remove':
                userData[targetUser.id].xp = Math.max(0, userData[targetUser.id].xp - amount);
                break;
            case 'set':
                userData[targetUser.id].xp = amount;
                break;
        }
        
        const newLevel = calculateLevelFromXP(userData[targetUser.id].xp);
        userData[targetUser.id].level = newLevel;
        
        if (newLevel !== oldLevel) {
            await updateUserLevel(interaction.guild, targetUser.id, newLevel, oldLevel);
        }
        
        await updateGitHubFile('users.json', userData);
        
        const embed = new EmbedBuilder()
            .setTitle('⚙️ XP Modificado')
            .setDescription(`XP de ${targetUser} foi alterado com sucesso!`)
            .addFields(
                { name: '👤 Usuário', value: targetUser.toString(), inline: true },
                { name: '🔧 Ação', value: action === 'add' ? 'Adicionado' : action === 'remove' ? 'Removido' : 'Definido', inline: true },
                { name: '⚡ Quantidade', value: amount.toLocaleString(), inline: true },
                { name: '📊 XP Anterior', value: oldXP.toLocaleString(), inline: true },
                { name: '📈 XP Atual', value: userData[targetUser.id].xp.toLocaleString(), inline: true },
                { name: '🏆 Nível', value: `${oldLevel} → ${newLevel}`, inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};