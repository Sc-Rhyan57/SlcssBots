const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function handleSuggestionInteraction(interaction, utils) {
    const { getGitHubFile, updateGitHubFile } = utils;

    if (interaction.customId === 'sugerir_app') {
        const modal = new ModalBuilder()
            .setCustomId('suggestion_modal')
            .setTitle('Sugerir App');

        const nameInput = new TextInputBuilder()
            .setCustomId('app_name')
            .setLabel('Nome do App')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder('Ex: Discord, WhatsApp, Instagram...');

        const linkInput = new TextInputBuilder()
            .setCustomId('app_link')
            .setLabel('Link do App (Opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200)
            .setPlaceholder('Ex: https://play.google.com/store/apps/...');

        const nameRow = new ActionRowBuilder().addComponents(nameInput);
        const linkRow = new ActionRowBuilder().addComponents(linkInput);

        modal.addComponents(nameRow, linkRow);

        await interaction.showModal(modal);
    }
    
    else if (interaction.customId === 'suggestion_modal') {
        await interaction.deferReply({ ephemeral: true });

        const appName = interaction.fields.getTextInputValue('app_name');
        const appLink = interaction.fields.getTextInputValue('app_link') || 'Não informado';

        try {
            const suggestionChannelId = '1376328774630768701';
            const mentionUserId = '896604349311115304';
            
            const channel = await interaction.client.channels.fetch(suggestionChannelId);
            
            if (!channel) {
                return await interaction.editReply({
                    content: '❌ Canal de sugestões não encontrado!'
                });
            }

            const suggestionEmbed = new EmbedBuilder()
                .setTitle('📱 Nova Sugestão de App!')
                .addFields(
                    { name: '📋 Nome do App', value: appName, inline: true },
                    { name: '🔗 Link', value: appLink, inline: true },
                    { name: '👤 Sugerido por', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setColor('#ff6b35')
                .setTimestamp()
                .setFooter({ text: 'Sistema de Sugestões' });

            const acceptButton = new ButtonBuilder()
                .setCustomId(`accept_suggestion_${interaction.user.id}`)
                .setLabel('ACEITAR')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');

            const denyButton = new ButtonBuilder()
                .setCustomId(`deny_suggestion_${interaction.user.id}`)
                .setLabel('NEGAR')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌');

            const buttonRow = new ActionRowBuilder()
                .addComponents(acceptButton, denyButton);

            await channel.send({
                content: `<@${mentionUserId}> **NOVA SUGESTÃO!**`,
                embeds: [suggestionEmbed],
                components: [buttonRow]
            });

            await interaction.editReply({
                content: '✅ Sua sugestão foi enviada com sucesso!'
            });

        } catch (error) {
            console.error('Erro ao enviar sugestão:', error);
            await interaction.editReply({
                content: '❌ Erro ao enviar a sugestão!'
            });
        }
    }

    else if (interaction.customId.startsWith('accept_suggestion_') || interaction.customId.startsWith('deny_suggestion_')) {
        const requiredRoleId = '1386195091164496033';
        if (!interaction.member.roles.cache.has(requiredRoleId)) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar esta ação!',
                ephemeral: true
            });
        }

        const isAccept = interaction.customId.startsWith('accept_suggestion_');
        const userId = interaction.customId.split('_')[2];

        const modal = new ModalBuilder()
            .setCustomId(`${isAccept ? 'accept' : 'deny'}_modal_${userId}`)
            .setTitle(isAccept ? 'Aceitar Sugestão' : 'Negar Sugestão');

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel(isAccept ? 'Por que você está aceitando?' : 'Por que você está negando?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
            .setPlaceholder(isAccept ? 'Explique por que a sugestão foi aceita...' : 'Explique por que a sugestão foi negada...');

        const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(reasonRow);

        await interaction.showModal(modal);
    }

    else if (interaction.customId.startsWith('accept_modal_') || interaction.customId.startsWith('deny_modal_')) {
        await interaction.deferReply({ ephemeral: true });

        const isAccept = interaction.customId.startsWith('accept_modal_');
        const userId = interaction.customId.split('_')[2];
        const reason = interaction.fields.getTextInputValue('reason');

        try {
            const user = await interaction.client.users.fetch(userId);
            
            const dmEmbed = new EmbedBuilder()
                .setTitle(isAccept ? '✅ Sugestão Aceita!' : '❌ Sugestão Negada')
                .setDescription(`**Moderador:** ${interaction.user.tag}\n**Motivo:** ${reason}`)
                .setColor(isAccept ? '#00ff00' : '#ff0000')
                .setTimestamp();

            await user.send({ embeds: [dmEmbed] });

            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = new EmbedBuilder()
                .setTitle(originalEmbed.title)
                .setFields(originalEmbed.fields)
                .addFields({ name: isAccept ? '✅ Status' : '❌ Status', value: isAccept ? 'ACEITA' : 'NEGADA', inline: true })
                .addFields({ name: '👮 Moderador', value: `<@${interaction.user.id}>`, inline: true })
                .addFields({ name: '📝 Motivo', value: reason, inline: false })
                .setColor(isAccept ? '#00ff00' : '#ff0000')
                .setTimestamp();

            await interaction.message.edit({
                embeds: [updatedEmbed],
                components: []
            });

            await interaction.editReply({
                content: `✅ Sugestão ${isAccept ? 'aceita' : 'negada'} e usuário notificado!`
            });

        } catch (error) {
            console.error('Erro ao processar resposta da sugestão:', error);
            await interaction.editReply({
                content: '❌ Erro ao processar a resposta da sugestão!'
            });
        }
    }
}

async function setupSuggestionMessage(client, utils) {
    const { getGitHubFile, updateGitHubFile } = utils;
    
    try {
        const config = await getGitHubFile('config.json');
        
        if (!config.suggestionChannelId) {
            return;
        }

        const channel = await client.channels.fetch(config.suggestionChannelId);
        if (!channel) return;

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

        const message = await channel.send({
            embeds: [embed],
            components: [row]
        });

        config.suggestionMessageId = message.id;
        await updateGitHubFile('config.json', config);
    } catch (error) {
        console.error('Erro ao configurar mensagem de sugestão:', error);
    }
}

module.exports = {
    handleSuggestionInteraction,
    setupSuggestionMessage
};