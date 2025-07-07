const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const REQUIRED_ROLE_ID = '1386195091164496033';
const POST_CHANNEL_ID = '1383941238620684369';
const MENTION_ROLE_ID = '1375908560256499733';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post-app')
        .setDescription('Posta um app no canal')
        .addStringOption(option =>
            option
                .setName('link1')
                .setDescription('Link principal do app (obrigatório)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('link2')
                .setDescription('Link secundário do app (opcional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('link3')
                .setDescription('Link terciário do app (opcional)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const member = interaction.member;
        
        if (!member.permissions.has(PermissionFlagsBits.Administrator) || !member.roles.cache.has(REQUIRED_ROLE_ID)) {
            return await interaction.reply({ 
                content: '❌ Você não tem permissão para usar este comando!', 
                ephemeral: true 
            });
        }

        const link1 = interaction.options.getString('link1');
        const link2 = interaction.options.getString('link2');
        const link3 = interaction.options.getString('link3');

        const modal = new ModalBuilder()
            .setCustomId(`app_modal_${Date.now()}`)
            .setTitle('Informações do App');

        const nameInput = new TextInputBuilder()
            .setCustomId('app_name')
            .setLabel('Nome do App')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const imageInput = new TextInputBuilder()
            .setCustomId('app_image')
            .setLabel('Link da Imagem do App')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('https://exemplo.com/imagem.png');

        const descriptionInput = new TextInputBuilder()
            .setCustomId('app_description')
            .setLabel('Descrição do App')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

        const colorInput = new TextInputBuilder()
            .setCustomId('app_color')
            .setLabel('Cor da Borda (hex)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('#0099ff ou 0099ff')
            .setMaxLength(7);

        const row1 = new ActionRowBuilder().addComponents(nameInput);
        const row2 = new ActionRowBuilder().addComponents(imageInput);
        const row3 = new ActionRowBuilder().addComponents(descriptionInput);
        const row4 = new ActionRowBuilder().addComponents(colorInput);

        modal.addComponents(row1, row2, row3, row4);

        const linksData = {
            link1: link1,
            link2: link2,
            link3: link3
        };

        interaction.client.appModalData = interaction.client.appModalData || new Map();
        interaction.client.appModalData.set(interaction.user.id, linksData);

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const appName = interaction.fields.getTextInputValue('app_name');
            const appImage = interaction.fields.getTextInputValue('app_image');
            const appDescription = interaction.fields.getTextInputValue('app_description');
            const appColor = interaction.fields.getTextInputValue('app_color') || '#0099ff';

            const linksData = interaction.client.appModalData.get(interaction.user.id);
            
            if (!linksData) {
                return await interaction.editReply({ content: '❌ Dados dos links não encontrados!' });
            }

            const links = [];
            
            if (linksData.link1) {
                links.push({ label: 'DOWNLOAD 🔗', url: linksData.link1 });
            }
            
            if (linksData.link2) {
                links.push({ label: 'LINK 2 🔗', url: linksData.link2 });
            }
            
            if (linksData.link3) {
                links.push({ label: 'LINK 3 🔗', url: linksData.link3 });
            }

            const channel = interaction.guild.channels.cache.get(POST_CHANNEL_ID);
            if (!channel) {
                return await interaction.editReply({ content: '❌ Canal de postagem não encontrado!' });
            }

            const webhook = await channel.createWebhook({
                name: `${appName} : Sluccs Community`,
                avatar: appImage,
                reason: `Webhook criado para o app ${appName}`
            });

            // Validar e processar cor
            let embedColor = '#0099ff';
            if (appColor.trim()) {
                const colorValue = appColor.startsWith('#') ? appColor : `#${appColor}`;
                if (/^#[0-9A-F]{6}$/i.test(colorValue)) {
                    embedColor = colorValue;
                }
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: appName, iconURL: appImage })
                .setDescription(appDescription)
                .setThumbnail(appImage)
                .setColor(embedColor)
                .setTimestamp();

            const buttons = [];
            links.forEach(link => {
                buttons.push(
                    new ButtonBuilder()
                        .setLabel(link.label)
                        .setStyle(ButtonStyle.Link)
                        .setURL(link.url)
                );
            });

            // Adicionar botão não clicável com nome do usuário
            buttons.push(
                new ButtonBuilder()
                    .setLabel(`Enviado por: ${interaction.user.displayName}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setCustomId('sender_info')
                    .setDisabled(true)
            );

            const actionRows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                actionRows.push(row);
            }

            await webhook.send({
                content: `<@&${MENTION_ROLE_ID}>`,
                embeds: [embed],
                components: actionRows
            });

            await webhook.delete();

            interaction.client.appModalData.delete(interaction.user.id);

            await interaction.editReply({ content: '✅ App postado com sucesso!' });

        } catch (error) {
            console.error('Erro ao postar app:', error);
            await interaction.editReply({ content: '❌ Erro ao postar o app!' });
        }
    }
};

// Função removida - não mais necessária