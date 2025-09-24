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
        this.showCurrentWordCursor = true;
        this.currentWordElement = null;
        this.textAccumulator = ''; // Accumulate characters for real-time display
        this.lastTextElement = null; // Track the last text element for appending
        this.colors = {
            question: '#fdf2f2',
            answer: '#f2f9f2',
            speaker: '#f8f4fd',
            text: '#333333',
            currentWord: '#ffeb3b'
        };

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
            showCurrentWordCursor: document.getElementById('showCurrentWordCursor'),
            questionColor: document.getElementById('questionColor'),
            answerColor: document.getElementById('answerColor'),
            speakerColor: document.getElementById('speakerColor'),
            textColor: document.getElementById('textColor'),
            currentWordColor: document.getElementById('currentWordColor'),
            resetColorsBtn: document.getElementById('resetColorsBtn'),
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

        // Initialize colors
        this.updateColors();
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
        this.elements.showCurrentWordCursor.addEventListener('change', () => this.toggleCurrentWordCursor());

        // Color controls
        this.elements.questionColor.addEventListener('input', () => this.updateColors());
        this.elements.answerColor.addEventListener('input', () => this.updateColors());
        this.elements.speakerColor.addEventListener('input', () => this.updateColors());
        this.elements.textColor.addEventListener('input', () => this.updateColors());
        this.elements.currentWordColor.addEventListener('input', () => this.updateColors());
        this.elements.resetColorsBtn.addEventListener('click', () => this.resetColors());

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
            // Handle character-by-character text for real-time display
            this.handleRealTimeText(data);
        }
        // Commands are processed silently - they update state but don't appear in transcript
    }

    handleRealTimeText(data) {
        const char = data.content;

        // Handle line breaks properly - convert CR/LF to actual line breaks
        if (char === '\r' || char === '\n') {
            // If we have accumulated text, finalize it first
            if (this.textAccumulator.trim()) {
                this.finalizeAccumulatedText();
            }

            // Add line break
            this.addLineBreak();
            return;
        }

        // Accumulate the character
        this.textAccumulator += char;

        // Update the display immediately
        this.updateRealTimeDisplay();
    }

    finalizeAccumulatedText() {
        if (!this.textAccumulator.trim()) return;

        // Apply filters to the accumulated text
        const textData = {
            type: 'text',
            content: this.textAccumulator,
            page: this.transcriptData[this.transcriptData.length - 1]?.page || 0,
            line: this.transcriptData[this.transcriptData.length - 1]?.line || 0,
            format: this.transcriptData[this.transcriptData.length - 1]?.format || 0,
            timestamp: new Date()
        };

        // Only add if it matches filters
        if (this.matchesFilters(textData) && this.matchesSearch(textData)) {
            this.addTranscriptItem(textData);
        }

        // Clear the accumulator
        this.textAccumulator = '';
        this.lastTextElement = null;
    }

    updateRealTimeDisplay() {
        // Create or update the temporary text display
        if (!this.lastTextElement) {
            // Create a new temporary element
            const tempItem = document.createElement('div');
            tempItem.className = 'transcript-item text temp-item';
            tempItem.dataset.temp = 'true';

            const meta = document.createElement('div');
            meta.className = 'item-meta';
            meta.innerHTML = '<span>' + new Date().toLocaleTimeString() + '</span>';

            const content = document.createElement('div');
            content.className = 'item-content';
            content.textContent = this.textAccumulator;

            tempItem.appendChild(meta);
            tempItem.appendChild(content);

            // Remove placeholder if exists
            const placeholder = this.elements.transcript.querySelector('.transcript-placeholder');
            if (placeholder) {
                placeholder.remove();
            }

            this.elements.transcript.appendChild(tempItem);
            this.lastTextElement = content;

            // Auto-scroll
            if (this.autoScroll) {
                this.elements.transcript.scrollTop = this.elements.transcript.scrollHeight;
            }
        } else {
            // Update existing temporary element
            this.lastTextElement.textContent = this.textAccumulator;

            // Update cursor position if enabled
            if (this.showCurrentWordCursor) {
                this.updateCurrentWordCursor();
            }
        }
    }

    addLineBreak() {
        // Finalize any accumulated text first
        this.finalizeAccumulatedText();

        // Add a line break element or ensure proper spacing
        const lastItem = this.elements.transcript.lastElementChild;
        if (lastItem && lastItem.querySelector('.item-content')) {
            const content = lastItem.querySelector('.item-content');
            content.innerHTML += '<br>';
        }
    }

    updateCurrentWordCursor() {
        if (!this.lastTextElement) return;

        // Remove previous cursor
        const existingCursor = this.elements.transcript.querySelector('.current-word-cursor');
        if (existingCursor) {
            existingCursor.classList.remove('current-word-cursor');
        }

        // Add cursor to the temporary element
        this.lastTextElement.parentElement.classList.add('current-word-cursor');
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
        item.dataset.itemId = data.timestamp || Date.now(); // Add unique identifier

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

        // Process text content for word-level tracking
        if (data.content) {
            content.innerHTML = this.processTextWithWordTracking(data.content, this.searchTerm);
        }

        item.appendChild(meta);
        item.appendChild(content);

        // Remove placeholder if it exists
        const placeholder = this.elements.transcript.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        this.elements.transcript.appendChild(item);

        // Set this as the current word cursor location if it's the most recent
        if (this.showCurrentWordCursor && !this.refreshInProgress) {
            this.setCurrentWordCursor(item);
        }

        // Auto-scroll to bottom if user is at the bottom
        if (this.autoScroll) {
            this.elements.transcript.scrollTop = this.elements.transcript.scrollHeight;
        }
    }

    processTextWithWordTracking(text, searchTerm) {
        if (!text) return '';

        // First, convert line breaks to HTML
        text = text.replace(/\r\n/g, '<br>').replace(/\r/g, '<br>').replace(/\n/g, '<br>');

        // Split text into words while preserving whitespace and line breaks
        const parts = text.split(/(\s+|<br>)/);
        let html = '';

        parts.forEach((part, index) => {
            if (part === '<br>') {
                // Preserve line breaks
                html += '<br>';
            } else if (part.trim() && part !== '<br>') {
                // This is a word (not whitespace or line break)
                const wordId = `word-${Date.now()}-${index}`;
                let wordHtml = `<span class="word" data-word-id="${wordId}">${this.escapeHtml(part)}</span>`;

                // Apply search highlighting if needed
                if (searchTerm && part.toLowerCase().includes(searchTerm.toLowerCase())) {
                    wordHtml = this.highlightSearch(wordHtml, searchTerm);
                }

                html += wordHtml;
            } else {
                // This is whitespace, preserve it (but not line breaks since those are handled above)
                if (part !== '<br>') {
                    html += this.escapeHtml(part);
                }
            }
        });

        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setCurrentWordCursor(transcriptItem) {
        // Remove previous cursor
        if (this.currentWordElement) {
            this.currentWordElement.classList.remove('current-word-cursor');
        }

        // Find the last word in the new transcript item
        const words = transcriptItem.querySelectorAll('.word');
        if (words.length > 0) {
            const lastWord = words[words.length - 1];
            lastWord.classList.add('current-word-cursor');
            this.currentWordElement = lastWord;
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

    toggleCurrentWordCursor() {
        this.showCurrentWordCursor = this.elements.showCurrentWordCursor.checked;
        if (!this.showCurrentWordCursor && this.currentWordElement) {
            this.currentWordElement.classList.remove('current-word-cursor');
            this.currentWordElement = null;
        }
    }

    updateColors() {
        // Get color values from inputs
        this.colors.question = this.elements.questionColor.value;
        this.colors.answer = this.elements.answerColor.value;
        this.colors.speaker = this.elements.speakerColor.value;
        this.colors.text = this.elements.textColor.value;
        this.colors.currentWord = this.elements.currentWordColor.value;

        // Apply colors using CSS custom properties
        document.documentElement.style.setProperty('--question-bg-color', this.colors.question);
        document.documentElement.style.setProperty('--answer-bg-color', this.colors.answer);
        document.documentElement.style.setProperty('--speaker-bg-color', this.colors.speaker);
        document.documentElement.style.setProperty('--text-color', this.colors.text);
        document.documentElement.style.setProperty('--current-word-color', this.colors.currentWord);

        // Update CSS rules for paragraph backgrounds
        this.updateParagraphStyles();
    }

    updateParagraphStyles() {
        // Create or update style element for dynamic paragraph colors
        let styleElement = document.getElementById('dynamic-colors');
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'dynamic-colors';
            document.head.appendChild(styleElement);
        }

        styleElement.textContent = `
            .transcript-item.question { background-color: ${this.colors.question} !important; }
            .transcript-item.answer { background-color: ${this.colors.answer} !important; }
            .transcript-item.speaker { background-color: ${this.colors.speaker} !important; }
            .transcript { color: ${this.colors.text} !important; }
            .current-word-cursor { background-color: ${this.colors.currentWord} !important; }
            .current-word-cursor::after { border-color: ${this.colors.currentWord} !important; }
        `;
    }

    resetColors() {
        // Reset to default colors
        this.colors = {
            question: '#fdf2f2',
            answer: '#f2f9f2',
            speaker: '#f8f4fd',
            text: '#333333',
            currentWord: '#ffeb3b'
        };

        // Update color input values
        this.elements.questionColor.value = this.colors.question;
        this.elements.answerColor.value = this.colors.answer;
        this.elements.speakerColor.value = this.colors.speaker;
        this.elements.textColor.value = this.colors.text;
        this.elements.currentWordColor.value = this.colors.currentWord;

        // Apply the reset colors
        this.updateColors();
    }

    handleRefreshStart(refreshData) {
        console.log('=== REFRESH START ===');
        console.log('Refresh started:', refreshData.data.startTimecodeString, 'to', refreshData.data.endTimecodeString);
        console.log('Refresh timecode data:', {
            start: refreshData.data.startTimecode,
            end: refreshData.data.endTimecode,
            startSeconds: this.timecodeToSeconds(refreshData.data.startTimecode),
            endSeconds: this.timecodeToSeconds(refreshData.data.endTimecode)
        });

        // Log current transcript state
        console.log('Current transcript has', this.transcriptData.length, 'items');
        console.log('Current transcript timecodes:');
        this.transcriptData.slice(-5).forEach((item, index) => {
            if (item.timecode) {
                const seconds = this.timecodeToSeconds(item.timecode);
                console.log(`  Recent[${this.transcriptData.length - 5 + index}]: ${this.formatTimecode(item.timecode)} (${seconds}s) - "${item.content?.substring(0, 30) || 'N/A'}"`);
            }
        });

        // Mark refresh in progress and store timecode range
        this.refreshInProgress = true;
        this.refreshStartTime = refreshData.data.startTimecode;
        this.refreshEndTime = refreshData.data.endTimecode;

        console.log('Entering refresh mode - buffering subsequent data until E command');
    }

    handleRefreshEnd(endRefreshData) {
        console.log('=== REFRESH END PROCESSING ===');
        console.log('Refresh ended, processing buffered data:', endRefreshData.data.refreshData.length, 'items');
        console.log('Refresh timecode range:', this.formatTimecode(this.refreshStartTime), 'to', this.formatTimecode(this.refreshEndTime));

        // Log the buffered refresh data
        console.log('Buffered refresh data:');
        endRefreshData.data.refreshData.forEach((item, index) => {
            if (item.type === 'text') {
                const timecode = item.timecode ? this.formatTimecode(item.timecode) : 'no-timecode';
                console.log(`  Refresh[${index}]: TEXT at ${timecode} - "${item.content?.substring(0, 50) || 'N/A'}"`);
            } else {
                console.log(`  Refresh[${index}]: COMMAND ${item.command} - ${JSON.stringify(item.data)}`);
            }
        });

        // Process the refresh buffer data
        if (endRefreshData.data.refreshData && endRefreshData.data.refreshData.length > 0) {
            // Find the exact range of items to replace based on timecodes
            const replaceInfo = this.findItemsToReplace(this.refreshStartTime, this.refreshEndTime);

            if (replaceInfo.found) {
                console.log(`REPLACING: ${replaceInfo.count} items at positions ${replaceInfo.startIndex} to ${replaceInfo.endIndex}`);

                // Log what's being removed
                console.log('REMOVING these items:');
                for (let i = replaceInfo.startIndex; i <= replaceInfo.endIndex; i++) {
                    const item = this.transcriptData[i];
                    const timecode = item.timecode ? this.formatTimecode(item.timecode) : 'no-timecode';
                    console.log(`  REMOVE[${i}]: ${timecode} - "${item.content?.substring(0, 40) || 'N/A'}"`);
                }

                // Prepare the new refresh data with proper timestamps
                const newItems = endRefreshData.data.refreshData.map((item, index) => {
                    const newItem = {
                        ...item,
                        timestamp: new Date(),
                        sessionId: this.currentSession
                    };

                    // Log what's being added
                    if (item.type === 'text') {
                        const timecode = item.timecode ? this.formatTimecode(item.timecode) : 'no-timecode';
                        console.log(`  ADD[${index}]: ${timecode} - "${item.content?.substring(0, 40) || 'N/A'}"`);
                    }

                    return newItem;
                });

                console.log(`EXECUTING SPLICE: transcriptData.splice(${replaceInfo.startIndex}, ${replaceInfo.count}, ...${newItems.length} items)`);

                // Replace the items at the exact location
                this.transcriptData.splice(replaceInfo.startIndex, replaceInfo.count, ...newItems);

                console.log(`NEW TRANSCRIPT LENGTH: ${this.transcriptData.length} items`);

                // Completely refresh the display to show the updated content
                this.refreshTranscript();

                console.log(`REFRESH COMPLETE: Replaced ${replaceInfo.count} items with ${newItems.length} new items`);
            } else {
                console.log('WARNING: No items found in timecode range - this may indicate a problem');
                console.log('Current transcript data timecodes:');
                this.transcriptData.forEach((item, index) => {
                    if (item.timecode) {
                        console.log(`  Transcript[${index}]: ${this.formatTimecode(item.timecode)} - "${item.content?.substring(0, 30) || 'N/A'}"`);
                    }
                });

                // Fallback: add to end if no matching timecode range found
                console.log('FALLBACK: Adding refresh data to end of transcript');
                endRefreshData.data.refreshData.forEach(item => {
                    item.timestamp = new Date();
                    item.sessionId = this.currentSession;
                    this.transcriptData.push(item);
                });
                this.refreshTranscript();
            }
        }

        console.log('=== REFRESH END COMPLETE ===');
        this.refreshInProgress = false;
        this.refreshStartTime = null;
        this.refreshEndTime = null;
    }

    findItemsToReplace(startTime, endTime) {
        console.log('Finding items to replace between EXACT timecodes:', this.formatTimecode(startTime), 'and', this.formatTimecode(endTime));

        const startSeconds = this.timecodeToSeconds(startTime);
        const endSeconds = this.timecodeToSeconds(endTime);

        let startIndex = -1;
        let endIndex = -1;

        console.log(`Looking for items between ${startSeconds} and ${endSeconds} seconds`);

        // Find EXACT range based on timecodes - no tolerance
        for (let i = 0; i < this.transcriptData.length; i++) {
            const item = this.transcriptData[i];

            if (item.timecode) {
                const itemSeconds = this.timecodeToSeconds(item.timecode);
                console.log(`Item ${i}: ${itemSeconds} seconds - "${item.content?.substring(0, 30) || 'N/A'}"`);

                // Find first item at or after start time
                if (startIndex === -1 && itemSeconds >= startSeconds) {
                    startIndex = i;
                    console.log(`Found start index: ${i} at ${itemSeconds} seconds`);
                }

                // Find last item at or before end time
                if (itemSeconds <= endSeconds) {
                    endIndex = i;
                    console.log(`Updated end index to: ${i} at ${itemSeconds} seconds`);
                } else if (startIndex !== -1) {
                    // We've gone past the end time
                    break;
                }
            }
        }

        if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
            const count = endIndex - startIndex + 1;
            console.log(`EXACT MATCH: Will replace ${count} items from index ${startIndex} to ${endIndex}`);

            // Log what will be replaced
            for (let i = startIndex; i <= endIndex; i++) {
                const item = this.transcriptData[i];
                const seconds = item.timecode ? this.timecodeToSeconds(item.timecode) : 'no-timecode';
                console.log(`  REPLACE[${i}]: ${seconds}s - "${item.content?.substring(0, 40) || 'N/A'}"`);
            }

            return {
                found: true,
                startIndex: startIndex,
                endIndex: endIndex,
                count: count
            };
        }

        console.log(`NO EXACT MATCH FOUND - trying fallback search`);
        return this.findItemsNearTimecode(startTime, endTime);
    }

    isSameParagraph(item1, item2) {
        // Items belong to the same paragraph if they have the same format and similar page/line info
        return item1 && item2 &&
               item1.type === 'text' && item2.type === 'text' &&
               item1.format === item2.format &&
               Math.abs((item1.page || 0) - (item2.page || 0)) <= 1 &&
               Math.abs((item1.line || 0) - (item2.line || 0)) <= 3;
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