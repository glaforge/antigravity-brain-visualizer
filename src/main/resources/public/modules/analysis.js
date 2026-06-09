import { state, escapeHtml } from './utils.js';

export async function triggerAnalysis(sessionId, force) {
    const btn = document.getElementById('summarize-btn');
    const aiContainer = document.getElementById('ai-summary-container');
    const aiText = document.getElementById('ai-summary-text');
    
    if (force) {
        btn.disabled = true;
        btn.innerHTML = '<span class="sparkle-icon">⏳</span> Recomputing...';
    }
    
    aiContainer.classList.remove('hidden');
    
    if (force) {
        const content = document.getElementById('ai-summary-content');
        content.classList.remove('collapsed');
        const chevron = document.getElementById('ai-summary-header').querySelector('.chevron');
        chevron.style.transform = 'rotate(90deg)';
        aiText.innerHTML = "<em>Recomputing transcript analysis...</em>";
    } else if (!state.summaryCache[sessionId]) {
        aiText.innerHTML = "<em>Loading analysis...</em>";
    } else {
        aiText.innerHTML = state.summaryCache[sessionId];
        return; // already cached and not forced
    }
    
    let currentPollSessionId = sessionId;
    state.currentPollSessionId = sessionId;

    try {
        const flavor = encodeURIComponent(document.getElementById('flavor-select').value);
        let url = `/api/analysis/conversations/${sessionId}/summarize?flavor=${flavor}`;
        if (force) url += '&force=true';
        
        // Progress UI
        if (force || !state.summaryCache[sessionId]) {
            const pContainer = document.createElement('div');
            pContainer.innerHTML = `
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px;"><span id="progress-phase">Starting analysis...</span> <span id="progress-text">0%</span></div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                    <div id="progress-bar" style="width: 0%; height: 100%; background: var(--accent-blue); transition: width 0.3s ease-out;"></div>
                </div>
            `;
            aiText.innerHTML = '';
            aiText.appendChild(pContainer);
        }

        let polling = true;
        const pollProgress = async () => {
            while(polling && state.currentPollSessionId === sessionId) {
                try {
                    const pres = await fetch(`/api/analysis/conversations/${sessionId}/progress`);
                    if (pres.ok) {
                        const pdata = await pres.json();
                        if (pdata.progress >= 0 && state.currentPollSessionId === sessionId) {
                            const phase = document.getElementById('progress-phase');
                            const pt = document.getElementById('progress-text');
                            const pb = document.getElementById('progress-bar');
                            if (phase) phase.innerText = pdata.phase;
                            if (pt) pt.innerText = pdata.progress + '%';
                            if (pb) pb.style.width = pdata.progress + '%';
                        }
                    }
                } catch(e) {}
                await new Promise(r => setTimeout(r, 1000));
            }
        };
        
        pollProgress();

        const res = await fetch(url);
        polling = false; // stop polling
        
        const data = await res.json();
            
        let html = '';
        if (data.summary) {
            html += `<p style="font-size: 1.05rem; margin-bottom: 24px; line-height: 1.6; color: var(--text-primary);">${escapeHtml(data.summary)}</p>`;
        }
        
        if (data.flow && data.flow.length > 0) {
            html += `<h4 style="color: var(--accent-blue); margin-top: 16px; margin-bottom: 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Conversation Flow</h4>`;
            html += `<ul style="list-style-type: none; padding-left: 0; margin-bottom: 24px;">`;
            data.flow.forEach((item, i) => {
                html += `<li style="margin-bottom: 10px; padding-left: 24px; position: relative; color: var(--text-secondary); line-height: 1.5;">
                    <span style="position: absolute; left: 0; top: 0; color: var(--accent-blue);">→</span>${escapeHtml(item)}
                </li>`;
            });
            html += `</ul>`;
        }
        
        if (data.agentActions && data.agentActions.length > 0) {
            html += `<h4 style="color: var(--accent-purple); margin-top: 16px; margin-bottom: 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Agent Actions Breakdown</h4>`;
            html += `<div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">`;
            data.agentActions.forEach(action => {
                html += `<div style="background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 14px;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 6px; font-family: var(--font-mono); font-size: 0.85rem;">${escapeHtml(action.action)}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(action.description)}</div>
                </div>`;
            });
            html += `</div>`;
        }
        
        if (data.issues && data.issues.length > 0) {
            html += `<h4 style="color: var(--error); margin-top: 16px; margin-bottom: 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Issues & Circumventions</h4>`;
            html += `<div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">`;
            data.issues.forEach(issue => {
                html += `<div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; padding: 14px;">
                    <div style="font-weight: 600; color: #fca5a5; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        ISSUE
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.5;">${escapeHtml(issue.error)}</div>`;
                
                const circumvention = issue.circumvention ? issue.circumvention.trim() : '';
                const isUnresolved = !circumvention || circumvention.toLowerCase() === 'null' || circumvention.toLowerCase() === 'none' || circumvention.toLowerCase() === 'n/a';
                
                if (!isUnresolved) {
                    html += `
                    <div style="font-weight: 600; color: var(--success); margin-top: 12px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        RESOLUTION
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(circumvention)}</div>`;
                } else {
                    html += `
                    <div style="font-weight: 600; color: #64748b; margin-top: 12px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-style: italic;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                        UNRESOLVED
                    </div>`;
                }
                
                html += `</div>`;
            });
            html += `</div>`;
        }
        
        if (data.recommendations && data.recommendations.length > 0) {
            html += `<h4 style="color: #10b981; margin-top: 16px; margin-bottom: 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Future Recommendations</h4>`;
            html += `<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">`;
            data.recommendations.forEach(rec => {
                html += `<div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; padding: 12px; font-size: 0.9rem; color: var(--text-primary); line-height: 1.5; display: flex; align-items: flex-start; gap: 10px;">
                    <svg style="flex-shrink: 0; margin-top: 2px; color: #10b981;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    <span>${escapeHtml(rec)}</span>
                </div>`;
            });
            html += `</div>`;
        }

        aiText.innerHTML = html || "<span style='color:red;'>Failed to parse analysis data.</span>";
        state.summaryCache[sessionId] = aiText.innerHTML;
        
        if (data.shortTitle) {
            const sidebarItem = document.querySelector(`.conv-item[data-id="${sessionId}"] .conv-id`);
            if (sidebarItem) {
                sidebarItem.innerText = data.shortTitle;
            }
            document.getElementById('current-session-title').innerText = data.shortTitle;
        }
    } catch (e) {
        aiText.innerHTML = "<span style='color:red;'>Error analyzing transcript.</span>";
    } finally {
        if (force) {
            btn.innerHTML = '<span class="sparkle-icon">✨</span> Recompute Analysis';
            btn.disabled = false;
        }
    }
}
