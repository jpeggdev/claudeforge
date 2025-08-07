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
        
        this.init();
    }

    async init() {
        await this.loadServers();
        await this.loadSessions();
        await this.loadLogs();
        this.setupWebSocket();
        this.setupEventListeners();
        this.render();
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
}

const app = new MCPProxyManager();