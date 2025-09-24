class BridgeViewer {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isPaused = false;
        this.transcriptData = [];
        this.filteredData = [];
        this.searchTerm = '';
        this.filters = {
            page: null,
            format: null
        };
        this.currentSession = null;
        this.sidebarVisible = true;
        this.showTimestamps = true;
        this.showTimecodes = true;
        this.showPageNumbers = true;
        this.refreshInProgress = false;
        this.refreshStartTime = null;
        this.refreshEndTime = null;

        this.initializeUI();
        this.connectWebSocket();
    }

    initializeUI() {
        // Get UI elements
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            sessionInfo: document.getElementById('sessionInfo'),
            transcript: document.getElementById('transcript'),
            sidebar: document.querySelector('.sidebar'),
            sidebarToggle: document.getElementById('sidebarToggle'),
            clearBtn: document.getElementById('clearBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            resumeBtn: document.getElementById('resumeBtn'),
            searchInput: document.getElementById('searchInput'),
            searchBtn: document.getElementById('searchBtn'),
            pageFilter: document.getElementById('pageFilter'),
            formatFilter: document.getElementById('formatFilter'),
            applyFiltersBtn: document.getElementById('applyFiltersBtn'),
            showTimestamps: document.getElementById('showTimestamps'),
            showTimecodes: document.getElementById('showTimecodes'),
            showPageNumbers: document.getElementById('showPageNumbers'),
            currentPage: document.getElementById('currentPage'),
            currentLine: document.getElementById('currentLine'),
            currentFormat: document.getElementById('currentFormat'),
            refreshMode: document.getElementById('refreshMode'),
            testData: document.getElementById('testData'),
            sendTestBtn: document.getElementById('sendTestBtn'),
            itemCount: document.getElementById('itemCount'),
            lastUpdate: document.getElementById('lastUpdate')
        };

        // Bind event listeners
        this.bindEvents();
    }

    bindEvents() {
        // Sidebar toggle
        this.elements.sidebarToggle.addEventListener('click', () => this.toggleSidebar());

        // Control buttons
        this.elements.clearBtn.addEventListener('click', () => this.clearTranscript());
        this.elements.pauseBtn.addEventListener('click', () => this.pauseStream());
        this.elements.resumeBtn.addEventListener('click', () => this.resumeStream());

        // Display options
        this.elements.showTimestamps.addEventListener('change', () => this.toggleTimestamps());
        this.elements.showTimecodes.addEventListener('change', () => this.toggleTimecodes());
        this.elements.showPageNumbers.addEventListener('change', () => this.togglePageNumbers());

        // Search and filters
        this.elements.searchBtn.addEventListener('click', () => this.performSearch());
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });
        this.elements.applyFiltersBtn.addEventListener('click', () => this.applyFilters());

        // Test data
        this.elements.sendTestBtn.addEventListener('click', () => this.sendTestData());

        // Auto-scroll control
        this.elements.transcript.addEventListener('scroll', () => {
            const transcript = this.elements.transcript;
            const isAtBottom = transcript.scrollHeight - transcript.clientHeight <= transcript.scrollTop + 10;
            this.autoScroll = isAtBottom;
        });

        this.autoScroll = true;
    }

    connectWebSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateConnectionStatus();
            console.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus();
            console.log('Disconnected from server');
        });

        this.socket.on('bridge:data', (data) => {
            if (!this.isPaused) {
                this.handleBridgeData(data);
            }
        });

        this.socket.on('bridge:state', (stateData) => {
            this.updateState(stateData.state);
        });

        this.socket.on('session:new', (sessionData) => {
            this.currentSession = sessionData.sessionId;
            this.updateSessionInfo();
            console.log('New session started:', sessionData.sessionId);
        });

        this.socket.on('session:end', (sessionData) => {
            console.log('Session ended:', sessionData.sessionId);
        });

        this.socket.on('session:current', (sessionData) => {
            this.currentSession = sessionData.sessionId;
            this.updateSessionInfo();
        });
    }

    updateConnectionStatus() {
        const indicator = this.elements.connectionStatus.querySelector('.status-indicator');
        const text = this.elements.connectionStatus.querySelector('.status-text');

        if (this.isConnected) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Disconnected';
        }
    }

    updateSessionInfo() {
        const sessionInfo = this.elements.sessionInfo;
        if (this.currentSession) {
            sessionInfo.innerHTML = `<span>Session: ${this.currentSession}</span>`;
        } else {
            sessionInfo.innerHTML = `<span>No active session</span>`;
        }
    }

    handleBridgeData(data) {
        this.transcriptData.push(data);
        this.updateItemCount();
        this.updateLastUpdate();

        // Handle refresh commands specially
        if (data.type === 'command') {
            if (data.command === 'R' && data.data.action === 'refresh') {
                this.handleRefreshStart(data);
            } else if (data.command === 'E' && data.data.action === 'endRefresh') {
                this.handleRefreshEnd(data);
            }
        }

        // Only display text content, not control commands
        // Commands like P, N, F, T, D, K, R, E should be processed silently
        if (data.type === 'text' && !this.refreshInProgress) {
            // Only display text in real-time if we're not in refresh mode
            // During refresh, text will be processed when E command is received
            if (this.matchesFilters(data) && this.matchesSearch(data)) {
                this.addTranscriptItem(data);
            }
        }
        // Commands are processed silently - they update state but don't appear in transcript
    }

    matchesFilters(data) {
        if (this.filters.page !== null && data.page !== this.filters.page) {
            return false;
        }

        if (this.filters.format !== null && data.format !== this.filters.format) {
            return false;
        }

        return true;
    }

    matchesSearch(data) {
        if (!this.searchTerm) return true;

        if (data.type === 'text') {
            return data.content.toLowerCase().includes(this.searchTerm.toLowerCase());
        }

        return false;
    }

    addTranscriptItem(data) {
        const item = document.createElement('div');
        item.className = this.getItemClass(data);

        const meta = document.createElement('div');
        meta.className = 'item-meta';

        const pageLineInfo = document.createElement('span');
        pageLineInfo.className = 'page-line-info';
        pageLineInfo.textContent = `Page: ${data.page || '-'}, Line: ${data.line || '-'}`;

        meta.appendChild(pageLineInfo);

        if (data.timestamp) {
            const timestamp = document.createElement('span');
            timestamp.textContent = new Date(data.timestamp).toLocaleTimeString();
            meta.insertBefore(timestamp, pageLineInfo);
        }

        const content = document.createElement('div');
        content.className = 'item-content';

        // Since we only display text now, this will always be text
        content.textContent = data.content;
        if (this.searchTerm && data.content.toLowerCase().includes(this.searchTerm.toLowerCase())) {
            content.innerHTML = this.highlightSearch(data.content, this.searchTerm);
        }

        item.appendChild(meta);
        item.appendChild(content);

        // Remove placeholder if it exists
        const placeholder = this.elements.transcript.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        this.elements.transcript.appendChild(item);

        // Auto-scroll to bottom if user is at the bottom
        if (this.autoScroll) {
            this.elements.transcript.scrollTop = this.elements.transcript.scrollHeight;
        }
    }

    getItemClass(data) {
        let className = 'transcript-item text'; // Always text now

        // Apply formatting based on the format type
        if (data.format !== undefined) {
            switch (data.format) {
                case 0x01: className += ' question'; break;
                case 0x02: className += ' answer'; break;
                case 0x03: className += ' speaker'; break;
                case 0x04: className += ' question'; break;
                case 0x05: className += ' answer'; break;
                case 0x06: className += ' speaker'; break;
            }
        }

        return className;
    }

    formatCommand(data) {
        const command = data.command;
        const commandData = data.data;

        switch (command) {
            case 'P':
                return `<span class="command-info">PAGE: ${commandData.pageNumber}</span>`;

            case 'N':
                return `<span class="command-info">LINE: ${commandData.lineNumber}</span>`;

            case 'F':
                return `<span class="command-info">FORMAT: ${commandData.formatDescription} (0x${commandData.format.toString(16).padStart(2, '0')})</span>`;

            case 'T':
                return `<span class="command-info timecode">TIMECODE: ${commandData.timecodeString}</span>`;

            case 'D':
                return `<span class="command-info">DELETE (backspace)</span>`;

            case 'K':
                return `<span class="command-info">PREVENT SAVING</span>`;

            case 'R':
                return `<span class="command-info">REFRESH: ${commandData.startTimecodeString} → ${commandData.endTimecodeString}</span>`;

            case 'E':
                return `<span class="command-info">END REFRESH</span>`;

            default:
                return `<span class="command-info">COMMAND: ${command}</span>`;
        }
    }

    highlightSearch(text, searchTerm) {
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    }

    updateState(state) {
        this.elements.currentPage.textContent = state.currentPage || '-';
        this.elements.currentLine.textContent = state.currentLine || '-';
        this.elements.currentFormat.textContent = state.currentFormatDescription || '-';
        this.elements.refreshMode.textContent = state.refreshMode ? 'Yes' : 'No';
    }

    updateItemCount() {
        this.elements.itemCount.textContent = this.transcriptData.length;
    }

    updateLastUpdate() {
        this.elements.lastUpdate.textContent = new Date().toLocaleTimeString();
    }

    clearTranscript() {
        this.elements.transcript.innerHTML = '<div class="transcript-placeholder">Transcript cleared. Waiting for new data...</div>';
        this.transcriptData = [];
        this.updateItemCount();
    }

    pauseStream() {
        this.isPaused = true;
        this.elements.pauseBtn.disabled = true;
        this.elements.resumeBtn.disabled = false;
    }

    resumeStream() {
        this.isPaused = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.resumeBtn.disabled = true;
    }

    performSearch() {
        this.searchTerm = this.elements.searchInput.value.trim();
        this.refreshTranscript();
    }

    applyFilters() {
        const pageValue = this.elements.pageFilter.value.trim();
        const formatValue = this.elements.formatFilter.value;

        this.filters.page = pageValue ? parseInt(pageValue) : null;
        this.filters.format = formatValue ? parseInt(formatValue, 10) : null;

        this.refreshTranscript();
    }

    refreshTranscript() {
        // Clear current transcript
        this.elements.transcript.innerHTML = '';

        // Reapply all data with current filters and search
        this.transcriptData.forEach(data => {
            // Only display text data (not commands) and apply filters
            if (data.type === 'text' && this.matchesFilters(data) && this.matchesSearch(data)) {
                this.addTranscriptItem(data);
            }
        });

        if (this.elements.transcript.children.length === 0) {
            this.elements.transcript.innerHTML = '<div class="transcript-placeholder">No data matches current filters...</div>';
        }
    }

    async sendTestData() {
        const testData = this.elements.testData.value.trim();
        if (!testData) return;

        try {
            const response = await fetch('/api/test/send-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: testData })
            });

            const result = await response.json();
            console.log('Test data sent:', result);

            // Clear the test input
            this.elements.testData.value = '';
        } catch (error) {
            console.error('Error sending test data:', error);
            alert('Error sending test data');
        }
    }

    toggleSidebar() {
        this.sidebarVisible = !this.sidebarVisible;
        if (this.sidebarVisible) {
            this.elements.sidebar.classList.remove('hidden');
        } else {
            this.elements.sidebar.classList.add('hidden');
        }
    }

    toggleTimestamps() {
        this.showTimestamps = this.elements.showTimestamps.checked;
        if (this.showTimestamps) {
            document.body.classList.remove('hide-timestamps');
        } else {
            document.body.classList.add('hide-timestamps');
        }
    }

    toggleTimecodes() {
        this.showTimecodes = this.elements.showTimecodes.checked;
        if (this.showTimecodes) {
            document.body.classList.remove('hide-timecodes');
        } else {
            document.body.classList.add('hide-timecodes');
        }
    }

    togglePageNumbers() {
        this.showPageNumbers = this.elements.showPageNumbers.checked;
        if (this.showPageNumbers) {
            document.body.classList.remove('hide-page-numbers');
        } else {
            document.body.classList.add('hide-page-numbers');
        }
    }

    handleRefreshStart(refreshData) {
        console.log('Refresh started:', refreshData.data.startTimecodeString, 'to', refreshData.data.endTimecodeString);

        // Find and remove items within the refresh timecode range from both display and data
        // This is a simplified approach - in a full implementation you'd need to match exact timecodes
        // For now, we'll mark that a refresh is in progress
        this.refreshInProgress = true;
        this.refreshStartTime = refreshData.data.startTimecode;
        this.refreshEndTime = refreshData.data.endTimecode;
    }

    handleRefreshEnd(endRefreshData) {
        console.log('Refresh ended, processing buffered data:', endRefreshData.data.refreshData.length, 'items');

        // Process the refresh buffer data
        if (endRefreshData.data.refreshData && endRefreshData.data.refreshData.length > 0) {
            // Find the exact range of items to replace based on timecodes
            const replaceInfo = this.findItemsToReplace(this.refreshStartTime, this.refreshEndTime);

            if (replaceInfo.found) {
                console.log(`Replacing ${replaceInfo.count} items at positions ${replaceInfo.startIndex} to ${replaceInfo.endIndex}`);

                // Prepare the new refresh data with proper timestamps
                const newItems = endRefreshData.data.refreshData.map(item => ({
                    ...item,
                    timestamp: new Date(),
                    sessionId: this.currentSession
                }));

                // Replace the items at the exact location
                this.transcriptData.splice(replaceInfo.startIndex, replaceInfo.count, ...newItems);

                // Completely refresh the display to show the updated content
                this.refreshTranscript();

                console.log(`Refresh complete - replaced ${replaceInfo.count} items with ${newItems.length} new items`);
            } else {
                console.log('No items found in timecode range - adding refresh data to end');
                // Fallback: add to end if no matching timecode range found
                endRefreshData.data.refreshData.forEach(item => {
                    item.timestamp = new Date();
                    item.sessionId = this.currentSession;
                    this.transcriptData.push(item);
                });
                this.refreshTranscript();
            }
        }

        this.refreshInProgress = false;
        this.refreshStartTime = null;
        this.refreshEndTime = null;
    }

    findItemsToReplace(startTime, endTime) {
        console.log('Finding items to replace between timecodes:', this.formatTimecode(startTime), 'and', this.formatTimecode(endTime));

        // Convert timecodes to comparable format (seconds since start)
        const startSeconds = this.timecodeToSeconds(startTime);
        const endSeconds = this.timecodeToSeconds(endTime);

        let startIndex = -1;
        let endIndex = -1;
        let candidateItems = [];

        // Find all items that might be in the range
        for (let i = 0; i < this.transcriptData.length; i++) {
            const item = this.transcriptData[i];

            // Check if this item has a timecode
            if (item.timecode) {
                const itemSeconds = this.timecodeToSeconds(item.timecode);

                // Use a small tolerance for timecode matching (0.1 seconds)
                if (itemSeconds >= (startSeconds - 0.1) && itemSeconds <= (endSeconds + 0.1)) {
                    candidateItems.push({ index: i, item: item, seconds: itemSeconds });

                    if (startIndex === -1) {
                        startIndex = i; // First item in range
                    }
                    endIndex = i; // Keep updating end index
                }
            }
        }

        console.log(`Found ${candidateItems.length} candidate items for replacement:`);
        candidateItems.forEach(candidate => {
            console.log(`  Index ${candidate.index}: "${candidate.item.content?.substring(0, 50) || 'N/A'}" at ${this.formatTimecode(candidate.item.timecode)}`);
        });

        if (startIndex !== -1 && endIndex !== -1) {
            const count = endIndex - startIndex + 1;
            console.log(`Will replace ${count} items from index ${startIndex} to ${endIndex}`);
            return {
                found: true,
                startIndex: startIndex,
                endIndex: endIndex,
                count: count
            };
        } else {
            console.log('No items found in the specified timecode range - will try a broader search');

            // Fallback: find items near the timecode range
            return this.findItemsNearTimecode(startTime, endTime);
        }
    }

    findItemsNearTimecode(startTime, endTime) {
        console.log('Searching for items near timecode range...');

        // Look for the most recent items before the refresh started
        // This handles cases where timecodes might not match exactly
        let bestStartIndex = -1;

        for (let i = this.transcriptData.length - 1; i >= 0; i--) {
            const item = this.transcriptData[i];

            if (item.timecode) {
                const itemSeconds = this.timecodeToSeconds(item.timecode);
                const startSeconds = this.timecodeToSeconds(startTime);

                // Find items that are close to the start timecode
                if (Math.abs(itemSeconds - startSeconds) < 5) { // Within 5 seconds
                    bestStartIndex = i;
                    break;
                }
            }
        }

        if (bestStartIndex !== -1) {
            console.log(`Found nearby item at index ${bestStartIndex}`);
            return {
                found: true,
                startIndex: bestStartIndex,
                endIndex: bestStartIndex,
                count: 1
            };
        }

        return {
            found: false,
            startIndex: -1,
            endIndex: -1,
            count: 0
        };
    }

    timecodeToSeconds(timecode) {
        if (!timecode) return 0;
        return (timecode.hours * 3600) + (timecode.minutes * 60) + timecode.seconds + (timecode.frames / 30);
    }

    formatTimecode(timecode) {
        if (!timecode) return 'Unknown';
        const { hours, minutes, seconds, frames } = timecode;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
    }

    sortTranscriptData() {
        // Sort by timestamp if available
        this.transcriptData.sort((a, b) => {
            if (a.timestamp && b.timestamp) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            }
            return 0;
        });
    }
}

// Test data examples
function loadExample(type) {
    const testInput = document.getElementById('testData');

    switch (type) {
        case 'page':
            testInput.value = '02 50 1D 02 03'; // Page 541
            break;
        case 'text':
            testInput.value = '02 46 01 03 51 2E 20 57 68 61 74 20 69 73 20 79 6F 75 72 20 6E 61 6D 65 3F'; // Format: Question, then "Q. What is your name?"
            break;
        case 'timecode':
            testInput.value = '02 54 11 05 0C 02 03'; // 17:05:12.02
            break;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.bridgeViewer = new BridgeViewer();
});