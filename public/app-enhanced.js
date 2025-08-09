// Enhanced App JavaScript with Color Coding and Animations

// Utility function to determine log level from message content
function detectLogLevel(message) {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('error') || lowerMsg.includes('fail') || lowerMsg.includes('exception')) {
        return 'error';
    } else if (lowerMsg.includes('warn') || lowerMsg.includes('warning')) {
        return 'warning';
    } else if (lowerMsg.includes('success') || lowerMsg.includes('complete') || lowerMsg.includes('connected')) {
        return 'success';
    } else if (lowerMsg.includes('debug') || lowerMsg.includes('trace')) {
        return 'debug';
    } else if (lowerMsg.includes('info')) {
        return 'info';
    }
    return 'default';
}

// Enhanced log entry formatter with color coding
function formatLogEntryEnhanced(log) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const level = log.level || detectLogLevel(log.message || '');
    const levelColors = {
        error: '#ff6b6b',
        warning: '#feca57',
        info: '#54a0ff',
        debug: '#a29bfe',
        success: '#00ff88',
        default: '#718096'
    };
    
    const levelIcons = {
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️',
        debug: '🔍',
        success: '✅',
        default: '📝'
    };
    
    const color = levelColors[level] || levelColors.default;
    const icon = levelIcons[level] || levelIcons.default;
    
    return `
        <div class="console-line ${level}" style="animation: slideIn 0.3s ease;">
            <span style="color: ${color}; margin-right: 8px;">${icon}</span>
            <span style="color: #718096; margin-right: 12px;">[${timestamp}]</span>
            ${log.serverName ? `<span style="color: #667eea; margin-right: 12px;">[${escapeHtml(log.serverName)}]</span>` : ''}
            <span style="color: ${color};">${escapeHtml(log.message)}</span>
        </div>
    `;
}

// Enhanced server status with animated indicators
function renderServerStatusEnhanced(server) {
    const statusClasses = {
        connected: 'online',
        connecting: 'pending',
        error: 'error',
        disconnected: 'offline'
    };
    
    const statusClass = statusClasses[server.status] || 'offline';
    
    return `
        <div class="server-status" style="display: flex; align-items: center;">
            <div class="server-status-indicator ${statusClass}"></div>
            <span style="font-weight: 500;">${server.status}</span>
        </div>
    `;
}

// Add particle effects to the dashboard
function createParticleEffects() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles';
    document.body.appendChild(particlesContainer);
    
    const colors = ['#00d4ff', '#bd00ff', '#ff0080', '#00ff88', '#ffee00'];
    
    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        particlesContainer.appendChild(particle);
    }
}

// Add loading spinner to async operations
function showLoadingSpinner(container) {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.id = 'temp-spinner';
    container.appendChild(spinner);
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('temp-spinner');
    if (spinner) {
        spinner.remove();
    }
}

// Add toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.5rem;">
                ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Enhanced chart rendering with animations
function renderAnimatedChart(container, data, type = 'bar') {
    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = 200;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.8)');
    gradient.addColorStop(1, 'rgba(118, 75, 162, 0.8)');
    
    // Simple animated bar chart
    const maxValue = Math.max(...data.map(d => d.value));
    const barWidth = canvas.width / data.length - 20;
    
    let currentHeight = 0;
    const animationDuration = 1000;
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        data.forEach((item, index) => {
            const x = index * (barWidth + 20) + 10;
            const targetHeight = (item.value / maxValue) * 150;
            const height = targetHeight * easeOutQuart(progress);
            const y = canvas.height - height - 30;
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, height);
            
            // Add value label
            ctx.fillStyle = '#2d3748';
            ctx.font = '12px Rubik';
            ctx.textAlign = 'center';
            ctx.fillText(item.label, x + barWidth / 2, canvas.height - 10);
            
            // Add value on top
            ctx.fillText(item.value, x + barWidth / 2, y - 5);
        });
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// Easing function for smooth animations
function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
}

// Add ripple effect to buttons
function addRippleEffect(button) {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        this.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    });
}

// Enhanced initialization
function initializeEnhancements() {
    // Add particle effects
    createParticleEffects();
    
    // Add ripple effects to all buttons
    document.querySelectorAll('button, .btn, .tab').forEach(button => {
        addRippleEffect(button);
    });
    
    // Add hover sound effects (optional)
    document.querySelectorAll('.server-item, .stat-card, .tool-card').forEach(element => {
        element.addEventListener('mouseenter', () => {
            element.style.transform = 'scale(1.02)';
        });
        element.addEventListener('mouseleave', () => {
            element.style.transform = 'scale(1)';
        });
    });
    
    // Add loading animations to fetch operations
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const container = document.querySelector('.main-content');
        if (container && !document.getElementById('temp-spinner')) {
            showLoadingSpinner(container);
        }
        
        return originalFetch.apply(this, args).finally(() => {
            hideLoadingSpinner();
        });
    };
}

// Add CSS for ripple effect
const rippleStyles = `
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: rippleEffect 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes rippleEffect {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    button, .btn, .tab {
        position: relative;
        overflow: hidden;
    }
`;

// Add styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = rippleStyles;
document.head.appendChild(styleSheet);

// Export functions for use in main app
window.enhancedFormatters = {
    formatLogEntry: formatLogEntryEnhanced,
    renderServerStatus: renderServerStatusEnhanced,
    showToast,
    renderAnimatedChart,
    initializeEnhancements
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEnhancements);
} else {
    initializeEnhancements();
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}