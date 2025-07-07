const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('definir_canal_sugestao')
        .setDescription('Define o canal onde aparecerá o botão de sugestões')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal onde será enviado o botão de sugestões')
                .setRequired(true)
        ),

    async execute(interaction, utils) {
        const { getGitHubFile, updateGitHubFile } = utils;
        
        const requiredRoleId = '1386195091164496033';
        if (!interaction.member.roles.cache.has(requiredRoleId)) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar este comando!',
                ephemeral: true
            });
        }

        const canal = interaction.options.getChannel('canal');
        
        if (canal.type !== 0) {
            return await interaction.reply({
                content: '❌ Por favor, selecione um canal de texto!',
                ephemeral: true
            });
        }

        try {
            let config = {};
            try {
                config = await getGitHubFile('config.json');
            } catch (error) {
                config = {};
            }

            config.suggestionChannelId = canal.id;
            config.guildId = interaction.guild.id;
            
            await updateGitHubFile('config.json', config);

            const button = new ButtonBuilder()
                .setCustomId('sugerir_app')
                .setLabel('Sugerir')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💡');

            const row = new ActionRowBuilder()
                .addComponents(button);

            const embed = new EmbedBuilder()
                .setTitle('📱 Sugestões de Apps')
                .setDescription('Sugira apps no botão abaixo!')
                .setColor('#00ff00')
                .setTimestamp();

            if (config.suggestionMessageId) {
                try {
                    const oldMessage = await canal.messages.fetch(config.suggestionMessageId);
                    await oldMessage.delete();
                } catch (error) {
                }
            }

            const message = await canal.send({
                embeds: [embed],
                components: [row]
            });

            config.suggestionMessageId = message.id;
            await updateGitHubFile('config.json', config);

            await interaction.reply({
                content: `✅ Canal de sugestões definido como ${canal}!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Erro ao definir canal de sugestão:', error);
            await interaction.reply({
                content: '❌ Erro ao definir o canal de sugestões!',
                ephemeral: true
            });
        }
    }
};