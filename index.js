/**
 * Living Characters & Anti-Slop Engine for SillyTavern
 * Security & Privacy Guarantee:
 * - Zero external network requests (no fetch, no XMLHttpRequest, no WebSockets).
 * - Zero access to API keys, tokens, or browser credentials.
 * - Uses exclusively SillyTavern.getContext() local APIs.
 */

const MODULE_NAME = 'living_anti_slop';
const PROMPT_KEY = 'las_behavior_injection';

const EXTENSION_PROMPT_TYPES = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
};

const EXTENSION_PROMPT_ROLES = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

const DEFAULT_SLOP_LIST = [
    'костяшки побелели',
    'побелевшие костяшки',
    'до побеления костяшек',
    'запах озона',
    'запахом озона',
    'аромат бергамота',
    'электрический разряд',
    'ток пробежал',
    'мурашки по коже',
    'хриплым шепотом',
    'хриплый шепот',
    'опасно сузил глаза',
    'глаза потемнели',
    'взгляд потемнел',
    'прижал к стене',
    'прижала к стене',
    'взял за подбородок',
    'подцепил подбородок',
    'прикусил губу до крови',
    'сбитое дыхание',
    'затаил дыхание',
    'звенящая тишина',
    'тишина стала осязаемой',
    'играли желваки',
    'хищная ухмылка',
    'кривая усмешка',
    'полуулыбка',
    'бархатный баритон',
    'сталь в голосе',
    'металл в голосе',
    'это не просто',
    'и, возможно, только возможно',
];

const DEFAULT_BOSSY_LIST = [
    'иди спать',
    'марш в кровать',
    'марш спать',
    'быстро спать',
    'садись и рассказывай',
    'сядь и расскажи',
    'сядь и выслушай',
    'пей давай',
    'ешь давай',
    'не спорь со мной',
    'прекрати спорить',
    'делай как я сказал',
    'делай, что говорят',
    'сиди смирно',
    'давай без глупостей',
];

const DEFAULT_TACTILE_SPAM = [
    'коснулся щеки',
    'погладил по щеке',
    'погладил по голове',
    'потрепал по волосам',
    'перехватил запястье',
    'сжал запястье',
    'взял за подбородок',
    'провел большим пальцем по губе',
];

const DEFAULT_SETTINGS = {
    enabled: true,
    antiSlopPrompt: true,
    antiBossy: true,
    livingDynamics: true,
    fullBodyTactile: true,
    intimacyMode: 'slowburn',
    promptDepth: 0,
    hideStreaming: true,
    autoSurgeon: true,
    slopList: DEFAULT_SLOP_LIST.join('\n'),
    bossyList: DEFAULT_BOSSY_LIST.join('\n'),
};

let isRewriting = false;
let activeModalTab = 'slopList';

function getSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    const settings = context.extensionSettings[MODULE_NAME];
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        if (typeof settings[key] !== typeof defaultValue) {
            settings[key] = defaultValue;
        }
    }
    return settings;
}

function parsePhraseList(rawText) {
    return String(rawText || '')
        .split('\n')
        .map(line => line.trim().toLowerCase())
        .filter(Boolean);
}

function getExternalRelationshipData() {
    const context = SillyTavern.getContext();
    const tracker = context.chatMetadata?.relationship_tracker;
    if (!tracker || typeof tracker !== 'object') {
        return null;
    }
    return {
        role: String(tracker.role || ''),
        satisfaction: Number.isFinite(Number(tracker.satisfaction)) ? Number(tracker.satisfaction) : 50,
    };
}

function scanRecentChatHistory(lookbackCount = 6) {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const recentBotMessages = chat
        .filter(msg => !msg.is_user && !msg.is_system && typeof msg.mes === 'string')
        .slice(-lookbackCount)
        .map(msg => msg.mes.toLowerCase());

    const combinedText = recentBotMessages.join('\n');
    const slopPhrases = parsePhraseList(settings.slopList);

    const repeatedSlop = slopPhrases.filter(phrase => combinedText.includes(phrase));
    const repeatedTactile = DEFAULT_TACTILE_SPAM.filter(phrase => combinedText.includes(phrase));

    return { repeatedSlop, repeatedTactile };
}

function buildDynamicInstruction() {
    const settings = getSettings();
    if (!settings.enabled) {
        return '';
    }

    const context = SillyTavern.getContext();
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Character';
    const blocks = [];

    const { repeatedSlop, repeatedTactile } = scanRecentChatHistory(6);
    const externalRel = getExternalRelationshipData();

    if (settings.antiSlopPrompt) {
        const recentWarning = repeatedSlop.length > 0
            ? ` Critical alert: recent replies overused [${repeatedSlop.slice(0, 10).join(', ')}]; use completely different expressions.`
            : '';
        blocks.push(
            `[STYLE & ANTI-SLOP DIRECTIVE: Write in vivid, natural Russian prose. Avoid melodramatic AI clichés: no whitening knuckles, ozone/bergamot smells, electric shocks on skin, husky whispers, darkening eyes, pinning to walls, grabbing chins, or "It's not X, it's Y" structures.${recentWarning}]`,
        );
    }

    if (settings.antiBossy) {
        blocks.push(
            `[AGENCY & ANTI-MICROMANAGEMENT: Treat ${userName} as an autonomous adult equal. Never write actions, speech, or decisions for ${userName}. Avoid mundane bossy orders or parental nagging ("go to sleep", "sit down and tell me", "eat now", "stop arguing"). Genuine emotional outbursts during a heated fight ("Get out!", "Leave me alone!") are allowed only when justified by conflict.]`,
        );
    }

    if (settings.livingDynamics) {
        blocks.push(
            `[LIVING CHARACTER & PACING: Avoid artificial positive bias. ${charName} has independent moods, pride, and boundaries: react authentically with disagreement, irritation, awkwardness, or warmth as earned by the scene without swinging into sudden extremes. Advance the plot and emotional arc proactively—initiate important conversations, confessions, or scene transitions when the moment is ripe without waiting for OOC prompts.]`,
        );
    }

    if (settings.fullBodyTactile) {
        let intimacyRule = '';
        if (externalRel && externalRel.role) {
            intimacyRule = `Current relationship status: "${externalRel.role}" (Warmth/Satisfaction: ${externalRel.satisfaction}%). Match all physical contact strictly to this stage.`;
        } else if (settings.intimacyMode === 'strict_platonic') {
            intimacyRule = `Current stage is strictly non-romantic: zero kisses or romantic caresses.`;
        } else if (settings.intimacyMode === 'slowburn') {
            intimacyRule = `Current stage is unconfessed/slow-burn: do NOT initiate kisses on the lips or romantic intimacy until feelings and relationship status are explicitly discussed and mutually established.`;
        } else if (settings.intimacyMode === 'established') {
            intimacyRule = `Characters are in an established relationship: natural affection is allowed when fitting the mood.`;
        } else {
            intimacyRule = `Verify the relationship stage from chat history before any romantic touch; never kiss ${userName} out of nowhere if feelings haven't been discussed.`;
        }

        const tactileWarning = repeatedTactile.length > 0
            ? ` Stop repeating [${repeatedTactile.join(', ')}].`
            : '';

        blocks.push(
            `[ORGANIC TACTILITY & FULL-BODY AWARENESS: ${intimacyRule} Avoid fixating on hands, wrists, chin, cheek, or head patting.${tactileWarning} When physical contact fits the scene, involve the whole body naturally: shoulders brushing, leaning back-to-back, nudging with an elbow, resting a forehead against a shoulder, steadying by the waist/hip/torso, adjusting a collar, or shifting physical distance.]`,
        );
    }

    return blocks.join('\n');
}

function refreshExtensionPrompt() {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    const promptText = buildDynamicInstruction();

    context.setExtensionPrompt(
        PROMPT_KEY,
        promptText,
        EXTENSION_PROMPT_TYPES.IN_CHAT,
        Number(settings.promptDepth) || 0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

function setStreamingMask(active, statusText = '✨ Генерация и проверка ответа...') {
    const settings = getSettings();
    if (!settings.enabled || !settings.hideStreaming) {
        document.body.classList.remove('las_masking_active');
        return;
    }

    if (active) {
        document.body.classList.add('las_masking_active');
        const lastMesText = document.querySelector('#chat .mes.last_mes[is_user="false"] .mes_text');
        if (lastMesText) {
            lastMesText.setAttribute('data-las-status', statusText);
        }
    } else {
        document.body.classList.remove('las_masking_active');
    }
}

function detectIssuesInMessage(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const settings = getSettings();
    const lower = text.toLowerCase();
    const issues = [];

    for (const phrase of parsePhraseList(settings.slopList)) {
        if (lower.includes(phrase)) {
            issues.push(`Штамп/слоп: «${phrase}»`);
        }
    }

    if (settings.antiBossy) {
        for (const phrase of parsePhraseList(settings.bossyList)) {
            if (lower.includes(phrase)) {
                issues.push(`Бытовой приказ: «${phrase}»`);
            }
        }
    }

    if (settings.fullBodyTactile) {
        for (const tactile of DEFAULT_TACTILE_SPAM) {
            if (lower.includes(tactile)) {
                issues.push(`Однотипная тактильность: «${tactile}»`);
            }
        }

        const externalRel = getExternalRelationshipData();
        const isPlatonicOrSlowburn =
            (externalRel && ['enemies', 'strangers', 'friends', 'slowburn'].includes(externalRel.role)) ||
            (!externalRel && ['strict_platonic', 'slowburn'].includes(settings.intimacyMode));

        if (isPlatonicOrSlowburn && /(поцеловал|поцеловала|впился в губы|впилась в губы|накрыл губы|накрыла губы)/i.test(text)) {
            issues.push('Преждевременный поцелуй в губы без установленного статуса отношений');
        }
    }

    return issues;
}

function cleanModelOutput(rawOutput) {
    const context = SillyTavern.getContext();
    let cleaned = String(rawOutput || '').trim();

    if (typeof context.parseReasoningFromString === 'function') {
        const parsed = context.parseReasoningFromString(cleaned);
        if (parsed && typeof parsed.content === 'string' && parsed.content.trim()) {
            cleaned = parsed.content.trim();
        }
    }

    return cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function rewriteMessageWithSurgeon(originalText, issues) {
    const context = SillyTavern.getContext();
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Character';

    const systemPrompt = [
        'Ты — литературный редактор ролевого текста.',
        'Твоя задача — точечно переписать ТОЛЬКО те предложения в ответе персонажа, где обнаружены указанные штампы, бытовые приказы или неуместная тактильность.',
        'ПРАВИЛА:',
        '1. Сохрани весь остальной текст, сюжетные события, объём, атмосферу, форматирование и прямую речь без изменений.',
        '2. Замени штампы Gemini на живые, естественные человеческие реакции и бытовые микро-действия.',
        `3. Убери покровительственные бытовые команды в адрес ${userName} («иди спать», «садись и рассказывай»), заменив их на равный диалог или вопрос.`,
        '4. Замени банальные прикосновения к подбородку/щеке/запястью/голове на разнообразную телесность (плечи, локти, спина, корпус, дистанция) и убери внезапные поцелуи, если они указаны в списке проблем.',
        `5. Верни ТОЛЬКО готовый исправленный текст сообщения от лица ${charName} без комментариев.`,
    ].join('\n');

    const userPrompt = [
        'ОБНАРУЖЕННЫЕ ПРОБЛЕМЫ ДЛЯ ИСПРАВЛЕНИЯ:',
        issues.map((item, idx) => `${idx + 1}. ${item}`).join('\n'),
        '',
        'ИСХОДНЫЙ ТЕКСТ СООБЩЕНИЯ:',
        originalText,
    ].join('\n');

    const rawResponse = await context.generateRaw({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
    });

    const cleaned = cleanModelOutput(rawResponse);
    if (!cleaned || cleaned.length < Math.min(40, originalText.length * 0.4)) {
        return originalText;
    }

    return cleaned;
}

async function processBotMessage(messageId, forceManual = false) {
    const settings = getSettings();
    if (!settings.enabled || isRewriting) {
        setStreamingMask(false);
        return;
    }

    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!Array.isArray(chat) || !chat[messageId]) {
        setStreamingMask(false);
        return;
    }

    const message = chat[messageId];
    if (message.is_user || message.is_system || !message.mes) {
        setStreamingMask(false);
        return;
    }

    const issues = detectIssuesInMessage(message.mes);
    if (issues.length === 0 && !forceManual) {
        setStreamingMask(false);
        return;
    }

    if (!settings.autoSurgeon && !forceManual) {
        setStreamingMask(false);
        toastr.info(`Обнаружено штампов: ${issues.length}`, 'Living Characters & Anti-Slop');
        return;
    }

    try {
        isRewriting = true;
        const statusMsg = issues.length > 0
            ? `✨ Убираю слоп (${issues.length} шт.)...`
            : '✨ Делаю ответ живее...';
        setStreamingMask(true, statusMsg);

        const effectiveIssues = issues.length > 0
            ? issues
            : ['Вычисти скрытые клише Gemini, бытовые приказы и однотипную тактильность, сделай реакции живыми.'];

        const rewritten = await rewriteMessageWithSurgeon(message.mes, effectiveIssues);

        if (rewritten && rewritten !== message.mes) {
            message.mes = rewritten;
            if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
                message.swipes[message.swipe_id] = rewritten;
            }
            context.updateMessageBlock(messageId, message);
            injectButtonsIntoMessages();
            await context.saveChat();
            toastr.success(`Исправлено триггеров: ${effectiveIssues.length}`, 'Анти-Слоп Хирург');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to rewrite message:`, error);
        toastr.error('Не удалось переписать ответ', 'Living Characters & Anti-Slop');
    } finally {
        isRewriting = false;
        setStreamingMask(false);
    }
}

function updateCounters() {
    const settings = getSettings();
    $('#las_slop_count').text(parsePhraseList(settings.slopList).length);
    $('#las_bossy_count').text(parsePhraseList(settings.bossyList).length);
}

/**
 * Add phrase to slopList or bossyList and sync all UI views.
 * @param {string} rawPhrase
 * @param {'slopList' | 'bossyList'} listKey
 */
function addPhraseToBanlist(rawPhrase, listKey = 'slopList') {
    const phrase = String(rawPhrase || '').trim().toLowerCase();
    if (!phrase) {
        return false;
    }

    const context = SillyTavern.getContext();
    const settings = getSettings();
    const currentList = parsePhraseList(settings[listKey]);

    if (!currentList.includes(phrase)) {
        currentList.unshift(phrase);
        settings[listKey] = currentList.join('\n');
        $('#las_slop_list').val(settings.slopList);
        $('#las_bossy_list').val(settings.bossyList);
        updateCounters();
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
        toastr.success(`Добавлено в бан-лист: «${phrase}»`, 'Анти-Слоп');
        return true;
    }
    return false;
}

/**
 * Remove phrase from slopList or bossyList.
 * @param {string} targetPhrase
 * @param {'slopList' | 'bossyList'} listKey
 */
function removePhraseFromBanlist(targetPhrase, listKey = 'slopList') {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    const filtered = parsePhraseList(settings[listKey]).filter(item => item !== targetPhrase);
    settings[listKey] = filtered.join('\n');
    $('#las_slop_list').val(settings.slopList);
    $('#las_bossy_list').val(settings.bossyList);
    updateCounters();
    refreshExtensionPrompt();
    context.saveSettingsDebounced();
}

/**
 * Open the rounded floating Banlist & Quick Fix Manager modal directly over the chat.
 * @param {number | null} targetMessageId
 * @param {string} prefilledText
 */
function openQuickBanModal(targetMessageId = null, prefilledText = '') {
    $('.las_modal_backdrop').remove();

    const modalHtml = `
        <div class="las_modal_backdrop">
            <div class="las_modal_window">
                <div class="las_modal_top">
                    <div class="las_modal_title">
                        <i class="fa-solid fa-shield-heart"></i>
                        <span>Бан-лист и Хирург</span>
                    </div>
                    <button type="button" class="las_close_btn" id="las_modal_close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="las_tabs_row">
                    <button type="button" class="las_tab_btn active" data-tab="slopList">Штампы и слоп</button>
                    <button type="button" class="las_tab_btn" data-tab="bossyList">Командирский тон</button>
                </div>

                <div class="las_quick_add_row">
                    <input id="las_modal_input" type="text" class="text_pole las_pill_input" placeholder="Слово или фраза для бана..." />
                    <button id="las_modal_add_btn" class="menu_button las_pill_btn las_primary_btn" type="button" style="flex:0 0 auto;">
                        <i class="fa-solid fa-plus"></i> В бан
                    </button>
                </div>

                <div id="las_modal_chips" class="las_chips_container"></div>

                <div class="las_button_row">
                    <button id="las_modal_add_and_fix" class="menu_button las_pill_btn las_primary_btn" type="button">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> В бан + Переписать ответ
                    </button>
                </div>
            </div>
        </div>
    `;

    $('body').append(modalHtml);

    if (prefilledText) {
        $('#las_modal_input').val(prefilledText);
    }

    function renderChips() {
        const settings = getSettings();
        const phrases = parsePhraseList(settings[activeModalTab]);
        const container = $('#las_modal_chips');
        container.empty();

        if (phrases.length === 0) {
            container.append('<div style="opacity:0.6;font-size:0.85rem;padding:8px;">Список пуст</div>');
            return;
        }

        for (const phrase of phrases) {
            const chip = $(`
                <span class="las_chip">
                    <span class="las_chip_text"></span>
                    <button type="button" class="las_chip_del" title="Удалить"><i class="fa-solid fa-xmark"></i></button>
                </span>
            `);
            chip.find('.las_chip_text').text(phrase);
            chip.find('.las_chip_del').on('click', function () {
                removePhraseFromBanlist(phrase, activeModalTab);
                renderChips();
            });
            container.append(chip);
        }
    }

    renderChips();

    $('.las_tab_btn').on('click', function () {
        $('.las_tab_btn').removeClass('active');
        $(this).addClass('active');
        activeModalTab = String($(this).data('tab'));
        renderChips();
    });

    $('#las_modal_add_btn').on('click', function () {
        const val = String($('#las_modal_input').val() || '');
        if (addPhraseToBanlist(val, activeModalTab)) {
            $('#las_modal_input').val('');
            renderChips();
        }
    });

    $('#las_modal_add_and_fix').on('click', async function () {
        const val = String($('#las_modal_input').val() || '').trim();
        if (val) {
            addPhraseToBanlist(val, activeModalTab);
        }
        $('.las_modal_backdrop').remove();

        const context = SillyTavern.getContext();
        const chat = context.chat;
        if (!Array.isArray(chat) || chat.length === 0) {
            return;
        }
        const msgId = targetMessageId !== null ? targetMessageId : chat.length - 1;
        await processBotMessage(msgId, true);
    });

    $('#las_modal_close, .las_modal_backdrop').on('click', function (e) {
        if (e.target === this || $(e.target).closest('#las_modal_close').length) {
            $('.las_modal_backdrop').remove();
        }
    });
}

/**
 * Inject quick action buttons ("✨ Править" & "🚫 В бан") into every bot message header in chat.
 */
function injectButtonsIntoMessages() {
    $('#chat .mes[is_user="false"]').each(function () {
        const mesEl = $(this);
        if (mesEl.find('.las_mes_actions').length > 0) {
            return;
        }

        const mesId = Number(mesEl.attr('mesid'));
        const actionBar = $(`
            <span class="las_mes_actions">
                <button type="button" class="las_mes_btn las_mes_fix" title="Переписать сообщение без слопа">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </button>
                <button type="button" class="las_mes_btn las_mes_ban" title="Добавить выделенную фразу в бан-лист">
                    <i class="fa-solid fa-ban"></i>
                </button>
            </span>
        `);

        actionBar.find('.las_mes_fix').on('click', async function (e) {
            e.stopPropagation();
            await processBotMessage(mesId, true);
        });

        actionBar.find('.las_mes_ban').on('click', function (e) {
            e.stopPropagation();
            const selectedText = String(window.getSelection ? window.getSelection().toString() : '').trim();
            openQuickBanModal(mesId, selectedText);
        });

        const headerTarget = mesEl.find('.mes_buttons').first();
        if (headerTarget.length > 0) {
            headerTarget.prepend(actionBar);
        } else {
            mesEl.find('.ch_name').first().append(actionBar);
        }
    });
}

/**
 * Add quick access item into SillyTavern's Extensions Wand Menu (#extensionsMenu).
 */
function injectWandMenuButton() {
    if ($('#las_wand_menu_item').length > 0) {
        return;
    }

    const wandItem = $(`
        <div id="las_wand_menu_item" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <div class="fa-solid fa-shield-heart extensionsMenuExtensionButton"></div>
            <span>Анти-Слоп: Бан-лист и Хирург</span>
        </div>
    `);

    wandItem.on('click', function () {
        const selectedText = String(window.getSelection ? window.getSelection().toString() : '').trim();
        openQuickBanModal(null, selectedText);
    });

    $('#extensionsMenu').append(wandItem);
}

function bindSettingsUI() {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    $('#las_enabled').prop('checked', settings.enabled).on('change', function () {
        settings.enabled = Boolean($(this).prop('checked'));
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_anti_slop_prompt').prop('checked', settings.antiSlopPrompt).on('change', function () {
        settings.antiSlopPrompt = Boolean($(this).prop('checked'));
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_anti_bossy').prop('checked', settings.antiBossy).on('change', function () {
        settings.antiBossy = Boolean($(this).prop('checked'));
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_living_dynamics').prop('checked', settings.livingDynamics).on('change', function () {
        settings.livingDynamics = Boolean($(this).prop('checked'));
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_full_body_tactile').prop('checked', settings.fullBodyTactile).on('change', function () {
        settings.fullBodyTactile = Boolean($(this).prop('checked'));
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_intimacy_mode').val(settings.intimacyMode).on('change', function () {
        settings.intimacyMode = String($(this).val());
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_prompt_depth').val(settings.promptDepth).on('input', function () {
        settings.promptDepth = Math.max(0, Math.min(10, Number($(this).val()) || 0));
        refreshExtensionPrompt();
        context.saveSettingsDebounced();
    });

    $('#las_hide_streaming').prop('checked', settings.hideStreaming).on('change', function () {
        settings.hideStreaming = Boolean($(this).prop('checked'));
        context.saveSettingsDebounced();
    });

    $('#las_auto_surgeon').prop('checked', settings.autoSurgeon).on('change', function () {
        settings.autoSurgeon = Boolean($(this).prop('checked'));
        context.saveSettingsDebounced();
    });

    $('#las_slop_list').val(settings.slopList).on('input', function () {
        settings.slopList = String($(this).val());
        updateCounters();
        context.saveSettingsDebounced();
    });

    $('#las_bossy_list').val(settings.bossyList).on('input', function () {
        settings.bossyList = String($(this).val());
        updateCounters();
        context.saveSettingsDebounced();
    });

    $('#las_quick_add_btn').on('click', function () {
        const phrase = String($('#las_quick_phrase').val() || '');
        if (addPhraseToBanlist(phrase, 'slopList')) {
            $('#las_quick_phrase').val('');
        }
    });

    $('#las_fix_last_btn').on('click', async function () {
        const chat = context.chat;
        if (!Array.isArray(chat) || chat.length === 0) {
            toastr.warning('Чат пуст', 'Living Characters & Anti-Slop');
            return;
        }
        await processBotMessage(chat.length - 1, true);
    });

    $('#las_reset_defaults_btn').on('click', function () {
        settings.slopList = DEFAULT_SLOP_LIST.join('\n');
        settings.bossyList = DEFAULT_BOSSY_LIST.join('\n');
        $('#las_slop_list').val(settings.slopList);
        $('#las_bossy_list').val(settings.bossyList);
        updateCounters();
        context.saveSettingsDebounced();
        toastr.info('Списки сброшены к стандартным', 'Living Characters & Anti-Slop');
    });

    updateCounters();
}

function registerSlashCommands() {
    const context = SillyTavern.getContext();
    if (!context.SlashCommandParser || !context.SlashCommand) {
        return;
    }

    context.SlashCommandParser.addCommandObject(
        context.SlashCommand.fromProps({
            name: 'fixslop',
            callback: async () => {
                const chat = context.chat;
                if (!Array.isArray(chat) || chat.length === 0) {
                    return '';
                }
                await processBotMessage(chat.length - 1, true);
                return '';
            },
            helpString: 'Точечно переписать последний ответ бота без клише Gemini и бытового командования.',
        }),
    );
}

async function init() {
    try {
        const context = SillyTavern.getContext();
        getSettings();

        const extPath = import.meta.url
            .replace(/^.*\/extensions\//, '')
            .replace(/\/index\.js.*$/, '');

        const settingsHtml = await context.renderExtensionTemplateAsync(
            extPath,
            'settings',
        );
        $('#extensions_settings2').append(settingsHtml);

        bindSettingsUI();
        injectWandMenuButton();
        injectButtonsIntoMessages();
        registerSlashCommands();
        refreshExtensionPrompt();

        context.eventSource.on(context.eventTypes.GENERATION_STARTED, () => {
            refreshExtensionPrompt();
            setStreamingMask(true, '✨ Генерация и фильтрация слопа...');
        });

        context.eventSource.on(context.eventTypes.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            injectButtonsIntoMessages();
            await processBotMessage(Number(messageId), false);
        });

        context.eventSource.on(context.eventTypes.GENERATION_STOPPED, () => {
            setStreamingMask(false);
        });

        context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
            setStreamingMask(false);
            refreshExtensionPrompt();
            setTimeout(injectButtonsIntoMessages, 200);
        });

        console.log(`[${MODULE_NAME}] Extension initialized.`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Initialization failed:`, error);
        toastr.error('Ошибка запуска Living Characters & Anti-Slop');
    }
}

SillyTavern.getContext().eventSource.on(SillyTavern.getContext().eventTypes.APP_READY, init);
