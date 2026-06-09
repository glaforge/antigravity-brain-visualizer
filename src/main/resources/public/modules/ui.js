import { escapeHtml, formatTime } from './utils.js';

// Modal logic
const modal = document.getElementById('file-modal');
const modalTitle = document.getElementById('file-modal-title');
const modalContent = document.getElementById('file-modal-content');
const closeBtn = document.getElementById('close-modal-btn');

closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.add('hidden');
    }
});

// Intercept file:// links
document.addEventListener('click', async (e) => {
    const link = e.target.closest('a');
    if (link && link.href && link.href.startsWith('file://')) {
        e.preventDefault();
        
        let path = link.href.replace('file://', '');
        // Strip line numbers hash like #L10-L20 if present
        path = path.split('#')[0];
        // Decode URL encoding
        path = decodeURIComponent(path);
        
        try {
            const res = await fetch(`/api/brain/file?path=${encodeURIComponent(path)}`);
            if (!res.ok) {
                if (res.status === 404) throw new Error("File not found");
                throw new Error("Failed to load file");
            }
            const content = await res.text();
            
            modalTitle.innerText = path;
            
            // Map common file extensions to highlight.js language classes
            const ext = path.split('.').pop().toLowerCase();
            const supportedExts = ['js', 'json', 'java', 'html', 'css', 'md', 'sh', 'bash', 'yaml', 'yml', 'xml', 'sql', 'kt', 'kts', 'gradle', 'properties', 'py', 'go', 'rs', 'cpp', 'c', 'ts', 'jsx', 'tsx'];
            let langClass = '';
            if (supportedExts.includes(ext)) {
                langClass = `language-${ext}`;
            }
            
            modalContent.className = langClass;
            modalContent.innerHTML = escapeHtml(content);
            
            if (langClass && window.hljs) {
                delete modalContent.dataset.highlighted;
                hljs.highlightElement(modalContent);
            }
            
            modal.classList.remove('hidden');
        } catch (err) {
            alert(err.message + ":\n" + path);
        }
    }
});

// Timeline Scrubber Logic
document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('timeline-track');
    if(!track) return;
    const thumb = document.getElementById('timeline-thumb');
    const label = document.getElementById('timeline-label');
    const scrollContainer = document.getElementById('transcript-container');
    
    if (!scrollContainer) return;
    
    let isDragging = false;
    
    function updateScrubberFromScroll() {
        const scrollableHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (scrollableHeight <= 0) {
            thumb.style.top = '0px';
            return;
        }
        
        const scrollPerc = scrollContainer.scrollTop / scrollableHeight;
        const trackHeight = track.clientHeight;
        const thumbHeight = thumb.clientHeight;
        
        const maxTop = trackHeight - thumbHeight;
        thumb.style.top = (scrollPerc * maxTop) + 'px';
        
        updateLabelText();
    }
    
    function updateLabelText() {
        const cards = document.querySelectorAll('.step-card');
        if (cards.length === 0) return;
        
        let closestCard = cards[0];
        let minDiff = Infinity;
        
        const containerRect = scrollContainer.getBoundingClientRect();
        
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // diff relative to the top of the scrolling container
            const diff = Math.abs(rect.top - containerRect.top);
            // rect.top - containerRect.top is negative if it scrolled past the top
            if (diff < minDiff && (rect.top - containerRect.top) >= -100) {
                minDiff = diff;
                closestCard = card;
            }
        });
        
        if (closestCard && closestCard.dataset.time) {
            label.innerText = closestCard.dataset.time;
        }
    }
    
    function scrollToTrackPosition(clientY) {
        const rect = track.getBoundingClientRect();
        let y = clientY - rect.top;
        y = Math.max(0, Math.min(y, rect.height));
        
        const perc = y / rect.height;
        const scrollableHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollContainer.scrollTo(0, perc * scrollableHeight);
        
        updateLabelText();
    }
    
    track.addEventListener('mousedown', (e) => {
        isDragging = true;
        track.classList.add('active');
        e.preventDefault(); // Prevent text selection
        scrollToTrackPosition(e.clientY);
    });
    
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        scrollToTrackPosition(e.clientY);
    });
    
    window.addEventListener('mouseup', () => {
        isDragging = false;
        track.classList.remove('active');
    });
    
    scrollContainer.addEventListener('scroll', updateScrubberFromScroll);
    setTimeout(updateScrubberFromScroll, 500);
    window.addEventListener('transcriptLoaded', updateScrubberFromScroll);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
    }
});
