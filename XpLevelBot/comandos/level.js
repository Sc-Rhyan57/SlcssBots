const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level-control')
        .setDescription('Controle o nível de um usuário (Apenas admins)')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para modificar o nível')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('acao')
                .setDescription('Ação a ser realizada')
                .setRequired(true)
                .addChoices(
                    { name: 'Adicionar Níveis', value: 'add' },
                    { name: 'Remover Níveis', value: 'remove' },
                    { name: 'Definir Nível', value: 'set' }
                )
        )
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Quantidade de níveis')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    async execute(interaction, utils) {
        const { getGitHubFile, updateGitHubFile, calculateXPForLevel, updateUserLevel, config } = utils;
        
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
        let newLevel;
        
        switch (action) {
            case 'add':
                newLevel = Math.min(100, userData[targetUser.id].level + amount);
                break;
            case 'remove':
                newLevel = Math.max(1, userData[targetUser.id].level - amount);
                break;
            case 'set':
                newLevel = Math.min(100, Math.max(1, amount));
                break;
        }
        
        userData[targetUser.id].level = newLevel;
        userData[targetUser.id].xp = calculateXPForLevel(newLevel);
        
        await updateUserLevel(interaction.guild, targetUser.id, newLevel, oldLevel);
        await updateGitHubFile('users.json', userData);
        
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Nível Modificado')
            .setDescription(`Nível de ${targetUser} foi alterado com sucesso!`)
            .addFields(
                { name: '👤 Usuário', value: targetUser.toString(), inline: true },
                { name: '🔧 Ação', value: action === 'add' ? 'Adicionado' : action === 'remove' ? 'Removido' : 'Definido', inline: true },
                { name: '📊 Quantidade', value: amount.toString(), inline: true },
                { name: '🏆 Nível Anterior', value: oldLevel.toString(), inline: true },
                { name: '🎯 Nível Atual', value: newLevel.toString(), inline: true },
                { name: '⚡ XP Atual', value: userData[targetUser.id].xp.toLocaleString(), inline: true }
            )
            .setColor('#ff9900')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};