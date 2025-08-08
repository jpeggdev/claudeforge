class MCPProxyManager {
    constructor() {
        this.servers = [];
        this.selectedServer = null;
        this.permissions = new Map();
        this.ws = null;
        this.sessionId = null;
        this.serverLogs = [];
        this.systemLogs = [];
        this.maxLogs = 500;
        
        // Debug features
        this.debugEnabled = false;
        this.debugMessages = [];
        this.debugStats = {};
        this.debugEventSource = null;
        
        // Firehose features
        this.firehoseEnabled = true;
        this.firehosePaused = false;
        this.firehoseFilter = '';
        this.firehoseTextFilter = '';
        this.firehoseEventCount = 0;
        this.firehoseEventRate = 0;
        this.firehoseBuffer = [];
        this.firehoseFullBuffer = []; // Keep all events for filtering
        this.maxFirehoseLines = 1000;
        this.firehoseAutoScroll = true;
        this.firehoseUserScrolled = false;
        this.firehoseNoiseReduction = true;
        this.firehoseExclusions = {
            'ws-out': true,
            'ws-in': true,
            'firehose': true,
            'stats': true,
            'heartbeat': true,
            'static': true,
            'api-status': false,
            'options': false
        };
        this.firehoseCustomExclusions = [];
        
        this.init();
    }

    async init() {
        await this.loadServers();
        await this.loadSessions();
        await this.loadLogs();
        await this.loadDebugStatus();
        this.setupWebSocket();
        this.setupEventListeners();
        this.setupDebugStream();
        this.initializeFirehoseUI();
        this.render();
    }
    
    initializeFirehoseUI() {
        // Set initial state of noise reduction button
        const btn = document.getElementById('firehose-noise-btn');
        const exclusionsDiv = document.getElementById('firehose-exclusions');
        
        if (btn) {
            if (this.firehoseNoiseReduction) {
                btn.innerHTML = '<span id="firehose-noise-icon">🔇</span> Reduce Noise';
                btn.style.background = 'var(--bg-success)';
                if (exclusionsDiv) exclusionsDiv.style.display = 'block';
            } else {
                btn.innerHTML = '<span id="firehose-noise-icon">🔊</span> Show All';
                btn.style.background = '';
                if (exclusionsDiv) exclusionsDiv.style.display = 'none';
            }
        }
    }

    async loadServers() {
        try {
            const response = await fetch('/api/servers');
            this.servers = await response.json();
            this.updateStats();
        } catch (error) {
            console.error('Failed to load servers:', error);
        }
    }

    async loadSessions() {
        try {
            const response = await fetch('/api/sessions');
            const sessions = await response.json();
            if (sessions.length > 0) {
                this.sessionId = sessions[0].id;
                sessions[0].permissions.forEach(perm => {
                    this.permissions.set(perm.key, perm);
                });
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    }

    async loadLogs() {
        try {
            const response = await fetch('/api/logs?limit=100');
            const allLogs = await response.json();
            
            // Split logs into server and system logs
            this.serverLogs = allLogs.filter(log => log.serverId || log.serverName);
            this.systemLogs = allLogs.filter(log => !log.serverId && !log.serverName);
            
            this.renderServerLogs();
            this.renderSystemLogs();
            this.updateLogFilters();
        } catch (error) {
            console.error('Failed to load logs:', error);
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'status') {
                this.updateServerStatuses(data.servers);
            } else if (data.type === 'log') {
                this.addLog(data.log);
            } else if (data.type === 'firehose') {
                this.handleFirehoseEvent(data.event);
            } else if (data.type === 'firehose-stats') {
                this.updateFirehoseStats(data.stats);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            setTimeout(() => this.setupWebSocket(), 5000);
        };
    }

    setupEventListeners() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                const tabId = e.target.dataset.tab + '-tab';
                document.getElementById(tabId).classList.add('active');
                
                // When switching to server logs tab, filter to selected server
                if (e.target.dataset.tab === 'server-logs' && this.selectedServer) {
                    const serverFilter = document.getElementById('server-log-server-filter');
                    serverFilter.value = this.selectedServer.id;
                    this.renderServerLogs();
                }
            });
        });

        document.getElementById('tool-search').addEventListener('input', (e) => {
            this.filterTools(e.target.value);
        });

        document.getElementById('resource-search').addEventListener('input', (e) => {
            this.filterResources(e.target.value);
        });

        document.getElementById('prompt-search').addEventListener('input', (e) => {
            this.filterPrompts(e.target.value);
        });

        document.getElementById('server-log-level-filter').addEventListener('change', () => {
            this.renderServerLogs();
        });

        document.getElementById('server-log-server-filter').addEventListener('change', () => {
            this.renderServerLogs();
        });

        document.getElementById('system-log-level-filter').addEventListener('change', () => {
            this.renderSystemLogs();
        });
        
        // Add event listeners for firehose exclusion checkboxes
        const exclusionCheckboxes = [
            'exclude-ws-out', 'exclude-ws-in', 'exclude-firehose', 
            'exclude-stats', 'exclude-heartbeat', 'exclude-static',
            'exclude-api-status', 'exclude-options'
        ];
        
        exclusionCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => this.updateFirehoseExclusions());
            }
        });
    }

    updateServerStatuses(statuses) {
        statuses.forEach(status => {
            const server = this.servers.find(s => s.id === status.id);
            if (server) {
                server.status = status.status;
                server.error = status.error;
            }
        });
        this.renderServerList();
    }

    updateStats() {
        const connectedServers = this.servers.filter(s => s.status === 'connected').length;
        const totalTools = this.servers.reduce((sum, s) => sum + (s.tools?.length || 0), 0);
        const totalResources = this.servers.reduce((sum, s) => sum + (s.resources?.length || 0), 0);
        
        document.getElementById('server-count').textContent = connectedServers;
        document.getElementById('tool-count').textContent = totalTools;
        document.getElementById('resource-count').textContent = totalResources;
    }

    render() {
        this.renderServerList();
        if (this.selectedServer) {
            this.renderTools();
            this.renderResources();
            this.renderPrompts();
        }
    }

    renderServerList() {
        const container = document.getElementById('server-list');
        container.innerHTML = '';

        this.servers.forEach(server => {
            const li = document.createElement('li');
            li.className = 'server-item';
            if (server.status === 'connected') {
                li.classList.add('connected');
            } else if (server.status === 'disabled') {
                li.classList.add('disabled');
            } else if (server.status === 'error') {
                li.classList.add('error');
            }
            if (this.selectedServer?.id === server.id) {
                li.classList.add('selected');
            }

            let statusInfo = '';
            if (server.status === 'connected') {
                statusInfo = `${server.tools?.length || 0} tools • ${server.resources?.length || 0} resources`;
            } else if (server.status === 'disabled') {
                statusInfo = `Disabled${server.error && server.error !== 'Server is disabled' ? `: ${server.error}` : ''}`;
            } else if (server.status === 'error') {
                statusInfo = `Error: ${server.error || 'Connection failed'}`;
            } else {
                statusInfo = server.status;
            }
            
            li.innerHTML = `
                <div class="server-name">${server.name}</div>
                <div class="server-info">${statusInfo}</div>
            `;

            li.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.selectServer(server);
                }
            });

            container.appendChild(li);
        });

        this.updateStats();
    }

    selectServer(server) {
        this.selectedServer = server;
        this.render();
        
        // Update server log filter if on server logs tab
        const activeTab = document.querySelector('.tab.active');
        if (activeTab && activeTab.dataset.tab === 'server-logs') {
            const serverFilter = document.getElementById('server-log-server-filter');
            serverFilter.value = server.id;
            this.renderServerLogs();
        }
    }

    renderTools() {
        const container = document.getElementById('tools-grid');
        
        if (!this.selectedServer || !this.selectedServer.tools?.length) {
            container.innerHTML = '<div class="empty-state">No tools available</div>';
            return;
        }

        container.innerHTML = '';
        this.selectedServer.tools.forEach(tool => {
            const permKey = `${this.selectedServer.id}:${tool.name}`;
            const permission = this.permissions.get(permKey) || { enabled: true };

            const div = document.createElement('div');
            div.className = 'tool-card';
            div.innerHTML = `
                <div class="tool-header">
                    <span class="tool-name">${tool.name}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" ${permission.enabled ? 'checked' : ''} 
                               onchange="app.toggleTool('${this.selectedServer.id}', '${tool.name}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="tool-description">${tool.description || 'No description'}</div>
                <div class="permission-controls">
                    <label class="permission-label">
                        <input type="checkbox" ${permission.permissions?.read ? 'checked' : ''} 
                               onchange="app.updatePermission('${this.selectedServer.id}', '${tool.name}', 'read', this.checked)">
                        Read
                    </label>
                    <label class="permission-label">
                        <input type="checkbox" ${permission.permissions?.write ? 'checked' : ''} 
                               onchange="app.updatePermission('${this.selectedServer.id}', '${tool.name}', 'write', this.checked)">
                        Write
                    </label>
                    <label class="permission-label">
                        <input type="checkbox" ${permission.permissions?.execute !== false ? 'checked' : ''} 
                               onchange="app.updatePermission('${this.selectedServer.id}', '${tool.name}', 'execute', this.checked)">
                        Execute
                    </label>
                </div>
            `;
            container.appendChild(div);
        });
    }

    renderResources() {
        const container = document.getElementById('resources-grid');
        
        if (!this.selectedServer || !this.selectedServer.resources?.length) {
            container.innerHTML = '<div class="empty-state">No resources available</div>';
            return;
        }

        container.innerHTML = '';
        this.selectedServer.resources.forEach(resource => {
            const div = document.createElement('div');
            div.className = 'tool-card';
            div.innerHTML = `
                <div class="tool-header">
                    <span class="tool-name">${resource.name || resource.uri}</span>
                </div>
                <div class="tool-description">URI: ${resource.uri}</div>
                <div class="tool-description">Type: ${resource.mimeType || 'Unknown'}</div>
            `;
            container.appendChild(div);
        });
    }

    renderPrompts() {
        const container = document.getElementById('prompts-grid');
        
        if (!this.selectedServer || !this.selectedServer.prompts?.length) {
            container.innerHTML = '<div class="empty-state">No prompts available</div>';
            return;
        }

        container.innerHTML = '';
        this.selectedServer.prompts.forEach(prompt => {
            const div = document.createElement('div');
            div.className = 'tool-card';
            div.innerHTML = `
                <div class="tool-header">
                    <span class="tool-name">${prompt.name}</span>
                </div>
                <div class="tool-description">${prompt.description || 'No description'}</div>
            `;
            container.appendChild(div);
        });
    }

    async toggleTool(serverId, toolName, enabled) {
        const permKey = `${serverId}:${toolName}`;
        let permission = this.permissions.get(permKey) || {
            serverId,
            toolName,
            enabled: true,
            permissions: { read: true, write: true, execute: true }
        };

        permission.enabled = enabled;
        this.permissions.set(permKey, permission);

        if (this.sessionId) {
            await this.savePermission(serverId, toolName, permission);
        }
    }

    async updatePermission(serverId, toolName, type, value) {
        const permKey = `${serverId}:${toolName}`;
        let permission = this.permissions.get(permKey) || {
            serverId,
            toolName,
            enabled: true,
            permissions: {}
        };

        permission.permissions[type] = value;
        this.permissions.set(permKey, permission);

        if (this.sessionId) {
            await this.savePermission(serverId, toolName, permission);
        }
    }

    async savePermission(serverId, toolName, permission) {
        try {
            await fetch(`/api/sessions/${this.sessionId}/permissions/${serverId}/${toolName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(permission)
            });
        } catch (error) {
            console.error('Failed to save permission:', error);
        }
    }

    async refreshServers() {
        // Animate the refresh button
        const btn = event.target;
        if (btn) {
            btn.style.transform = 'rotate(360deg)';
            btn.style.transition = 'transform 0.5s';
            setTimeout(() => {
                btn.style.transform = '';
            }, 500);
        }
        
        // First load current server states
        await this.loadServers();
        
        // Find servers in error state and try to restart them
        const serversToRestart = this.servers.filter(s => 
            s.status === 'error' || s.status === 'disconnected'
        );
        
        // Restart failed servers
        for (const server of serversToRestart) {
            console.log(`Attempting to restart ${server.name}...`);
            try {
                const response = await fetch(`/api/servers/${server.id}/restart`, { 
                    method: 'POST' 
                });
                const result = await response.json();
                if (!result.success) {
                    console.error(`Failed to restart ${server.name}:`, result.error);
                }
            } catch (error) {
                console.error(`Error restarting ${server.name}:`, error);
            }
        }
        
        // If any servers were restarted, wait a moment and reload
        if (serversToRestart.length > 0) {
            setTimeout(async () => {
                await this.loadServers();
                this.render();
            }, 2000);
        } else {
            this.render();
        }
    }

    async reloadConfig() {
        // Animate the reload button
        const btn = event.target;
        if (btn) {
            btn.style.transform = 'rotate(360deg)';
            btn.style.transition = 'transform 0.5s';
            setTimeout(() => {
                btn.style.transform = '';
            }, 500);
        }
        
        try {
            const response = await fetch('/api/config/reload', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                console.log('Config reloaded successfully');
                // Wait a moment for servers to restart
                setTimeout(() => {
                    this.loadServers();
                    this.render();
                }, 1000);
            } else {
                console.error('Failed to reload config:', result.error);
            }
        } catch (error) {
            console.error('Failed to reload config:', error);
        }
    }

    async restartServer(serverId) {
        try {
            await fetch(`/api/servers/${serverId}/restart`, { method: 'POST' });
            await this.loadServers();
        } catch (error) {
            console.error('Failed to restart server:', error);
        }
    }

    async stopServer(serverId) {
        try {
            await fetch(`/api/servers/${serverId}`, { method: 'DELETE' });
            await this.loadServers();
        } catch (error) {
            console.error('Failed to stop server:', error);
        }
    }

    filterTools(query) {
        const items = document.querySelectorAll('#tools-grid .tool-card');
        items.forEach(item => {
            const name = item.querySelector('.tool-name').textContent.toLowerCase();
            const description = item.querySelector('.tool-description').textContent.toLowerCase();
            item.style.display = (name.includes(query.toLowerCase()) || 
                                 description.includes(query.toLowerCase())) ? '' : 'none';
        });
    }

    filterResources(query) {
        const items = document.querySelectorAll('#resources-grid .tool-card');
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
        });
    }

    filterPrompts(query) {
        const items = document.querySelectorAll('#prompts-grid .tool-card');
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
        });
    }

    addLog(log) {
        // Add to appropriate log array
        if (log.serverId || log.serverName) {
            this.serverLogs.push(log);
            if (this.serverLogs.length > this.maxLogs) {
                this.serverLogs.shift();
            }
            this.appendServerLogEntry(log);
        } else {
            this.systemLogs.push(log);
            if (this.systemLogs.length > this.maxLogs) {
                this.systemLogs.shift();
            }
            this.appendSystemLogEntry(log);
        }
        this.updateLogFilters();
    }

    renderServerLogs() {
        const container = document.getElementById('server-logs-container');
        const levelFilter = document.getElementById('server-log-level-filter').value;
        const serverFilter = document.getElementById('server-log-server-filter').value;
        
        let filteredLogs = this.serverLogs;
        if (levelFilter) {
            filteredLogs = filteredLogs.filter(log => log.level === levelFilter);
        }
        if (serverFilter) {
            filteredLogs = filteredLogs.filter(log => log.serverId === serverFilter);
        }

        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">No server logs matching filters</div>';
            return;
        }

        container.innerHTML = '';
        filteredLogs.forEach(log => {
            const entry = this.createLogEntry(log);
            container.appendChild(entry);
        });

        if (document.getElementById('server-auto-scroll').checked) {
            container.scrollTop = container.scrollHeight;
        }
    }

    renderSystemLogs() {
        const container = document.getElementById('system-logs-container');
        const levelFilter = document.getElementById('system-log-level-filter').value;
        
        let filteredLogs = this.systemLogs;
        if (levelFilter) {
            filteredLogs = filteredLogs.filter(log => log.level === levelFilter);
        }

        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">No system logs matching filters</div>';
            return;
        }

        container.innerHTML = '';
        filteredLogs.forEach(log => {
            const entry = this.createLogEntry(log);
            container.appendChild(entry);
        });

        if (document.getElementById('system-auto-scroll').checked) {
            container.scrollTop = container.scrollHeight;
        }
    }

    appendServerLogEntry(log) {
        const container = document.getElementById('server-logs-container');
        const levelFilter = document.getElementById('server-log-level-filter').value;
        const serverFilter = document.getElementById('server-log-server-filter').value;
        
        if (levelFilter && log.level !== levelFilter) return;
        if (serverFilter && log.serverId !== serverFilter) return;

        // Remove empty state if present
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const entry = this.createLogEntry(log);
        container.appendChild(entry);

        if (document.getElementById('server-auto-scroll').checked) {
            container.scrollTop = container.scrollHeight;
        }
    }

    appendSystemLogEntry(log) {
        const container = document.getElementById('system-logs-container');
        const levelFilter = document.getElementById('system-log-level-filter').value;
        
        if (levelFilter && log.level !== levelFilter) return;

        // Remove empty state if present
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const entry = this.createLogEntry(log);
        container.appendChild(entry);

        if (document.getElementById('system-auto-scroll').checked) {
            container.scrollTop = container.scrollHeight;
        }
    }

    createLogEntry(log) {
        const div = document.createElement('div');
        div.className = `log-entry ${log.level}`;
        
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        
        div.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level ${log.level}">${log.level}</span>
            ${log.serverName ? `<span class="log-server">[${log.serverName}]</span>` : ''}
            <span class="log-message">${this.escapeHtml(log.message)}</span>
        `;
        
        return div;
    }

    updateLogFilters() {
        const serverFilter = document.getElementById('server-log-server-filter');
        const currentValue = serverFilter.value;
        
        // Get unique server IDs from server logs
        const serverIds = new Set(['']);
        this.serverLogs.forEach(log => {
            if (log.serverId) {
                serverIds.add(log.serverId);
            }
        });

        // Update server filter options
        serverFilter.innerHTML = '<option value="">All Servers</option>';
        this.servers.forEach(server => {
            if (serverIds.has(server.id)) {
                const option = document.createElement('option');
                option.value = server.id;
                option.textContent = server.name;
                if (server.id === currentValue) {
                    option.selected = true;
                }
                serverFilter.appendChild(option);
            }
        });
    }

    async clearServerLogs() {
        const serverFilter = document.getElementById('server-log-server-filter').value;
        try {
            const url = serverFilter ? `/api/logs?serverId=${serverFilter}` : '/api/logs?type=server';
            await fetch(url, { method: 'DELETE' });
            
            if (serverFilter) {
                this.serverLogs = this.serverLogs.filter(log => log.serverId !== serverFilter);
            } else {
                this.serverLogs = [];
            }
            
            this.renderServerLogs();
        } catch (error) {
            console.error('Failed to clear server logs:', error);
        }
    }

    async clearSystemLogs() {
        try {
            await fetch('/api/logs?type=system', { method: 'DELETE' });
            this.systemLogs = [];
            this.renderSystemLogs();
        } catch (error) {
            console.error('Failed to clear system logs:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Debug methods
    async loadDebugStatus() {
        try {
            const response = await fetch('/api/debug/status');
            const data = await response.json();
            this.debugEnabled = data.enabled;
            this.debugStats = data.stats || {};
            this.updateDebugUI();
        } catch (error) {
            console.error('Failed to load debug status:', error);
        }
    }

    async toggleDebug() {
        try {
            const endpoint = this.debugEnabled ? '/api/debug/disable' : '/api/debug/enable';
            const response = await fetch(endpoint, { method: 'POST' });
            const data = await response.json();
            this.debugEnabled = data.enabled;
            this.updateDebugUI();
            
            if (this.debugEnabled) {
                await this.loadDebugMessages();
            }
        } catch (error) {
            console.error('Failed to toggle debug:', error);
        }
    }

    async loadDebugMessages() {
        try {
            const serverFilter = document.getElementById('debug-server-filter').value;
            const url = serverFilter ? `/api/debug/messages?serverId=${serverFilter}` : '/api/debug/messages';
            const response = await fetch(url);
            this.debugMessages = await response.json();
            this.renderDebugMessages();
        } catch (error) {
            console.error('Failed to load debug messages:', error);
        }
    }

    async clearDebugMessages() {
        try {
            const serverFilter = document.getElementById('debug-server-filter').value;
            const url = serverFilter ? `/api/debug/messages?serverId=${serverFilter}` : '/api/debug/messages';
            await fetch(url, { method: 'DELETE' });
            this.debugMessages = [];
            this.renderDebugMessages();
        } catch (error) {
            console.error('Failed to clear debug messages:', error);
        }
    }

    async exportDebugData() {
        try {
            const response = await fetch('/api/debug/export');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mcp-debug-${Date.now()}.json`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export debug data:', error);
        }
    }

    setupDebugStream() {
        if (this.debugEventSource) {
            this.debugEventSource.close();
        }

        this.debugEventSource = new EventSource('/api/debug/stream');
        
        this.debugEventSource.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.debugMessages.push(message);
            
            // Limit messages
            if (this.debugMessages.length > this.maxLogs) {
                this.debugMessages.shift();
            }
            
            this.renderDebugMessages();
            this.updateDebugStats();
        };

        this.debugEventSource.onerror = (error) => {
            console.error('Debug stream error:', error);
        };
    }

    updateDebugUI() {
        const toggleBtn = document.getElementById('debug-toggle-btn');
        const statusSpan = document.getElementById('debug-status');
        
        if (this.debugEnabled) {
            toggleBtn.textContent = 'Disable Debugging';
            toggleBtn.classList.remove('btn-primary');
            toggleBtn.classList.add('btn-secondary');
            statusSpan.textContent = 'ENABLED';
            statusSpan.style.background = '#c6f6d5';
            statusSpan.style.color = '#22543d';
        } else {
            toggleBtn.textContent = 'Enable Debugging';
            toggleBtn.classList.remove('btn-secondary');
            toggleBtn.classList.add('btn-primary');
            statusSpan.textContent = 'DISABLED';
            statusSpan.style.background = '#fee';
            statusSpan.style.color = '#c53030';
        }
        
        this.updateDebugStats();
    }

    updateDebugStats() {
        if (this.debugStats) {
            document.getElementById('debug-total-messages').textContent = this.debugStats.totalMessages || 0;
            document.getElementById('debug-active-sessions').textContent = this.debugStats.activeSessions || 0;
        }
        
        // Calculate stats from messages
        let totalErrors = 0;
        let totalResponseTime = 0;
        let responseCount = 0;
        
        this.debugMessages.forEach(msg => {
            if (msg.messageType === 'error') totalErrors++;
            if (msg.duration) {
                totalResponseTime += msg.duration;
                responseCount++;
            }
        });
        
        document.getElementById('debug-error-count').textContent = totalErrors;
        const avgResponse = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;
        document.getElementById('debug-avg-response').textContent = `${avgResponse}ms`;
    }

    renderDebugMessages() {
        const container = document.getElementById('debug-messages-container');
        const autoScroll = document.getElementById('debug-auto-scroll').checked;
        const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
        
        container.innerHTML = this.debugMessages.map(msg => {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            const directionIcon = msg.direction === 'client-to-server' ? '→' : '←';
            const typeColor = {
                'request': '#3182ce',
                'response': '#38a169',
                'notification': '#d69e2e',
                'error': '#e53e3e'
            }[msg.messageType] || '#718096';
            
            let content = `
                <div class="log-entry" style="border-left: 3px solid ${typeColor};">
                    <div style="display: flex; gap: 1rem; align-items: start; width: 100%;">
                        <span class="log-timestamp">${timestamp}</span>
                        <span style="color: ${typeColor}; font-weight: 600;">${directionIcon}</span>
                        <div style="flex: 1;">
                            <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem;">
                                <span style="font-weight: 600; color: var(--text-primary);">${msg.serverName}</span>
                                <span style="padding: 0.125rem 0.5rem; background: ${typeColor}22; color: ${typeColor}; border-radius: 4px; font-size: 0.7rem;">
                                    ${msg.messageType.toUpperCase()}
                                </span>
                                ${msg.method ? `<span style="color: var(--text-secondary);">${msg.method}</span>` : ''}
                                ${msg.duration ? `<span style="color: var(--text-light); font-size: 0.75rem;">${msg.duration}ms</span>` : ''}
                            </div>
                            <pre style="font-size: 0.75rem; color: var(--text-secondary); margin: 0; overflow-x: auto;">${JSON.stringify(msg.data, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            `;
            return content;
        }).join('');
        
        if (autoScroll && wasAtBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // Firehose methods
    handleFirehoseEvent(event) {
        if (this.firehosePaused) return;
        
        // Format the event for display
        const timestamp = new Date(event.timestamp).toLocaleTimeString() + '.' + 
                         new Date(event.timestamp).getMilliseconds().toString().padStart(3, '0');
        
        let line = `[${timestamp}] ${event.category.toUpperCase().padEnd(10)} ${event.type.padEnd(15)} ${event.source}`;
        
        if (event.data) {
            if (typeof event.data === 'object') {
                if (event.data.method) line += ` ${event.data.method}`;
                if (event.data.status) line += ` [${event.data.status}]`;
                if (event.data.message) line += ` ${event.data.message}`;
                if (event.data.error) line += ` ERROR: ${event.data.error}`;
            } else {
                line += ` ${event.data}`;
            }
        }
        
        if (event.metadata) {
            if (event.metadata.duration) line += ` (${event.metadata.duration}ms)`;
            if (event.metadata.size) line += ` ${event.metadata.size}b`;
        }
        
        // Store the formatted line with the event for filtering
        const eventWithLine = { event, line };
        
        // Add to full buffer
        this.firehoseFullBuffer.push(eventWithLine);
        if (this.firehoseFullBuffer.length > this.maxFirehoseLines) {
            this.firehoseFullBuffer.shift();
        }
        
        // Apply filters and update display
        this.updateFirehoseDisplay();
        
        this.firehoseEventCount++;
    }
    
    updateFirehoseDisplay() {
        // Filter events based on category and text filters
        let filteredEvents = this.firehoseFullBuffer;
        
        // Apply noise reduction filters if enabled
        if (this.firehoseNoiseReduction) {
            filteredEvents = filteredEvents.filter(item => {
                const event = item.event;
                const line = item.line.toLowerCase();
                
                // Debug log to see what we're filtering
                // console.log('Filtering event:', event.category, event.type, this.firehoseExclusions);
                
                // Check WebSocket messages
                if (this.firehoseExclusions['ws-out'] && event.category === 'websocket' && event.type === 'message-out') {
                    return false;
                }
                if (this.firehoseExclusions['ws-in'] && event.category === 'websocket' && event.type === 'message-in') {
                    return false;
                }
                
                // Check firehose events (events about the firehose itself)
                if (this.firehoseExclusions['firehose'] && (event.type === 'firehose' || line.includes('/api/firehose'))) {
                    return false;
                }
                
                // Check stats events
                if (this.firehoseExclusions['stats'] && (event.type === 'stats' || line.includes('stats') || line.includes('firehose-stats'))) {
                    return false;
                }
                
                // Check heartbeat events
                if (this.firehoseExclusions['heartbeat'] && (line.includes('heartbeat') || line.includes(':heartbeat'))) {
                    return false;
                }
                
                // Check static file requests
                if (this.firehoseExclusions['static'] && event.category === 'http') {
                    if (event.data && event.data.path && 
                        (event.data.path.endsWith('.js') || event.data.path.endsWith('.css') || 
                         event.data.path.endsWith('.html') || event.data.path === '/app.js' ||
                         event.data.path === '/' || event.data.path === '/favicon.ico')) {
                        return false;
                    }
                }
                
                // Check API status calls
                if (this.firehoseExclusions['api-status'] && 
                    (line.includes('/api/servers') || line.includes('/api/firehose/status'))) {
                    return false;
                }
                
                // Check OPTIONS requests
                if (this.firehoseExclusions['options'] && event.data && event.data.method === 'OPTIONS') {
                    return false;
                }
                
                // Check custom exclusions
                for (const pattern of this.firehoseCustomExclusions) {
                    if (pattern && line.includes(pattern.toLowerCase())) {
                        return false;
                    }
                }
                
                return true;
            });
        }
        
        // Apply category filter
        if (this.firehoseFilter) {
            filteredEvents = filteredEvents.filter(item => 
                item.event.category === this.firehoseFilter
            );
        }
        
        // Apply text filter
        if (this.firehoseTextFilter) {
            const searchText = this.firehoseTextFilter.toLowerCase();
            filteredEvents = filteredEvents.filter(item => 
                item.line.toLowerCase().includes(searchText)
            );
        }
        
        // Update buffer with filtered lines
        this.firehoseBuffer = filteredEvents.map(item => item.line);
        
        // Update textarea
        const textarea = document.getElementById('firehose-stream');
        if (textarea) {
            const wasAtBottom = textarea.scrollHeight - textarea.scrollTop <= textarea.clientHeight + 10;
            
            textarea.value = this.firehoseBuffer.join('\n');
            
            // Auto-scroll only if enabled and user hasn't manually scrolled
            if (this.firehoseAutoScroll && !this.firehoseUserScrolled && wasAtBottom) {
                textarea.scrollTop = textarea.scrollHeight;
            }
        }
    }
    
    handleFirehoseScroll() {
        const textarea = document.getElementById('firehose-stream');
        const checkbox = document.getElementById('firehose-auto-scroll');
        
        if (!textarea || !checkbox) return;
        
        // Check if user scrolled away from bottom
        const isAtBottom = textarea.scrollHeight - textarea.scrollTop <= textarea.clientHeight + 10;
        
        if (!isAtBottom) {
            // User scrolled up - disable auto-scroll
            this.firehoseUserScrolled = true;
            this.firehoseAutoScroll = false;
            checkbox.checked = false;
        } else if (this.firehoseUserScrolled) {
            // User scrolled back to bottom - re-enable auto-scroll
            this.firehoseUserScrolled = false;
            this.firehoseAutoScroll = true;
            checkbox.checked = true;
        }
    }
    
    updateFirehoseAutoScroll() {
        const checkbox = document.getElementById('firehose-auto-scroll');
        this.firehoseAutoScroll = checkbox.checked;
        this.firehoseUserScrolled = !checkbox.checked;
        
        // If auto-scroll was just enabled, scroll to bottom
        if (this.firehoseAutoScroll) {
            const textarea = document.getElementById('firehose-stream');
            if (textarea) {
                textarea.scrollTop = textarea.scrollHeight;
            }
        }
    }
    
    updateFirehoseTextFilter() {
        const input = document.getElementById('firehose-text-filter');
        this.firehoseTextFilter = input.value;
        this.updateFirehoseDisplay();
    }
    
    updateFirehoseStats(stats) {
        document.getElementById('firehose-event-count').textContent = stats.totalEvents || 0;
        document.getElementById('firehose-event-rate').textContent = `${stats.eventsPerSecond || 0}/s`;
        this.firehoseEventRate = stats.eventsPerSecond || 0;
    }
    
    toggleFirehose() {
        this.firehosePaused = !this.firehosePaused;
        const btn = document.getElementById('firehose-toggle-btn');
        const icon = document.getElementById('firehose-toggle-icon');
        const text = document.getElementById('firehose-toggle-text');
        const status = document.getElementById('firehose-status');
        
        if (this.firehosePaused) {
            icon.textContent = '▶️';
            text.textContent = 'Resume';
            status.textContent = 'PAUSED';
            status.style.background = '#fee';
            status.style.color = '#c53030';
        } else {
            icon.textContent = '⏸️';
            text.textContent = 'Pause';
            status.textContent = 'STREAMING';
            status.style.background = '#c6f6d5';
            status.style.color = '#22543d';
        }
    }
    
    clearFirehose() {
        this.firehoseBuffer = [];
        this.firehoseFullBuffer = [];
        this.firehoseEventCount = 0;
        const textarea = document.getElementById('firehose-stream');
        if (textarea) {
            textarea.value = '';
        }
        document.getElementById('firehose-event-count').textContent = '0';
    }
    
    updateFirehoseFilter() {
        const filter = document.getElementById('firehose-filter');
        this.firehoseFilter = filter.value;
        // Re-apply filters to existing buffer
        this.updateFirehoseDisplay();
    }
    
    toggleFirehoseNoiseFilter() {
        this.firehoseNoiseReduction = !this.firehoseNoiseReduction;
        const btn = document.getElementById('firehose-noise-btn');
        const exclusionsDiv = document.getElementById('firehose-exclusions');
        
        if (this.firehoseNoiseReduction) {
            // Noise reduction is ON - hiding noise
            btn.innerHTML = '<span id="firehose-noise-icon">🔇</span> Reduce Noise';
            btn.style.background = 'var(--bg-success)';
            exclusionsDiv.style.display = 'block';  // Show options when reducing noise
        } else {
            // Noise reduction is OFF - showing all
            btn.innerHTML = '<span id="firehose-noise-icon">🔊</span> Show All';
            btn.style.background = '';
            exclusionsDiv.style.display = 'none';   // Hide options when showing all
        }
        
        // Re-apply filters
        this.updateFirehoseDisplay();
    }
    
    updateFirehoseExclusions() {
        // Update exclusion settings from checkboxes
        this.firehoseExclusions['ws-out'] = document.getElementById('exclude-ws-out').checked;
        this.firehoseExclusions['ws-in'] = document.getElementById('exclude-ws-in').checked;
        this.firehoseExclusions['firehose'] = document.getElementById('exclude-firehose').checked;
        this.firehoseExclusions['stats'] = document.getElementById('exclude-stats').checked;
        this.firehoseExclusions['heartbeat'] = document.getElementById('exclude-heartbeat').checked;
        this.firehoseExclusions['static'] = document.getElementById('exclude-static').checked;
        this.firehoseExclusions['api-status'] = document.getElementById('exclude-api-status').checked;
        this.firehoseExclusions['options'] = document.getElementById('exclude-options').checked;
        
        // Parse custom exclusions
        const customInput = document.getElementById('firehose-custom-exclude').value;
        this.firehoseCustomExclusions = customInput
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        // Re-apply filters
        this.updateFirehoseDisplay();
    }
}

const app = new MCPProxyManager();