/**
 * LEASE Memory Context - 记忆表格总结模块
 *
 * 仅负责：选择记忆表格、调用总结模型、写入记忆总结、处理源行、同步向量。
 * 不包含实时填表、聊天总结、大总结、总结优化或世界书同步。
 */
(function () {
    'use strict';

    function cleanSummaryOutput(text) {
        if (!text) return '';
        let output = String(text).trim();

        if (output.includes('</think>')) {
            const raw = output;
            const cleaned = output
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/^[\s\S]*?<\/think>/i, '')
                .trim();
            output = cleaned || raw;
        }

        const formalStart = output.search(/(?:^|\n)\s*(?:【\s*(?:主线剧情|支线剧情|记忆总结|剧情总结|人物档案|人物关系|世界设定|物品追踪|约定)[^】]*】|\d{4}年\d{1,2}月\d{1,2}日[^\n]*\[)/);
        if (formalStart > 0) output = output.slice(formalStart).trim();
        return output;
    }

    function getDataTables() {
        const m = window.Gaigai.m;
        return m && Array.isArray(m.s) ? m.s.slice(0, -1) : [];
    }

    function getSelectedTableIndices() {
        const C = window.Gaigai.config_obj;
        const allIndices = getDataTables().map((_, index) => index);
        const saved = C.manualSummaryTargetTables;
        if (!Array.isArray(saved) || saved.length === 0) return allIndices;
        return saved.filter(index => allIndices.includes(index));
    }

    function getVisibleRowIndices(tableIndex, sheet) {
        const summarized = window.Gaigai.summarizedRows || {};
        const hidden = new Set(Array.isArray(summarized[tableIndex]) ? summarized[tableIndex] : []);
        return sheet.r.map((_, index) => index).filter(index => !hidden.has(index));
    }

    function captureSummarySources(tableIndices) {
        const m = window.Gaigai.m;
        return tableIndices
            .map(tableIndex => {
                const sheet = m.get(tableIndex);
                if (!sheet) return null;
                return {
                    tableIndex,
                    name: sheet.n || `表${tableIndex}`,
                    rowIndices: getVisibleRowIndices(tableIndex, sheet)
                };
            })
            .filter(source => source && source.rowIndices.length > 0);
    }

    function normalizeRowAction(value) {
        return ['keep', 'hide', 'delete'].includes(value) ? value : 'hide';
    }

    function remapHiddenRowsAfterDelete(hiddenRows, deletedRows) {
        const deleted = new Set(deletedRows);
        return hiddenRows
            .filter(index => !deleted.has(index))
            .map(index => index - deletedRows.filter(deletedIndex => deletedIndex < index).length);
    }

    async function applySourceRowAction(sources, action) {
        const normalizedAction = normalizeRowAction(action);
        if (normalizedAction === 'keep') return;

        const m = window.Gaigai.m;
        const summarized = window.Gaigai.summarizedRows || {};

        for (const source of sources) {
            const sheet = m.get(source.tableIndex);
            if (!sheet) continue;

            if (normalizedAction === 'hide') {
                for (const rowIndex of source.rowIndices) {
                    window.Gaigai.markAsSummarized(source.tableIndex, rowIndex);
                }
                continue;
            }

            const deletedRows = [...source.rowIndices].sort((a, b) => a - b);
            const oldHiddenRows = Array.isArray(summarized[source.tableIndex])
                ? [...summarized[source.tableIndex]]
                : [];
            sheet.delMultiple(deletedRows);
            summarized[source.tableIndex] = remapHiddenRowsAfterDelete(oldHiddenRows, deletedRows);
        }
    }

    function persistSummaryState() {
        const m = window.Gaigai.m;
        m.save(false, true);
        if (typeof window.Gaigai.updateCurrentSnapshot === 'function') {
            window.Gaigai.updateCurrentSnapshot();
        }
        if ($('#gai-main-pop').length > 0 && typeof window.Gaigai.shw === 'function') {
            window.Gaigai.shw();
        }
    }

    async function syncSummaryVectors() {
        const C = window.Gaigai.config_obj;
        if (!C.autoVectorizeSummary) return { skipped: true };
        if (!window.Gaigai.VM || typeof window.Gaigai.VM.syncSummaryToBook !== 'function') {
            throw new Error('向量模块尚未加载');
        }
        return window.Gaigai.VM.syncSummaryToBook(true);
    }

    function openTableSelector() {
        if (document.getElementById('gg-summary-table-selector')) return;

        const C = window.Gaigai.config_obj;
        const UI = window.Gaigai.ui;
        const tables = getDataTables();
        const selected = new Set(getSelectedTableIndices());
        const overlay = $('<div id="gg-summary-table-selector"></div>').css({
            position: 'fixed', inset: 0, zIndex: 10000020,
            background: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '16px'
        });
        const box = $('<div></div>').css({
            width: 'min(520px, 92vw)', maxHeight: '80vh', overflow: 'auto',
            background: UI.c, color: UI.tc, borderRadius: '8px', padding: '16px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)'
        });

        box.append('<h3 style="margin:0 0 12px;">🎯 选择要总结的表格</h3>');
        const list = $('<div></div>').css({ display: 'grid', gap: '8px' });
        tables.forEach((sheet, index) => {
            const rowCount = Array.isArray(sheet.r) ? sheet.r.length : 0;
            const label = $('<label></label>').css({
                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                padding: '9px', border: '1px solid rgba(127,127,127,0.25)', borderRadius: '6px'
            });
            const checkbox = $(`<input type="checkbox" data-table-index="${index}">`).prop('checked', selected.has(index));
            label.append(checkbox, `<span style="flex:1;">${sheet.n || `表${index}`}</span>`, `<span style="opacity:.7;font-size:11px;">${rowCount}行</span>`);
            list.append(label);
        });
        box.append(list);

        const actions = $('<div></div>').css({ display: 'flex', gap: '8px', marginTop: '14px' });
        const cancel = $('<button type="button">取消</button>').css({ flex: 1, padding: '8px' });
        const save = $('<button type="button">保存选择</button>').css({ flex: 1, padding: '8px', background: '#4caf50', color: '#fff', border: 0, borderRadius: '4px' });
        cancel.on('click', () => overlay.remove());
        save.on('click', () => {
            C.manualSummaryTargetTables = list.find('input:checked').map(function () {
                return Number($(this).data('table-index'));
            }).get();
            localStorage.setItem('gg_config', JSON.stringify(C));
            persistSummaryState();
            overlay.remove();
            window.Gaigai.SummaryManager.showUI();
        });
        actions.append(cancel, save);
        box.append(actions);
        overlay.append(box);
        $('body').append(overlay);
    }

    window._gg_openSumTableSelector = function (event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        openTableSelector();
    };

    function getHiddenMessageIndices(ctx) {
        const hiddenIndices = new Set();
        if (!Array.isArray(ctx?.chat)) return hiddenIndices;
        ctx.chat.forEach((msg, index) => {
            if (msg?.is_system === true) hiddenIndices.add(index);
        });
        return hiddenIndices;
    }

    async function silentHideMessages(ctx, messageIndices) {
        if (!ctx || !Array.isArray(ctx.chat) || !Array.isArray(messageIndices) || messageIndices.length === 0) {
            return { hidden: 0 };
        }

        let hidden = 0;
        messageIndices.forEach(index => {
            if (!ctx.chat[index]) return;
            ctx.chat[index].is_system = true;
            const $message = $(`#chat .mes[mesid="${index}"]`);
            if ($message.length) $message.attr('is_system', 'true');
            hidden++;
        });

        if (hidden > 0 && typeof ctx.saveChat === 'function') {
            await ctx.saveChat();
        }
        return { hidden };
    }

    async function applyContextLimitHiding() {
        const C = window.Gaigai.config_obj;
        if (!C?.masterSwitch || !C.contextLimit) return { hidden: 0, reason: 'disabled' };

        const keepFloors = Math.max(1, Number.parseInt(C.contextLimitCount, 10) || 30);
        const ctx = window.Gaigai.m?.ctx();
        if (!Array.isArray(ctx?.chat) || ctx.chat.length === 0) {
            return { hidden: 0, reason: 'no-chat' };
        }

        const dialogueIndices = [];
        ctx.chat.forEach((msg, index) => {
            if (!msg || msg.role === 'system' || msg.isGaigaiPrompt || msg.isGaigaiData) return;
            dialogueIndices.push(index);
        });
        if (dialogueIndices.length <= keepFloors) {
            return { hidden: 0, reason: 'within-limit', total: dialogueIndices.length, keep: keepFloors };
        }

        const alreadyHidden = getHiddenMessageIndices(ctx);
        const hideCount = dialogueIndices.length - keepFloors;
        const shouldHide = dialogueIndices
            .slice(0, hideCount)
            .filter(index => !alreadyHidden.has(index));
        const result = await silentHideMessages(ctx, shouldHide);
        console.log(`✂️ [保留N层] 对话共 ${dialogueIndices.length} 层，保留最近 ${keepFloors} 层，本次新增隐藏 ${result.hidden} 层`);
        return { ...result, total: dialogueIndices.length, keep: keepFloors };
    }

    window.Gaigai.applyContextLimitHiding = applyContextLimitHiding;

    class SummaryManager {
        constructor() {
            console.log('✅ [SummaryManager] 轻量表格总结模块初始化完成');
        }

        showUI() {
            const UI = window.Gaigai.ui;
            const C = window.Gaigai.config_obj;
            const API_CONFIG = window.Gaigai.config;
            const m = window.Gaigai.m;
            const ctx = m.ctx();
            const totalCount = Array.isArray(ctx?.chat) ? ctx.chat.length : 0;
            const summaryPointer = Math.max(0, Math.min(totalCount, Number.parseInt(API_CONFIG.lastSummaryIndex, 10) || 0));
            const tables = getDataTables();
            const selected = getSelectedTableIndices();
            const selectionText = selected.length
                ? `🎯 已选择 ${selected.length} 个表格 (点击修改)`
                : '⚠️ 未选择表格 (点击修改)';
            const rowAction = normalizeRowAction(C.summaryRowAction);

            const html = `
                <div class="g-p" style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;gap:12px;">
                    <div style="background:rgba(255,193,7,.08);border-radius:8px;padding:12px;border:1px solid rgba(255,193,7,.55);flex-shrink:0;">
                        <div style="font-size:11px;font-weight:600;margin-bottom:9px;color:${UI.tc};">⚙️ 自动总结模式：📊 仅表格</div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <label for="gg_summary_pointer_console" style="font-size:11px;font-weight:600;color:${UI.tc};margin:0;">📍 表格总结指针：</label>
                            <input type="number" id="gg_summary_pointer_console" value="${summaryPointer}" min="0" max="${totalCount}" style="flex:1;min-width:140px;padding:6px;border:1px solid rgba(0,0,0,.18);border-radius:4px;">
                            <span style="font-size:11px;color:${UI.tc};">/ ${totalCount} 层</span>
                            <button id="gg_summary_pointer_console_fix" style="padding:6px 12px;border:1px solid rgba(0,0,0,.18);border-radius:5px;cursor:pointer;">修正</button>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:10px;color:${UI.tc};opacity:.75;">
                            <span>💡 指针会随当前聊天保存，切换聊天或角色时自动恢复</span>
                            <button id="gg_summary_pointer_console_config" style="padding:2px 6px;border:0;background:transparent;color:#ff9800;cursor:pointer;font-size:10px;">修改配置</button>
                        </div>
                    </div>
                    <div style="background:transparent;border-radius:8px;padding:12px;border:1px solid rgba(76,175,80,.7);flex-shrink:0;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <h4 style="margin:0;color:${UI.tc};">📊 总结</h4>
                        </div>
                        <div style="font-size:11px;color:${UI.tc};opacity:.8;margin-bottom:10px;">
                            💡 总结所选记忆表格中当前未归档的白色行，并写入记忆总结表
                        </div>
                        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,.1);">
                            <label style="font-size:11px;font-weight:600;color:${UI.tc};display:block;margin-bottom:8px;">🎯 选择要总结的表格：</label>
                            <button type="button" id="gg_sum_open_table_selector" style="width:100%;padding:12px;background:${UI.c};color:${UI.tc};border:1px solid rgba(0,0,0,.1);border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
                                ${selectionText}
                            </button>
                            <div style="font-size:9px;color:${UI.tc};opacity:.6;margin-top:6px;">共 ${tables.length} 个可选数据表，不包含记忆总结表</div>
                        </div>
                        <div style="background:rgba(255,255,255,.05);border-radius:6px;padding:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,.1);">
                            <label style="font-size:11px;font-weight:600;color:${UI.tc};display:block;margin-bottom:6px;">总结成功后处理源行：</label>
                            <select id="gg_summary_row_action" style="width:100%;padding:7px;border-radius:4px;">
                                <option value="keep" ${rowAction === 'keep' ? 'selected' : ''}>保留（继续显示）</option>
                                <option value="hide" ${rowAction === 'hide' ? 'selected' : ''}>隐藏（标记为绿色已归档）</option>
                                <option value="delete" ${rowAction === 'delete' ? 'selected' : ''}>删除（从源表移除）</option>
                            </select>
                            <label style="display:flex;align-items:center;gap:8px;margin-top:9px;font-size:11px;color:${UI.tc};">
                                <input type="checkbox" id="gg_summary_silent" ${C.autoSummarySilent ? 'checked' : ''}>
                                静默保存（关闭后可在写入前检查和编辑总结）
                            </label>
                        </div>
                        <button id="gg_sum_table-snap" style="width:100%;padding:10px;background:${window.Gaigai.isTableSummaryRunning ? '#999' : '#4caf50'};color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;opacity:${window.Gaigai.isTableSummaryRunning ? '.7' : '1'};" ${window.Gaigai.isTableSummaryRunning ? 'disabled' : ''}>
                            ${window.Gaigai.isTableSummaryRunning ? '⏳ 正在执行...' : '🚀 开始总结'}
                        </button>
                        <div id="gg_summary_status" style="text-align:center;margin-top:8px;font-size:11px;color:${UI.tc};opacity:.8;min-height:16px;"></div>
                    </div>
                </div>`;

            window.Gaigai.pop('🤖 总结控制台', html, true);
            this._bindUIEvents(totalCount);
        }

        _bindUIEvents(totalCount) {
            const C = window.Gaigai.config_obj;
            const API_CONFIG = window.Gaigai.config;
            const m = window.Gaigai.m;
            $('#gg_summary_pointer_console_fix').off('click').on('click', async function () {
                const requested = Number.parseInt($('#gg_summary_pointer_console').val(), 10);
                const corrected = Math.max(0, Math.min(totalCount, Number.isFinite(requested) ? requested : 0));
                API_CONFIG.lastSummaryIndex = corrected;
                API_CONFIG.summarySource = 'table';
                $('#gg_summary_pointer_console').val(corrected);
                localStorage.setItem('gg_api', JSON.stringify(API_CONFIG));
                await m.save(false, true);
                await window.Gaigai.customAlert(`表格总结指针已修正为 ${corrected} / ${totalCount} 层。`, '进度已保存');
            });
            $('#gg_summary_pointer_console_config').off('click').on('click', function () {
                if (typeof window.Gaigai.navTo === 'function' && typeof window.Gaigai.shcf === 'function') {
                    window.Gaigai.navTo('配置', window.Gaigai.shcf);
                }
            });
            $('#gg_sum_open_table_selector').off('click').on('click', openTableSelector);
            $('#gg_summary_row_action').off('change').on('change', function () {
                C.summaryRowAction = normalizeRowAction($(this).val());
                localStorage.setItem('gg_config', JSON.stringify(C));
                persistSummaryState();
            });
            $('#gg_summary_silent').off('change').on('change', function () {
                C.autoSummarySilent = $(this).is(':checked');
                localStorage.setItem('gg_config', JSON.stringify(C));
                persistSummaryState();
            });
            $('#gg_sum_table-snap').off('click').on('click', async () => {
                const selected = getSelectedTableIndices();
                if (!selected.length) {
                    await window.Gaigai.customAlert('请至少选择一个有内容的记忆表格。', '提示');
                    return;
                }
                const action = normalizeRowAction($('#gg_summary_row_action').val());
                const silent = $('#gg_summary_silent').is(':checked');
                window.Gaigai.isTableSummaryRunning = true;
                $('#gg_sum_table-snap').text('⏳ AI 正在总结...').prop('disabled', true).css('opacity', .7);
                try {
                    await this.callAIForSummary(null, null, 'table', silent, false, false, selected, false, false, action);
                } finally {
                    window.Gaigai.isTableSummaryRunning = false;
                    $('#gg_sum_table-snap').text('🚀 开始总结').prop('disabled', false).css('opacity', 1);
                }
            });
        }

        async callAIForSummary(_forceStart = null, _forceEnd = null, _forcedMode = 'table', isSilent = false, _isBatch = false, _skipSave = false, targetTableIndices = null, _skipWorldInfoSync = false, _useRawRange = false, rowAction = null) {
            const loadConfig = window.Gaigai.loadConfig || (() => Promise.resolve());
            await loadConfig();

            const m = window.Gaigai.m;
            const C = window.Gaigai.config_obj;
            const API_CONFIG = window.Gaigai.config;
            const initialSessionId = m.gid();
            m.load();

            const selected = Array.isArray(targetTableIndices) && targetTableIndices.length > 0
                ? targetTableIndices
                : (Array.isArray(C.autoSummaryTargetTables) && C.autoSummaryTargetTables.length > 0
                    ? C.autoSummaryTargetTables
                    : getSelectedTableIndices());
            const sources = captureSummarySources(selected);
            if (!sources.length) {
                if (!isSilent) await window.Gaigai.customAlert('所选表格没有可总结的白色行。', '无新内容');
                return { success: false, error: '没有可总结的表格行' };
            }

            const ctx = m.ctx() || {};
            const promptManager = window.Gaigai.PromptManager;
            const rawPrompt = promptManager?.get('summaryPromptTable') || '请总结以下记忆表格。';
            const targetPrompt = promptManager?.resolveVariables
                ? promptManager.resolveVariables(rawPrompt, ctx)
                : rawPrompt;
            const nsfwPrompt = promptManager?.get('nsfwPrompt') || '';
            const messages = [];
            if (nsfwPrompt.trim()) {
                messages.push({
                    role: 'system',
                    content: promptManager?.resolveVariables ? promptManager.resolveVariables(nsfwPrompt, ctx) : nsfwPrompt
                });
            }
            for (const source of sources) {
                const sheet = m.get(source.tableIndex);
                messages.push({
                    role: 'system',
                    name: `SYSTEM (${source.name})`,
                    content: `【待总结的表格 - ${source.name}】\n${sheet.txt(source.tableIndex)}`,
                    isGaigaiData: true
                });
            }
            messages.push({ role: 'user', content: targetPrompt });

            window.Gaigai.lastRequestData = {
                chat: JSON.parse(JSON.stringify(messages)),
                timestamp: Date.now(),
                model: API_CONFIG.model || 'Unknown'
            };
            window.isSummarizing = true;

            let result;
            try {
                result = API_CONFIG.useIndependentAPI
                    ? await window.Gaigai.tools.callIndependentAPI(messages)
                    : await window.Gaigai.tools.callTavernAPI(messages);
            } catch (error) {
                window.isSummarizing = false;
                console.error('❌ [表格总结] API 请求失败:', error);
                if (!isSilent) await window.Gaigai.customAlert(`API 请求失败：${error.message}`, '总结失败');
                return { success: false, error: error.message };
            }

            if (m.gid() !== initialSessionId) {
                window.isSummarizing = false;
                return { success: false, error: '会话已切换，取消写入' };
            }
            if (!result?.success || !result.summary) {
                window.isSummarizing = false;
                if (!isSilent) await window.Gaigai.customAlert('总结模型没有返回有效正文。', '总结失败');
                return { success: false, error: result?.error || '总结为空' };
            }

            const summary = cleanSummaryOutput(result.summary);
            if (summary.length < 10) {
                window.isSummarizing = false;
                if (!isSilent) await window.Gaigai.customAlert('总结内容过短，未写入。', '总结失败');
                return { success: false, error: '总结内容过短' };
            }

            const normalizedAction = normalizeRowAction(rowAction || C.summaryRowAction);
            let finalSummary = summary;
            let note = '';
            let finalAction = normalizedAction;
            if (!isSilent) {
                const preview = await this.showSummaryPreview(summary, normalizedAction);
                if (!preview) {
                    window.isSummarizing = false;
                    return { success: false, error: '用户取消保存' };
                }
                if (preview.regenerate) {
                    window.isSummarizing = false;
                    return this.callAIForSummary(
                        _forceStart,
                        _forceEnd,
                        _forcedMode,
                        false,
                        _isBatch,
                        _skipSave,
                        selected,
                        _skipWorldInfoSync,
                        _useRawRange,
                        normalizedAction
                    );
                }
                finalSummary = preview.summary;
                note = preview.note;
                finalAction = preview.rowAction;
            }

            m.sm.save(finalSummary, note);
            await applySourceRowAction(sources, finalAction);
            persistSummaryState();

            try {
                const vectorResult = await syncSummaryVectors();
                if (vectorResult && vectorResult.success === false) {
                    throw new Error(vectorResult.error || '向量同步失败');
                }
            } catch (error) {
                console.error('❌ [表格总结] 总结已保存，但向量同步失败:', error);
                if (typeof toastr !== 'undefined') toastr.warning(error.message, '总结已保存，向量化失败');
            }

            window.isSummarizing = false;
            if (typeof toastr !== 'undefined') toastr.success('记忆表格总结已保存', '总结完成');
            return { success: true, summary: finalSummary, rowAction: finalAction };
        }

        showSummaryPreview(summaryText, defaultAction = 'hide') {
            return new Promise(resolve => {
                const UI = window.Gaigai.ui;
                const overlay = $('<div id="gg-summary-preview"></div>').css({
                    position: 'fixed', inset: 0, zIndex: 10000030,
                    background: 'rgba(0,0,0,.65)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '16px'
                });
                const box = $('<div></div>').css({
                    width: 'min(760px, 94vw)', maxHeight: '88vh', overflow: 'auto',
                    background: UI.c, color: UI.tc, borderRadius: '8px', padding: '16px'
                });
                const textarea = $('<textarea></textarea>').val(summaryText).css({
                    width: '100%', minHeight: '360px', boxSizing: 'border-box',
                    padding: '10px', resize: 'vertical', fontFamily: 'inherit'
                });
                const note = $('<input type="text" placeholder="备注（可选，不进入向量）">').css({ width: '100%', boxSizing: 'border-box', padding: '8px', marginTop: '8px' });
                const action = $(`
                    <select style="width:100%;padding:8px;margin-top:8px;">
                        <option value="keep">保留源行</option>
                        <option value="hide">隐藏源行</option>
                        <option value="delete">删除源行</option>
                    </select>`).val(normalizeRowAction(defaultAction));
                const buttons = $('<div></div>').css({ display: 'flex', gap: '8px', marginTop: '12px' });
                const cancel = $('<button type="button">取消</button>').css({ flex: 1, padding: '9px' });
                const regenerate = $('<button type="button">🔄 重新生成</button>').css({ flex: 1, padding: '9px', background: '#17a2b8', color: '#fff', border: 0, borderRadius: '4px' });
                const save = $('<button type="button">保存总结</button>').css({ flex: 1, padding: '9px', background: '#4caf50', color: '#fff', border: 0, borderRadius: '4px' });
                cancel.on('click', () => { overlay.remove(); resolve(null); });
                regenerate.on('click', () => { overlay.remove(); resolve({ regenerate: true }); });
                save.on('click', () => {
                    const summary = String(textarea.val() || '').trim();
                    if (!summary) return;
                    overlay.remove();
                    resolve({ summary, note: String(note.val() || '').trim(), rowAction: normalizeRowAction(action.val()) });
                });
                buttons.append(cancel, regenerate, save);
                box.append('<h3 style="margin:0 0 10px;">📝 检查总结</h3>', textarea, note, action, buttons);
                overlay.append(box);
                $('body').append(overlay);
            });
        }
    }

    window.Gaigai.SummaryManager = new SummaryManager();
    console.log('✅ [SummaryManager] 已挂载到 window.Gaigai.SummaryManager');
})();
