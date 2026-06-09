export const state = { activeFilters: { userQueries: false, toolsCalled: false, outcomeErrors: false, modelResponses: false }, spansMultipleDays: false, summaryCache: {} };

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export function syntaxHighlight(json) {
    if (typeof json != 'string') {
         json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

export function formatTime(dateStr, withSeconds = false) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (state.spansMultipleDays) {
        if (withSeconds) {
            return d.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ', ' + d.toLocaleTimeString([], {hour12: false});
        } else {
            return d.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ', ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
        }
    } else {
        if (withSeconds) {
            return d.toLocaleTimeString([], {hour12: false});
        } else {
            return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
        }
    }
};

export function updateTranscriptFilter() {
    const cards = document.querySelectorAll('.step-card');
    const { userQueries, toolsCalled, outcomeErrors, modelResponses } = state.activeFilters;
    
    if (!userQueries && !toolsCalled && !outcomeErrors && !modelResponses) {
        cards.forEach(c => c.style.display = 'block');
        return;
    }
    
    cards.forEach(c => {
        const isUser = c.dataset.isUser === 'true';
        const isTool = c.dataset.isTool === 'true';
        const isError = c.dataset.isError === 'true';
        const isModel = c.dataset.isModel === 'true';
        
        let show = false;
        if (userQueries && isUser) show = true;
        if (toolsCalled && isTool) show = true;
        if (outcomeErrors && isError) show = true;
        if (modelResponses && isModel) show = true;
        
        c.style.display = show ? 'block' : 'none';
    });
};
