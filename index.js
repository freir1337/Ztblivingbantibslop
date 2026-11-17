const MODULE_NAME = 'living_characters_anti_slop';
const PROMPT_KEY = 'lcas_master_prompt';

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

const DEFAULT_BANNED_SLOP = [
    'костяшки побелели',
    'побелевшие костяшки',
    'до побеления костяшек',
    'запах озона',
    'бергамот',
    'сандал и озон',
    'глаза потемнели',
    'зрачки расширились, поглощая радужку',
    'хриплым шепотом',
    'хриплый шёпот',
    'надтреснутым голосом',
    'поддел подбородок',
    'взял за подбородок',
    'заставляя смотреть в глаза',
    'сжал челюсть так, что заиграли желваки',
    'желваки заиграли',
    'прошептал в самые губы',
    'опалил дыханием',
    'мир сузился до одной точки',
    'выпустил воздух, который не замечал, что сдерживал',
];

const DEFAULT_BOSSY_PATTERNS = [
    'иди спать',
    'марш в кровать',
    'живо в постель',
    'ложись спать, это не обсуждается',
    'быстро спать',
    'ешь давай',
    'пей давай',
    'допивай и иди',
    'сядь и расскажи',
    'садись и рассказывай',
    'возьми и сделай',
    'прекрати сейчас же и послушай меня',
    'не спорь со мной, просто сделай',
    'делай как я сказал',
];

const DEFAULT_BODY_FIXATIONS = [
    'погладил по голове',
    'потрепал по макушке',
    'переплел пальцы',
    'накрыл ее ладонь своей',
    'провел большим пальцем по скуле',
    'провел костяшками по щеке',
    'притянул за подбородок',
];

const DEFAULT_SETTINGS = {
    enabled: true,
    antiSlop: true,
    antiBossy: true,
    initiative: true,
    bodyDiversity: true,
    romanceStatus: 'none',
    surgeonEnabled: true,
    hideStreaming: false,
    refreshMode: 'reload_chat',
    apiMode: 'main',
    connectionProfileId: '',
    maxTokens: 4096,
    promptDepth: 1,
    customBannedSlop: DEFAULT_BANNED_SLOP.join('\n'),
    customBossyPhrases: DEFAULT_BOSSY_PATTERNS.join('\n'),
    customBodyFixations: DEFAULT_BODY_FIXATIONS.join('\n'),
    customExtraRules: '',
};

let isStreaming = false;
let veilWatchdogTimer = null;
const activeRewrites = new Set();

/**
 * Compute a lightweight string fingerprint to avoid rewriting the exact same text twice.
 * @param {string} str
 * @returns {string}
 */
function computeTextHash(str) {
    let hash = 5381;
    const text = String(str || '');
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return (hash >>> 0).toString(36) + '_' + text.length;
}

/**
 * Retrieve extension settings merged with defaults.
 * @returns {typeof DEFAULT_SETTINGS}
 */
function getSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME] || typeof context.extensionSettings[MODULE_NAME] !== 'object') {
        context.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    const store = context.extensionSettings[MODULE_NAME];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (store[key] === undefined || typeof store[key] !== typeof value) {
            store[key] = value;
        }
    }
    return store;
}

/**
 * Split a multiline user list into clean phrases.
 * @param {string} rawText
 * @returns {string[]}
 */
function parsePhraseList(rawText) {
    if (typeof rawText !== 'string') return [];
    return rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length >= 2);
}

/**
 * Build the master system instruction injected before each generation (100% in English).
 * @returns {string}
 */
function buildSystemDirection() {
    const settings = getSettings();
    if (!settings.enabled) return '';

    const blocks = [];

    blocks.push(
        '[LIVING CHARACTERS & ANTI-SLOP DIRECTION — MANDATORY WRITING RULES]',
        'Write all narrative and dialogue in natural, living Russian (unless the chat language is explicitly different), following these strict behavioral and stylistic constraints:'
    );

    if (settings.antiSlop) {
        const slopItems = parsePhraseList(settings.customBannedSlop).slice(0, 35);
        blocks.push(
            '1. BANNED AI CLICHES (ANTI-SLOP):',
            '- Never use overused LLM melodrama or Gemini cliches: whitened knuckles, scent of ozone/bergamot/sandalwood/rain, darkened eyes/pupils swallowing the iris, husky/raspy whispers into lips, grabbing or tilting the chin, jaw clenching/muscles feathering, or letting out a breath they did not know they were holding.',
            slopItems.length > 0
                ? `- Strictly forbidden Russian phrases and their variations: ${slopItems.join('; ')}.`
                : ''
        );
    }

    if (settings.antiBossy) {
        const bossyItems = parsePhraseList(settings.customBossyPhrases).slice(0, 30);
        blocks.push(
            '2. NO BOSSY DOMESTIC COMMANDS TOWARD {{user}}:',
            '- Do NOT use patronizing parental or micro-managing commands toward {{user}} in everyday situations or conversations (e.g., ordering {{user}} to go to sleep, eat, drink, sit down and talk, calm down, or obey "no arguments").',
            '- Respect {{user}}\'s autonomy: offer, ask, suggest, or react in-character instead of issuing domestic orders.',
            '- EXCEPTION FOR REAL CONFLICT: Short emotional outbursts during genuine heated arguments or fights ("Уйди!", "Не трогай меня!", "Отстань!", "Замолчи!") ARE allowed when justified by conflict.',
            bossyItems.length > 0
                ? `- Forbidden bossy commands: ${bossyItems.join('; ')}.`
                : ''
        );
    }

    if (settings.initiative) {
        blocks.push(
            '3. PROACTIVE PLOT INITIATIVE & NO POSITIVE BIAS:',
            '- Do NOT act as a passive responder waiting for {{user}} to lead every scene. {{char}} must actively drive the scene forward: introduce new actions, environmental changes, unexpected details, or concrete proposals.',
            '- Eliminate AI positive bias: {{char}} does not exist to please, validate, or immediately forgive {{user}}. Maintain {{char}}\'s own motives, skepticism, annoyance, or boundaries when appropriate.',
            '- Maintain emotional continuity: transition between moods gradually and logically without abrupt personality swings.'
        );
    }

    if (settings.bodyDiversity) {
        const bodyItems = parsePhraseList(settings.customBodyFixations).slice(0, 25);
        const romanceRule =
            settings.romanceStatus === 'established'
                ? '- Romantic status: Established couple. Kisses are allowed only when natural for the moment, without repetitive chin-grabbing.'
                : '- Romantic status: NO established romance. Strictly FORBID sudden kisses on the lips, pinning {{user}} to walls/surfaces, or invading intimate space without explicit mutual build-up.';

        blocks.push(
            '4. ANATOMICAL & KINETIC DIVERSITY (FULL-BODY ACTING):',
            '- Stop fixating exclusively on {{user}}\'s hands, fingers, cheeks, chin, or patting the head.',
            '- Use full-body spatial language and varied posture: shoulders, elbows, forearms, back, ribs, collarbones, knees, shifting weight, leaning against furniture, stepping back, keeping distance, or interacting with props in the room.',
            romanceRule,
            bodyItems.length > 0
                ? `- Avoid overused touch cliches: ${bodyItems.join('; ')}.`
                : ''
        );
    }

    if (settings.customExtraRules && settings.customExtraRules.trim().length > 0) {
        blocks.push('5. ADDITIONAL USER RULES:', settings.customExtraRules.trim());
    }

    return blocks.filter(Boolean).join('\n');
}

/**
 * Sync the extension prompt with SillyTavern's prompt manager.
 */
function updateInjectedPrompt() {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings();
        if (typeof context.setExtensionPrompt !== 'function') return;

        if (!settings.enabled) {
            context.setExtensionPrompt(PROMPT_KEY, '', EXTENSION_PROMPT_TYPES.IN_CHAT, 0);
            return;
        }

        const promptText = buildSystemDirection();
        const depth = Number.isFinite(Number(settings.promptDepth)) ? Number(settings.promptDepth) : 1;

        context.setExtensionPrompt(
            PROMPT_KEY,
            promptText,
            EXTENSION_PROMPT_TYPES.IN_CHAT,
            depth,
            false,
            EXTENSION_PROMPT_ROLES.SYSTEM
        );
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to update extension prompt:`, error);
    }
}

/**
 * Global generate_interceptor registered in manifest.json.
 */
globalThis.livingCharactersInterceptor = async function () {
    updateInjectedPrompt();
};

/**
 * Detect slop, bossy domestic orders, body fixations, or unauthorized lip kisses in a message.
 * @param {string} text
 * @returns {{ hasIssues: boolean, issues: string[] }}
 */
function analyzeMessageIssues(text) {
    const settings = getSettings();
    const issues = [];
    if (!text || typeof text !== 'string') {
        return { hasIssues: false, issues };
    }

    const lower = text.toLowerCase();

    if (settings.antiSlop) {
        const matchedSlop = parsePhraseList(settings.customBannedSlop).filter((phrase) =>
            lower.includes(phrase.toLowerCase())
        );
        if (matchedSlop.length > 0) {
            issues.push(`Banned AI cliches detected: ${matchedSlop.map((s) => `"${s}"`).join(', ')}`);
        }
    }

    if (settings.antiBossy) {
        const matchedBossy = parsePhraseList(settings.customBossyPhrases).filter((phrase) =>
            lower.includes(phrase.toLowerCase())
        );

        const bossyRegexes = [
            /(?:быстро|живо|марш|немедленно)\s+(?:в\s+кровать|спать|в\s+постель|за\s+стол)/i,
            /(?:ложись|иди)\s+спать\s*[,—:-]?\s*(?:это\s+не\s+обсуждается|возражения\s+не\s+принимаются)?/i,
            /(?:садись|сядь)\s+и\s+(?:рассказывай|говори|ешь|пей)/i,
            /(?:пей|ешь|допивай|доедай)\s+давай/i,
            /это\s+не\s+обсуждается/i,
        ];

        const regexHits = bossyRegexes.filter((rx) => rx.test(text));
        if (matchedBossy.length > 0 || regexHits.length > 0) {
            const detail =
                matchedBossy.length > 0
                    ? matchedBossy.map((s) => `"${s}"`).join(', ')
                    : 'patronizing domestic command pattern';
            issues.push(`Bossy/patronizing domestic command toward user detected (${detail})`);
        }
    }

    if (settings.bodyDiversity) {
        const matchedBody = parsePhraseList(settings.customBodyFixations).filter((phrase) =>
            lower.includes(phrase.toLowerCase())
        );
        if (matchedBody.length > 0) {
            issues.push(`Overused touch/body cliche detected: ${matchedBody.map((s) => `"${s}"`).join(', ')}`);
        }

        if (settings.romanceStatus !== 'established') {
            const kissRegex = /(?:поцеловал[аи]?|впился|впилась|накрыл[аи]?\s+губы|коснулся\s+губами)\s+(?:в\s+)?губы/i;
            if (kissRegex.test(text)) {
                issues.push('Unauthorized kiss on the lips detected while romance status is NOT established');
            }
        }
    }

    return {
        hasIssues: issues.length > 0,
        issues,
    };
}

/**
 * Strip accidental markdown code fences if the LLM wraps its response.
 * @param {string} rawOutput
 * @returns {string}
 */
function cleanSurgeonOutput(rawOutput) {
    if (typeof rawOutput !== 'string') return '';
    return rawOutput
        .replace(/^```(?:markdown|text|ru|russian)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

/**
 * Execute an LLM request using either the selected Connection Profile (ConnectionManagerRequestService)
 * or SillyTavern's active Main API (generateRaw).
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function executeSafeLlmRequest(systemPrompt, userPrompt) {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    const maxTokens = Math.max(256, Number(settings.maxTokens) || 4096);

    if (
        settings.apiMode === 'profile' &&
        settings.connectionProfileId &&
        context.ConnectionManagerRequestService
    ) {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];
        const response = await context.ConnectionManagerRequestService.sendRequest(
            settings.connectionProfileId,
            messages,
            maxTokens,
            {
                stream: false,
                extractData: true,
                includePreset: true,
                includeInstruct: true,
            }
        );

        if (typeof response === 'string') {
            return response;
        }
        if (response && typeof response.content === 'string') {
            return response.content;
        }
    }

    if (typeof context.generateRaw !== 'function') {
        throw new Error('SillyTavern.getContext().generateRaw is unavailable');
    }

    const result = await context.generateRaw({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        responseLength: maxTokens,
    });

    return typeof result === 'string' ? result : String(result ?? '');
}

/**
 * Call the Invisible Surgeon (100% English prompt) to rewrite problematic spans while keeping Russian language and all special tags intact.
 * @param {string} originalText
 * @param {string[]} issues
 * @param {boolean} forceFullPolish
 * @returns {Promise<string>}
 */
async function rewriteMessageWithSurgeon(originalText, issues, forceFullPolish = false) {
    const effectiveIssues =
        issues.length > 0
            ? issues
            : [
                  'Remove any AI cliches/slop, replace patronizing domestic commands toward the user with natural dialogue, diversify body language beyond hands/chin/cheeks, and ensure the character shows living initiative.',
              ];

    const systemPrompt = [
        'You are a surgical literary editor for roleplay responses.',
        'Your task is to fix ONLY the specific stylistic and behavioral issues listed below while preserving the exact plot events, scene details, character voice, paragraph structure, and length.',
        'CRITICAL RULES:',
        '1. Output ONLY the final rewritten message text. Do NOT include any English commentary, introductions, notes, or markdown code blocks.',
        '2. Keep the exact language of the original message (Russian). Every edited phrase must be written in natural, vivid, literary Russian.',
        '3. STRICTLY PRESERVE all special formatting blocks, headers, dialogue prefixes, and HTML comments exactly as they appear in the original text (for example: [ИНФО | ...], (Name/Emotion): "...", and <!--tel:time:...--> at the end).',
        '4. Replace AI cliches (whitened knuckles, ozone/bergamot scent, darkened eyes, husky whispers, grabbing the chin) with fresh, grounded sensory and physical details.',
        '5. Replace patronizing domestic orders toward the user ("go to sleep", "eat/drink now", "sit down and tell me") with respectful offers, questions, or natural character reactions. Keep heated emotional outbursts only if characters are in a genuine fight.',
        '6. Replace repetitive hand/cheek/chin/head-patting touches with varied full-body spatial movement (shoulders, elbows, back, posture, stepping back, interacting with objects in the environment).',
        forceFullPolish
            ? '7. Make the character proactive: ensure the response includes a concrete action, detail, or hook that moves the scene forward.'
            : '',
    ]
        .filter(Boolean)
        .join('\n');

    const userPrompt = [
        'DETECTED ISSUES TO FIX:',
        ...effectiveIssues.map((item, idx) => `${idx + 1}. ${item}`),
        '',
        'ORIGINAL ROLEPLAY MESSAGE:',
        originalText,
        '',
        'REWRITTEN MESSAGE (Russian language only, preserving all [ИНФО...] tags and <!--...--> comments, no explanations):',
    ].join('\n');

    const rawResult = await executeSafeLlmRequest(systemPrompt, userPrompt);
    const cleaned = cleanSurgeonOutput(rawResult);
    return cleaned.length > 20 ? cleaned : originalText;
}

/**
 * Guarantee removal of all veil overlays from every message in the chat.
 */
function clearAllVeils() {
    if (veilWatchdogTimer) {
        clearTimeout(veilWatchdogTimer);
        veilWatchdogTimer = null;
    }
    $('#chat .mes.lcas_veil_active').removeClass('lcas_veil_active');
    $('#chat .mes .mes_text').removeAttr('data-lcas-status');
}

/**
 * Show or remove the protective veil over a message element in the chat.
 * Includes a safety watchdog timer so the veil can never stay stuck forever.
 * @param {number|string} messageId
 * @param {boolean} active
 * @param {string} [statusText]
 */
function setMessageVeil(messageId, active, statusText = '✨ Проверяю и оживляю ответ... (нажмите, чтобы скрыть)') {
    if (!active) {
        clearAllVeils();
        return;
    }

    const mesElement = $(`#chat .mes[mesid="${messageId}"]`);
    if (!mesElement.length) return;

    const textElement = mesElement.find('.mes_text');
    textElement.attr('data-lcas-status', statusText);
    mesElement.addClass('lcas_veil_active');

    if (veilWatchdogTimer) {
        clearTimeout(veilWatchdogTimer);
    }
    veilWatchdogTimer = setTimeout(() => {
        clearAllVeils();
    }, 35000);
}

/**
 * Apply the rewritten text to the message object, synchronize swipes and display_text, save the chat, and refresh the UI.
 * @param {number} messageId
 * @param {string} updatedText
 */
async function applyUpdatedMessageToChat(messageId, updatedText) {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    const message = context.chat?.[messageId];
    if (!message) {
        clearAllVeils();
        return;
    }

    const newHash = computeTextHash(updatedText);

    // 1. Update core message text
    message.mes = updatedText;

    // 2. Synchronize active swipe if swipes array exists
    if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
        message.swipes[message.swipe_id] = updatedText;
    }

    // 3. Synchronize extra.display_text so updateMessageBlock never renders stale text
    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }
    if (typeof message.extra.display_text === 'string') {
        message.extra.display_text = updatedText;
    }
    message.extra.lcas_last_hash = newHash;

    // 4. Clear any veil before re-rendering
    clearAllVeils();

    // 5. Update DOM block immediately
    if (typeof context.updateMessageBlock === 'function') {
        context.updateMessageBlock(Number(messageId), message);
    } else if (typeof context.messageFormatting === 'function') {
        const formatted = context.messageFormatting(
            updatedText,
            message.name,
            message.is_system,
            message.is_user,
            Number(messageId)
        );
        $(`#chat .mes[mesid="${messageId}"] .mes_text`).html(formatted);
    }

    // 6. Persist chat to disk
    if (typeof context.saveChat === 'function') {
        await context.saveChat();
    }

    // 7. Execute user-selected chat refresh strategy so custom trackers/renderers display the new text
    if (settings.refreshMode === 'reload_page') {
        window.location.reload();
        return;
    }

    if (settings.refreshMode === 'reload_chat' && typeof context.reloadCurrentChat === 'function') {
        await context.reloadCurrentChat();
    }

    clearAllVeils();
    injectMessageActionButtons();
}

/**
 * Inspect and optionally rewrite a character message by ID.
 * @param {number} messageId
 * @param {boolean} [manualForce=false]
 */
async function processCharacterMessage(messageId, manualForce = false) {
    const settings = getSettings();
    if (!settings.enabled && !manualForce) {
        clearAllVeils();
        return;
    }

    const msgIndex = Number(messageId);
    if (!Number.isFinite(msgIndex) || activeRewrites.has(msgIndex)) {
        return;
    }

    const context = SillyTavern.getContext();
    const message = context.chat?.[msgIndex];
    if (!message || message.is_user || message.is_system || !message.mes) {
        clearAllVeils();
        return;
    }

    const currentHash = computeTextHash(message.mes);
    if (!manualForce && message.extra?.lcas_last_hash === currentHash) {
        clearAllVeils();
        return;
    }

    const analysis = analyzeMessageIssues(message.mes);
    const shouldRewrite = manualForce || (settings.surgeonEnabled && analysis.hasIssues);

    if (!shouldRewrite) {
        if (!message.extra || typeof message.extra !== 'object') {
            message.extra = {};
        }
        message.extra.lcas_last_hash = currentHash;
        clearAllVeils();
        return;
    }

    activeRewrites.add(msgIndex);
    setMessageVeil(
        msgIndex,
        true,
        manualForce
            ? '✨ Делаю ответ живее... (нажмите, чтобы показать текст)'
            : '✨ Хирург убирает штампы... (нажмите, чтобы показать текст)'
    );

    try {
        const updatedText = await rewriteMessageWithSurgeon(
            message.mes,
            analysis.issues,
            manualForce
        );

        clearAllVeils();

        if (updatedText && updatedText !== message.mes) {
            await applyUpdatedMessageToChat(msgIndex, updatedText);
            toastr.success('Ответ успешно обновлён Хирургом', 'Living Characters');
        } else if (manualForce) {
            toastr.info('Текст не потребовал изменений', 'Living Characters');
        }
    } catch (error) {
        clearAllVeils();
        console.error(`[${MODULE_NAME}] Surgeon rewrite failed:`, error);
        toastr.error(
            `Не удалось переписать ответ: ${error.message || error}`,
            'Living Characters & Anti-Slop'
        );
    } finally {
        activeRewrites.delete(msgIndex);
        clearAllVeils();
    }
}

/**
 * Add a rounded wand button to every character message in the chat.
 */
function injectMessageActionButtons() {
    $('#chat .mes').each(function () {
        const mesBlock = $(this);
        if (mesBlock.attr('is_user') === 'true' || mesBlock.attr('is_system') === 'true') {
            return;
        }
        const extraButtons = mesBlock.find('.extraMesButtons');
        if (!extraButtons.length || extraButtons.find('.lcas_mes_action_btn').length > 0) {
            return;
        }

        const btn = $(
            `<div class="lcas_mes_action_btn mes_button" title="Оживить ответ и убрать слоп (Living Characters)">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
            </div>`
        );
        extraButtons.prepend(btn);
    });
}

/**
 * Populate a select element with supported Connection Manager profiles.
 * @param {JQuery<HTMLSelectElement>} selectEl
 * @param {string} selectedId
 */
function populateConnectionProfilesDropdown(selectEl, selectedId) {
    if (!selectEl || !selectEl.length) return;
    const context = SillyTavern.getContext();
    selectEl.empty();
    selectEl.append('<option value="">-- Выберите профиль подключения --</option>');

    try {
        const profiles =
            context.ConnectionManagerRequestService?.getSupportedProfiles?.() ||
            context.extensionSettings?.connectionManager?.profiles ||
            [];

        for (const profile of profiles) {
            if (!profile || !profile.id) continue;
            const option = $('<option></option>')
                .val(profile.id)
                .text(`${profile.name || profile.id} (${profile.api || 'API'})`);
            if (profile.id === selectedId) {
                option.prop('selected', true);
            }
            selectEl.append(option);
        }
    } catch (error) {
        console.warn(`[${MODULE_NAME}] Connection Manager profiles unavailable:`, error);
    }
}

/**
 * Open a custom mobile-friendly modal sheet that never hides behind the top bar.
 */
function openBanlistModal() {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    $('.lcas_overlay_backdrop').remove();

    const overlay = $(`
        <div class="lcas_overlay_backdrop" role="dialog" aria-modal="true">
            <div class="lcas_overlay_sheet">
                <div class="lcas_overlay_header">
                    <h3 class="lcas_overlay_header_title">Бан-лист и правила</h3>
                    <button type="button" class="lcas_overlay_close_btn" id="lcas_modal_close_top">
                        <i class="fa-solid fa-xmark"></i> Закрыть
                    </button>
                </div>
                <div class="lcas_overlay_body">
                    <div class="lcas_modal_card">
                        <h4 class="lcas_modal_title">1. Запрещённые штампы и слоп (по 1 фразе на строку)</h4>
                        <p class="lcas_modal_hint">Эти выражения блокируются в системном промпте и автоматически вырезаются Хирургом.</p>
                        <textarea id="lcas_modal_slop" class="lcas_textarea"></textarea>
                    </div>
                    <div class="lcas_modal_card">
                        <h4 class="lcas_modal_title">2. Бытовые приказы (No Bossy Caring)</h4>
                        <p class="lcas_modal_hint">Фразы бытового командования («иди спать», «пей давай»). Эмоциональные реплики в реальных ссорах не блокируются.</p>
                        <textarea id="lcas_modal_bossy" class="lcas_textarea"></textarea>
                    </div>
                    <div class="lcas_modal_card">
                        <h4 class="lcas_modal_title">3. Заезженная тактильность</h4>
                        <p class="lcas_modal_hint">Штампы прикосновений, которые заменяются на разнообразную пластику тела (плечи, локти, спина, дистанция).</p>
                        <textarea id="lcas_modal_body" class="lcas_textarea"></textarea>
                    </div>
                    <div class="lcas_modal_card">
                        <h4 class="lcas_modal_title">4. Дополнительные личные правила</h4>
                        <p class="lcas_modal_hint">Любые ваши кастомные требования к стилю и поведению персонажа.</p>
                        <textarea id="lcas_modal_extra" class="lcas_textarea" placeholder="Например: Avoid melodramatic pauses..."></textarea>
                    </div>
                </div>
                <div class="lcas_overlay_footer">
                    <button type="button" class="lcas_btn lcas_btn_secondary" id="lcas_modal_cancel_btn">
                        Отмена
                    </button>
                    <button type="button" class="lcas_btn lcas_btn_primary" id="lcas_modal_save_btn">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                </div>
            </div>
        </div>
    `);

    overlay.find('#lcas_modal_slop').val(settings.customBannedSlop);
    overlay.find('#lcas_modal_bossy').val(settings.customBossyPhrases);
    overlay.find('#lcas_modal_body').val(settings.customBodyFixations);
    overlay.find('#lcas_modal_extra').val(settings.customExtraRules);

    const closeModal = () => overlay.remove();

    overlay.find('#lcas_modal_close_top, #lcas_modal_cancel_btn').on('click', closeModal);
    overlay.on('click', function (e) {
        if (e.target === this) {
            closeModal();
        }
    });

    overlay.find('#lcas_modal_save_btn').on('click', () => {
        settings.customBannedSlop = String(overlay.find('#lcas_modal_slop').val() || '');
        settings.customBossyPhrases = String(overlay.find('#lcas_modal_bossy').val() || '');
        settings.customBodyFixations = String(overlay.find('#lcas_modal_body').val() || '');
        settings.customExtraRules = String(overlay.find('#lcas_modal_extra').val() || '');
        context.saveSettingsDebounced();
        updateInjectedPrompt();
        closeModal();
        toastr.success('Бан-лист и правила сохранены', 'Living Characters');
    });

    $('body').append(overlay);
}

/**
 * Bind UI controls in the extension settings panel.
 */
function bindSettingsUI() {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    const bindCheckbox = (selector, key) => {
        const el = $(selector);
        el.prop('checked', Boolean(settings[key]));
        el.off('change.lcas').on('change.lcas', function () {
            settings[key] = $(this).is(':checked');
            if (key === 'hideStreaming' && !settings[key]) {
                clearAllVeils();
            }
            context.saveSettingsDebounced();
            updateInjectedPrompt();
        });
    };

    bindCheckbox('#lcas_enabled', 'enabled');
    bindCheckbox('#lcas_anti_slop', 'antiSlop');
    bindCheckbox('#lcas_anti_bossy', 'antiBossy');
    bindCheckbox('#lcas_initiative', 'initiative');
    bindCheckbox('#lcas_body_diversity', 'bodyDiversity');
    bindCheckbox('#lcas_surgeon_enabled', 'surgeonEnabled');
    bindCheckbox('#lcas_hide_streaming', 'hideStreaming');

    const romanceSelect = $('#lcas_romance_status');
    romanceSelect.val(settings.romanceStatus);
    romanceSelect.off('change.lcas').on('change.lcas', function () {
        settings.romanceStatus = String($(this).val());
        context.saveSettingsDebounced();
        updateInjectedPrompt();
    });

    const refreshSelect = $('#lcas_refresh_mode');
    refreshSelect.val(settings.refreshMode || 'reload_chat');
    refreshSelect.off('change.lcas').on('change.lcas', function () {
        settings.refreshMode = String($(this).val());
        context.saveSettingsDebounced();
    });

    const apiModeSelect = $('#lcas_api_mode');
    const profileBlock = $('#lcas_profile_block');
    const profileSelect = $('#lcas_connection_profile');

    apiModeSelect.val(settings.apiMode || 'main');
    profileBlock.toggle(settings.apiMode === 'profile');
    populateConnectionProfilesDropdown(profileSelect, settings.connectionProfileId);

    apiModeSelect.off('change.lcas').on('change.lcas', function () {
        settings.apiMode = String($(this).val());
        profileBlock.toggle(settings.apiMode === 'profile');
        if (settings.apiMode === 'profile') {
            populateConnectionProfilesDropdown(profileSelect, settings.connectionProfileId);
        }
        context.saveSettingsDebounced();
    });

    profileSelect.off('change.lcas').on('change.lcas', function () {
        settings.connectionProfileId = String($(this).val() || '');
        context.saveSettingsDebounced();
    });

    $('#lcas_refresh_profiles')
        .off('click.lcas')
        .on('click.lcas', () => {
            populateConnectionProfilesDropdown(profileSelect, settings.connectionProfileId);
            toastr.info('Список профилей подключения обновлён', 'Living Characters');
        });

    const maxTokensInput = $('#lcas_max_tokens');
    maxTokensInput.val(settings.maxTokens || 4096);
    maxTokensInput.off('change.lcas').on('change.lcas', function () {
        const val = Math.max(256, Math.min(16384, Number($(this).val()) || 4096));
        settings.maxTokens = val;
        $(this).val(val);
        context.saveSettingsDebounced();
    });

    $('#lcas_open_banlist_btn').off('click.lcas').on('click.lcas', openBanlistModal);

    $('#lcas_rewrite_last_btn')
        .off('click.lcas')
        .on('click.lcas', async () => {
            const chat = context.chat || [];
            for (let i = chat.length - 1; i >= 0; i--) {
                if (!chat[i].is_user && !chat[i].is_system) {
                    await processCharacterMessage(i, true);
                    return;
                }
            }
            toastr.warning('В чате ещё нет ответов персонажа', 'Living Characters');
        });

    $(document)
        .off('click.lcas', '.lcas_mes_action_btn')
        .on('click.lcas', '.lcas_mes_action_btn', async function (event) {
            event.stopPropagation();
            const mesId = Number($(this).closest('.mes').attr('mesid'));
            if (!Number.isNaN(mesId)) {
                await processCharacterMessage(mesId, true);
            }
        });

    // Tap anywhere on the veil to dismiss it immediately if desired
    $(document)
        .off('click.lcas_veil', '.mes.lcas_veil_active')
        .on('click.lcas_veil', '.mes.lcas_veil_active', function () {
            clearAllVeils();
        });
}

/**
 * Initialize the extension once SillyTavern is ready.
 */
async function init() {
    try {
        const context = SillyTavern.getContext();
        getSettings();

        const settingsHtml = await $.get(`/scripts/extensions/third-party/Ztblivingbantibslop/settings.html`).catch(
            async () => {
                const scripts = document.querySelectorAll('script[type="module"]');
                for (const s of scripts) {
                    if (s.src && s.src.includes('Ztblivingbantibslop')) {
                        const baseUrl = s.src.substring(0, s.src.lastIndexOf('/'));
                        return await $.get(`${baseUrl}/settings.html`);
                    }
                }
                throw new Error('Could not locate settings.html');
            }
        );

        $('#extensions_settings2').append(settingsHtml);
        bindSettingsUI();
        updateInjectedPrompt();
        injectMessageActionButtons();

        const { eventSource, event_types } = context;

        eventSource.on(event_types.CHAT_CHANGED, () => {
            clearAllVeils();
            updateInjectedPrompt();
            setTimeout(injectMessageActionButtons, 150);
        });

        eventSource.on(event_types.GENERATION_STARTED, () => {
            isStreaming = true;
            updateInjectedPrompt();
        });

        eventSource.on(event_types.STREAM_TOKEN_RECEIVED, () => {
            const settings = getSettings();
            if (!settings.enabled || !settings.hideStreaming || !settings.surgeonEnabled) return;
            const lastIndex = (context.chat?.length || 1) - 1;
            if (lastIndex >= 0 && isStreaming) {
                setMessageVeil(lastIndex, true, '✨ Формирую живой ответ... (нажмите, чтобы показать)');
            }
        });

        eventSource.on(event_types.GENERATION_STOPPED, () => {
            isStreaming = false;
            clearAllVeils();
        });

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            isStreaming = false;
            clearAllVeils();
            injectMessageActionButtons();
            await processCharacterMessage(Number(messageId), false);
        });

        console.info(`[${MODULE_NAME}] Extension initialized (v1.2.0).`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Initialization error:`, error);
        toastr.error('Ошибка запуска Living Characters & Anti-Slop', 'Extension Error');
    }
}

jQuery(() => {
    const context = SillyTavern.getContext();
    if (context?.eventSource && context?.event_types?.APP_READY) {
        context.eventSource.on(context.event_types.APP_READY, init);
    } else {
        setTimeout(init, 1000);
    }
});
