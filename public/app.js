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
        this.wordIndexVisible = false; // Start hidden by default
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
        this.currentParagraphFormat = null; // Track current paragraph format
        this.colors = {
            question: '#fdf2f2',
            answer: '#f2f9f2',
            speaker: '#f8f4fd',
            text: '#333333',
            currentWord: '#ffeb3b'
        };
        this.speakerLabelColor = '#ff6b6b'; // Single color for all speaker labels
        this.wordIndex = new Map(); // Store word index: word -> [{page, line, itemIndex}]
        this.wordSearchTerm = '';
        this.annotations = []; // Store user annotations
        this.keywords = new Map(); // Store keywords: keyword -> [{page, line, itemIndex}]
        this.activeTab = 'words'; // Current active tab
        this.selectedText = null; // Currently selected text for annotation

        this.initializeUI();
        this.loadSpeakerColors(); // Load saved speaker colors
        this.loadFontSettings(); // Load saved font settings
        this.loadAnnotationsFromStorage(); // Load saved annotations
        this.loadKeywordsFromStorage(); // Load saved keywords
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
            wordIndexPanel: document.querySelector('.word-index-panel'),
            wordIndexToggle: document.getElementById('wordIndexToggle'),
            wordList: document.getElementById('wordList'),
            wordSearch: document.getElementById('wordSearch'),
            wordCount: document.getElementById('wordCount'),
            // Tab navigation elements
            indexTabs: document.querySelectorAll('.index-tab'),
            indexTabContents: document.querySelectorAll('.index-tab-content'),
            // Annotation elements
            annotationList: document.getElementById('annotationList'),
            annotationSearch: document.getElementById('annotationSearch'),
            annotationCount: document.getElementById('annotationCount'),
            addAnnotationBtn: document.getElementById('addAnnotationBtn'),
            annotationModal: document.getElementById('annotationModal'),
            annotationForm: document.getElementById('annotationForm'),
            annotationText: document.getElementById('annotationText'),
            cancelAnnotation: document.getElementById('cancelAnnotation'),
            modalContext: document.getElementById('modalContext'),
            // Keyword elements
            keywordList: document.getElementById('keywordList'),
            keywordSearch: document.getElementById('keywordSearch'),
            keywordCount: document.getElementById('keywordCount'),
            addKeywordBtn: document.getElementById('addKeywordBtn'),
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
            // Speaker color elements
            speakerLabelColor: document.getElementById('speakerLabelColor'),
            speakerPreview: document.getElementById('speakerPreview'),
            // Font option elements
            fontFamily: document.getElementById('fontFamily'),
            fontSize: document.getElementById('fontSize'),
            fontSizeValue: document.getElementById('fontSizeValue'),
            fontPreview: document.getElementById('fontPreview'),
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

        // Initialize word index panel state (start hidden)
        this.initializeWordIndexState();
    }

    bindEvents() {
        // Sidebar toggle
        this.elements.sidebarToggle.addEventListener('click', () => this.toggleSidebar());

        // Word index toggle
        this.elements.wordIndexToggle.addEventListener('click', () => this.toggleWordIndex());

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

        // Speaker color management
        this.elements.speakerLabelColor.addEventListener('input', () => this.updateSpeakerLabelColor());

        // Font controls
        this.elements.fontFamily.addEventListener('change', () => this.updateFont());
        this.elements.fontSize.addEventListener('input', () => this.updateFontSize());

        // Search and filters
        this.elements.searchBtn.addEventListener('click', () => this.performSearch());
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });
        this.elements.applyFiltersBtn.addEventListener('click', () => this.applyFilters());

        // Test data
        this.elements.sendTestBtn.addEventListener('click', () => this.sendTestData());

        // Word search
        this.elements.wordSearch.addEventListener('input', () => this.filterWordIndex());
        this.elements.wordSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.filterWordIndex();
        });

        // Tab navigation
        this.elements.indexTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Annotation functionality
        this.elements.addAnnotationBtn.addEventListener('click', () => this.showAnnotationModal());
        this.elements.cancelAnnotation.addEventListener('click', () => this.hideAnnotationModal());
        this.elements.annotationForm.addEventListener('submit', (e) => this.saveAnnotation(e));
        this.elements.annotationSearch.addEventListener('input', () => this.filterAnnotations());
        this.elements.annotationSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.filterAnnotations();
        });

        // Keyword functionality
        this.elements.addKeywordBtn.addEventListener('click', () => this.showAddKeywordDialog());
        this.elements.keywordSearch.addEventListener('input', () => this.filterKeywords());
        this.elements.keywordSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.filterKeywords();
        });

        // Text selection for annotations
        document.addEventListener('mouseup', () => this.handleTextSelection());

        // Click outside modal to close
        this.elements.annotationModal.addEventListener('click', (e) => {
            if (e.target === this.elements.annotationModal) {
                this.hideAnnotationModal();
            }
        });

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
            } else if (data.command === 'N') {
                // Line number change - this indicates a new line in Eclipse
                this.handleLineChange(data);
            } else if (data.command === 'F') {
                // Format change - this indicates a new paragraph
                this.handleFormatChange(data);
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

        // Eclipse doesn't use CR/LF for line breaks - it uses N and F commands!
        // CR/LF characters are just protocol artifacts, so treat them as whitespace or ignore them
        if (char === '\r' || char === '\n') {
            // Convert line feed characters to spaces to preserve word separation
            // Don't create line breaks here - that's handled by N and F commands
            this.textAccumulator += ' ';
            this.updateRealTimeDisplay();
            return;
        }

        // Accumulate the character normally
        this.textAccumulator += char;

        // Update the display immediately
        this.updateRealTimeDisplay();
    }

    finalizeAccumulatedText() {
        // Check if there's any actual content (not just whitespace)
        if (!this.textAccumulator.trim()) return;

        // Remove any temporary item first
        const tempItem = this.elements.transcript.querySelector('.temp-item');
        if (tempItem) {
            tempItem.remove();
        }

        // Create the finalized text data with current paragraph format
        const textData = {
            type: 'text',
            content: this.textAccumulator.trim(), // Trim whitespace but preserve internal formatting
            page: this.transcriptData[this.transcriptData.length - 1]?.page || 0,
            line: this.transcriptData[this.transcriptData.length - 1]?.line || 0,
            format: this.currentParagraphFormat || 0,
            formatDescription: this.getFormatDescription(this.currentParagraphFormat || 0),
            timestamp: new Date(),
            timecode: this.transcriptData[this.transcriptData.length - 1]?.timecode || null
        };

        // Only add to display if it matches filters
        if (this.matchesFilters(textData) && this.matchesSearch(textData)) {
            this.addTranscriptItem(textData);
        }

        // Add words to word index (use current transcript length as index)
        this.addToWordIndex(textData, this.transcriptData.length);

        // Clear the accumulator for next paragraph
        this.textAccumulator = '';
        this.lastTextElement = null;
    }

    getFormatDescription(formatCode) {
        const formats = {
            0x00: 'Fixed line',
            0x01: 'Question',
            0x02: 'Answer',
            0x03: 'Speaker',
            0x04: 'Question continuation',
            0x05: 'Answer continuation',
            0x06: 'Speaker continuation',
            0x07: 'Parenthetical',
            0x08: 'Centered',
            0x09: 'Right-flush',
            0x0A: 'By line',
            0x0B: 'By line continuation'
        };
        return formats[formatCode] || `User-defined (0x${formatCode?.toString(16).padStart(2, '0') || '00'})`;
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
            content.innerHTML = this.wrapTextWithWordSpans(this.textAccumulator);

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
            // Update existing temporary element - wrap text with word spans
            this.lastTextElement.innerHTML = this.wrapTextWithWordSpans(this.textAccumulator);

            // Update cursor position if enabled
            if (this.showCurrentWordCursor) {
                this.updateCurrentWordCursor();
            }
        }
    }

    escapeHtmlButKeepBr(text) {
        // Escape HTML but keep <br> tags for line breaks
        return text.replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/&lt;br&gt;/g, '<br>'); // Keep <br> tags
    }

    escapeHtmlButKeepBrAndSpans(text) {
        // Escape HTML but keep <br> tags and speaker label spans
        return text.replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/&lt;br&gt;/g, '<br>') // Keep <br> tags
                  .replace(/&lt;span class="speaker-label" style="[^"]*"&gt;/g, (match) => {
                      // Properly restore speaker label spans with their style attributes
                      return match.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                  })
                  .replace(/&lt;\/span&gt;/g, '</span>'); // Keep closing spans
    }

    wrapTextWithWordSpans(text) {
        if (!text) return '';

        // First apply speaker colors
        const coloredText = this.applySpeakerColors(text);

        // Split on speaker spans to handle them separately
        const speakerSpanRegex = /(<span class="speaker-label" style="[^"]*">[^<]*<\/span>)/;
        const parts = coloredText.split(speakerSpanRegex);

        let html = '';
        let wordIndex = 0;

        parts.forEach(part => {
            if (speakerSpanRegex.test(part)) {
                // This is a speaker span - keep it as-is
                html += part;
            } else if (part) {
                // This is regular text - preserve <br> tags before escaping HTML
                const textParts = part.split(/(\s+|<br>)/);

                textParts.forEach(textPart => {
                    if (textPart === '<br>') {
                        html += '<br>';
                    } else if (textPart.trim() && textPart !== '<br>') {
                        const isCurrentWord = this.isCurrentWord(wordIndex, text);
                        const wordId = `word-${Date.now()}-${wordIndex}`;
                        const cssClass = isCurrentWord ? 'word current-word-cursor' : 'word';
                        html += `<span class="${cssClass}" data-word-id="${wordId}">${this.escapeHtml(textPart)}</span>`;
                        wordIndex++;
                    } else {
                        // This is whitespace, escape it but preserve it
                        html += this.escapeHtml(textPart);
                    }
                });
            }
        });

        return html;
    }

    isCurrentWord(wordIndex, fullText) {
        if (!this.showCurrentWordCursor) return false;

        // Count words up to the current cursor position
        const textUpToCursor = this.textAccumulator;
        const wordsUpToCursor = textUpToCursor.split(/\s+/).filter(word => word.trim()).length;

        // The current word is the last word being typed
        return wordIndex === Math.max(0, wordsUpToCursor - 1);
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
        if (!this.lastTextElement || !this.showCurrentWordCursor) return;

        // Remove previous cursor from all word spans
        const existingCursors = this.elements.transcript.querySelectorAll('.current-word-cursor');
        existingCursors.forEach(cursor => {
            cursor.classList.remove('current-word-cursor');
        });

        // Find the last word span in the current temporary element and highlight it
        const wordSpans = this.lastTextElement.querySelectorAll('.word');
        if (wordSpans.length > 0) {
            const lastWord = wordSpans[wordSpans.length - 1];
            lastWord.classList.add('current-word-cursor');
        }
    }

    handleLineChange(lineData) {
        // Line number command indicates a new line in Eclipse
        // This is where Eclipse actually breaks lines, not on CR/LF characters

        // Only add line break if we have some content, otherwise it creates empty lines
        if (this.textAccumulator.trim()) {
            this.textAccumulator += '<br>';
            this.updateRealTimeDisplay();
        }
    }

    handleFormatChange(formatData) {
        // Format command indicates a new paragraph is starting in Eclipse
        const newFormat = formatData.data.format;

        // If we have accumulated text, finalize the current paragraph first
        if (this.textAccumulator.trim()) {
            this.finalizeAccumulatedText();
        }

        // Update current paragraph format
        this.currentParagraphFormat = newFormat;

        // Start a new paragraph - this ensures each F command starts a new line/paragraph
        this.startNewParagraph();
    }

    startNewParagraph() {
        // Finalize any current text
        if (this.textAccumulator.trim()) {
            this.finalizeAccumulatedText();
        }

        // Clear the temporary element so a new one will be created
        this.lastTextElement = null;
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
            // Apply speaker colors first, then word tracking
            const coloredContent = this.applySpeakerColors(data.content);
            content.innerHTML = this.processTextWithWordTracking(coloredContent, this.searchTerm);
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

        // Split on speaker spans to handle them separately (similar to wrapTextWithWordSpans)
        const speakerSpanRegex = /(<span class="speaker-label" style="[^"]*">[^<]*<\/span>)/;
        const parts = text.split(speakerSpanRegex);

        let html = '';

        parts.forEach((part, partIndex) => {
            if (speakerSpanRegex.test(part)) {
                // This is a speaker span - keep it as-is
                html += part;
            } else if (part) {
                // This is regular text - process it for word tracking
                const textParts = part.split(/(\s+|<br>)/);

                textParts.forEach((textPart, index) => {
                    if (textPart === '<br>') {
                        // Preserve line breaks exactly as they were positioned in Eclipse
                        html += '<br>';
                    } else if (textPart.trim() && textPart !== '<br>') {
                        // This is a word (not whitespace or line break)
                        const wordId = `word-${Date.now()}-${partIndex}-${index}`;
                        let wordHtml = `<span class="word" data-word-id="${wordId}">${this.escapeHtml(textPart)}</span>`;

                        // Apply search highlighting if needed
                        if (searchTerm && textPart.toLowerCase().includes(searchTerm.toLowerCase())) {
                            wordHtml = this.highlightSearch(wordHtml, searchTerm);
                        }

                        html += wordHtml;
                    } else {
                        // This is whitespace, preserve it exactly as it appears in Eclipse
                        if (textPart !== '<br>') {
                            html += this.escapeHtml(textPart);
                        }
                    }
                });
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
        this.clearWordIndex();
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

        // Rebuild word index
        this.clearWordIndex();

        // Reapply all data with current filters and search
        this.transcriptData.forEach((data, index) => {
            // Add to word index regardless of filters
            if (data.type === 'text') {
                this.addToWordIndex(data, index);
            }

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

    // Speaker Label Color Management
    updateSpeakerLabelColor() {
        this.speakerLabelColor = this.elements.speakerLabelColor.value;
        this.updateSpeakerPreview();
        this.saveSpeakerLabelColor();
        this.updateExistingSpeakerLabels();
    }

    updateSpeakerPreview() {
        const previews = this.elements.speakerPreview.querySelectorAll('.speaker-label-preview');
        const contrastColor = this.getContrastColor(this.speakerLabelColor);

        previews.forEach(preview => {
            preview.style.backgroundColor = this.speakerLabelColor;
            preview.style.color = contrastColor;
        });
    }

    updateExistingSpeakerLabels() {
        // Update all existing speaker labels in the transcript with the new color
        const speakerLabels = this.elements.transcript.querySelectorAll('.speaker-label');
        const contrastColor = this.getContrastColor(this.speakerLabelColor);

        speakerLabels.forEach(label => {
            label.style.backgroundColor = this.speakerLabelColor;
            label.style.color = contrastColor;
        });
    }

    getContrastColor(hexColor) {
        // Convert hex to RGB
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);

        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return black or white based on luminance
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    applySpeakerColors(text) {
        // Apply single color to all speaker labels
        const speakerPatterns = [
            /\b(SP\d{2})\b/gi,           // SP01, SP02, etc.
            /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // First Last (proper names)
            /\b(JUDGE|ATTORNEY|COUNSEL|WITNESS|COURT|CLERK)\b/g // Specific legal role names
        ];

        let coloredText = text;
        const contrastColor = this.getContrastColor(this.speakerLabelColor);

        for (const pattern of speakerPatterns) {
            coloredText = coloredText.replace(pattern, `<span class="speaker-label" style="background-color: ${this.speakerLabelColor}; color: ${contrastColor}">$1</span>`);
        }

        return coloredText;
    }

    saveSpeakerLabelColor() {
        localStorage.setItem('bridgeViewer_speakerLabelColor', this.speakerLabelColor);
    }

    loadSpeakerColors() {
        const saved = localStorage.getItem('bridgeViewer_speakerLabelColor');
        if (saved) {
            this.speakerLabelColor = saved;
            this.elements.speakerLabelColor.value = saved;
            this.updateSpeakerPreview();
        }
        // Update word index colors to match speaker colors
        this.updateWordIndexColors();
    }

    // Font Management
    updateFont() {
        const fontFamily = this.elements.fontFamily.value;
        const fontValue = fontFamily === 'system' ? 'inherit' : fontFamily;

        // Update CSS custom property for transcript font
        document.documentElement.style.setProperty('--transcript-font-family', fontValue);

        // Update preview
        this.updateFontPreview();

        // Save to localStorage
        localStorage.setItem('transcript-font-family', fontFamily);
    }

    updateFontSize() {
        const fontSize = this.elements.fontSize.value;
        this.elements.fontSizeValue.textContent = fontSize + 'px';

        // Update CSS custom property for transcript font size
        document.documentElement.style.setProperty('--transcript-font-size', fontSize + 'px');

        // Update preview
        this.updateFontPreview();

        // Save to localStorage
        localStorage.setItem('transcript-font-size', fontSize);
    }

    updateFontPreview() {
        const fontFamily = this.elements.fontFamily.value;
        const fontSize = this.elements.fontSize.value;
        const fontValue = fontFamily === 'system' ? 'inherit' : fontFamily;

        this.elements.fontPreview.style.fontFamily = fontValue;
        this.elements.fontPreview.style.fontSize = fontSize + 'px';
    }

    loadFontSettings() {
        // Load saved font family
        const savedFontFamily = localStorage.getItem('transcript-font-family');
        if (savedFontFamily) {
            this.elements.fontFamily.value = savedFontFamily;
            const fontValue = savedFontFamily === 'system' ? 'inherit' : savedFontFamily;
            document.documentElement.style.setProperty('--transcript-font-family', fontValue);
        }

        // Load saved font size
        const savedFontSize = localStorage.getItem('transcript-font-size');
        if (savedFontSize) {
            this.elements.fontSize.value = savedFontSize;
            this.elements.fontSizeValue.textContent = savedFontSize + 'px';
            document.documentElement.style.setProperty('--transcript-font-size', savedFontSize + 'px');
        }

        // Update preview
        this.updateFontPreview();
    }

    // Word Index Management
    initializeWordIndexState() {
        // Set initial state - start hidden
        if (this.wordIndexVisible) {
            this.elements.wordIndexPanel.classList.remove('hidden');
        } else {
            this.elements.wordIndexPanel.classList.add('hidden');
        }
    }

    toggleWordIndex() {
        this.wordIndexVisible = !this.wordIndexVisible;

        if (this.wordIndexVisible) {
            this.elements.wordIndexPanel.classList.remove('hidden');
            // Update button appearance to indicate panel is open
            this.elements.wordIndexToggle.style.backgroundColor = 'rgba(255,255,255,0.3)';
            this.elements.wordIndexToggle.title = 'Hide Word Index';
        } else {
            this.elements.wordIndexPanel.classList.add('hidden');
            // Reset button appearance
            this.elements.wordIndexToggle.style.backgroundColor = 'rgba(255,255,255,0.1)';
            this.elements.wordIndexToggle.title = 'Show Word Index';
        }
    }

    addToWordIndex(textData, itemIndex) {
        if (!textData.content || textData.type !== 'text') return;

        // Extract words from content (remove HTML tags and speaker labels first)
        const cleanContent = textData.content
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        if (!cleanContent) return;

        // Split into words, filter out short words and common words
        const words = cleanContent.toLowerCase()
            .split(/[^\w']+/)
            .filter(word => word.length >= 2 && !this.isCommonWord(word));

        words.forEach(word => {
            if (!this.wordIndex.has(word)) {
                this.wordIndex.set(word, []);
            }

            const locations = this.wordIndex.get(word);
            const location = {
                page: textData.page || 0,
                line: textData.line || 0,
                itemIndex: itemIndex,
                format: textData.format || 0
            };

            // Avoid duplicate locations
            const exists = locations.some(loc =>
                loc.page === location.page &&
                loc.line === location.line &&
                loc.itemIndex === location.itemIndex
            );

            if (!exists) {
                locations.push(location);
            }
        });

        // Update word count and refresh display
        this.updateWordCount();
        this.refreshWordIndex();
    }

    isCommonWord(word) {
        const commonWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
            'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
            'can', 'do', 'does', 'did', 'get', 'got', 'go', 'went', 'come', 'came',
            'say', 'said', 'see', 'saw', 'know', 'knew', 'think', 'thought',
            'take', 'took', 'give', 'gave', 'make', 'made', 'find', 'found',
            'tell', 'told', 'ask', 'asked', 'try', 'tried', 'use', 'used',
            'work', 'worked', 'call', 'called', 'want', 'wanted', 'need', 'needed',
            'feel', 'felt', 'become', 'became', 'leave', 'left', 'put', 'turn',
            'turned', 'move', 'moved', 'like', 'look', 'looked', 'right', 'way',
            'new', 'first', 'last', 'long', 'good', 'great', 'little', 'own',
            'other', 'old', 'right', 'big', 'high', 'different', 'small', 'large',
            'next', 'early', 'young', 'important', 'few', 'public', 'bad', 'same',
            'able', 'um', 'uh', 'yeah', 'yes', 'no', 'okay', 'ok', 'well', 'so',
            'now', 'then', 'here', 'there', 'where', 'when', 'why', 'how', 'what',
            'who', 'which', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
            'her', 'its', 'our', 'their', 'me', 'you', 'him', 'her', 'us', 'them',
            'i', 'we', 'he', 'she', 'it', 'they'
        ]);
        return commonWords.has(word.toLowerCase());
    }

    updateWordCount() {
        this.elements.wordCount.textContent = this.wordIndex.size;
    }

    refreshWordIndex() {
        this.filterWordIndex();
    }

    filterWordIndex() {
        this.wordSearchTerm = this.elements.wordSearch.value.toLowerCase().trim();

        // Get filtered and sorted words
        const filteredWords = Array.from(this.wordIndex.keys())
            .filter(word => {
                return !this.wordSearchTerm || word.toLowerCase().includes(this.wordSearchTerm);
            })
            .sort((a, b) => a.localeCompare(b));

        // Clear current word list
        this.elements.wordList.innerHTML = '';

        if (filteredWords.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'word-list-placeholder';
            placeholder.textContent = this.wordSearchTerm ?
                'No words match your search...' :
                'Word index will appear here once transcript data is received...';
            this.elements.wordList.appendChild(placeholder);
            return;
        }

        // Create word items
        filteredWords.forEach(word => {
            const locations = this.wordIndex.get(word);
            this.createWordItem(word, locations);
        });
    }

    createWordItem(word, locations) {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';

        const wordText = document.createElement('div');
        wordText.className = 'word-text';
        wordText.textContent = word;

        const wordLocations = document.createElement('div');
        wordLocations.className = 'word-locations';

        // Sort locations by page and line
        const sortedLocations = locations.sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            return a.line - b.line;
        });

        sortedLocations.forEach(location => {
            const locationSpan = document.createElement('span');
            locationSpan.className = 'word-location';
            locationSpan.textContent = `P${location.page}:L${location.line}`;
            locationSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                this.jumpToLocation(location);
            });
            wordLocations.appendChild(locationSpan);
        });

        wordItem.appendChild(wordText);
        wordItem.appendChild(wordLocations);

        // Click on word item to jump to first occurrence
        wordItem.addEventListener('click', () => {
            if (sortedLocations.length > 0) {
                this.jumpToLocation(sortedLocations[0]);
            }
        });

        this.elements.wordList.appendChild(wordItem);
    }

    jumpToLocation(location) {
        // Clear any existing highlights first
        this.clearWordIndexHighlights();

        // Find the transcript item that contains text for the specified page and line
        const transcriptItems = this.elements.transcript.querySelectorAll('.transcript-item');
        let foundItem = null;
        let targetLineText = null;

        // Search through all transcript items to find one with matching page/line
        for (let i = 0; i < transcriptItems.length; i++) {
            const item = transcriptItems[i];
            const pageLineInfo = item.querySelector('.page-line-info');

            if (pageLineInfo) {
                const text = pageLineInfo.textContent;
                const match = text.match(/Page: (\d+), Line: (\d+)/);
                if (match) {
                    const page = parseInt(match[1]);
                    const line = parseInt(match[2]);
                    if (page === location.page && line === location.line) {
                        foundItem = item;
                        break;
                    }
                }
            }
        }

        // Also try to find by itemIndex if direct search didn't work
        if (!foundItem && location.itemIndex >= 0 && location.itemIndex < this.transcriptData.length) {
            const targetData = this.transcriptData[location.itemIndex];
            if (targetData && targetData.page === location.page && targetData.line === location.line) {
                // Find the corresponding displayed item
                const displayedItems = Array.from(transcriptItems);
                foundItem = displayedItems[location.itemIndex] || null;
            }
        }

        if (foundItem) {
            // Scroll to the item
            foundItem.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            this.highlightLineContent(foundItem);
        }
    }

    clearWordIndexHighlights() {
        // Remove all existing word-index highlights
        const highlightedElements = this.elements.transcript.querySelectorAll('.word-index-highlight');
        highlightedElements.forEach(element => {
            element.style.backgroundColor = '';
            element.classList.remove('word-index-highlight');
        });

        // Also clear any highlighted lines (both transcript items and content areas)
        const highlightedLines = this.elements.transcript.querySelectorAll('.highlighted-line');
        highlightedLines.forEach(line => {
            line.style.backgroundColor = '';
            line.classList.remove('highlighted-line');
        });

        // Clear background color from all transcript items that might have been highlighted
        const transcriptItems = this.elements.transcript.querySelectorAll('.transcript-item');
        transcriptItems.forEach(item => {
            if (item.style.backgroundColor === this.colors.currentWord || item.classList.contains('word-index-highlight')) {
                item.style.backgroundColor = '';
                item.classList.remove('word-index-highlight', 'highlighted-line');
            }
        });
    }

    highlightLineContent(transcriptItem) {
        const currentWordColor = this.colors.currentWord || '#ffeb3b';

        // Get the entire transcript item (not just content area)
        if (!transcriptItem) return;

        // Highlight the entire transcript item (including meta and content areas)
        transcriptItem.style.backgroundColor = currentWordColor;
        transcriptItem.classList.add('word-index-highlight', 'highlighted-line');

        // Also highlight the content area specifically for better visibility
        const contentArea = transcriptItem.querySelector('.item-content');
        if (contentArea) {
            contentArea.style.backgroundColor = currentWordColor;
            contentArea.classList.add('word-index-highlight');
        }

        // Remove highlight after 3 seconds
        setTimeout(() => {
            transcriptItem.style.backgroundColor = '';
            transcriptItem.classList.remove('word-index-highlight', 'highlighted-line');

            if (contentArea) {
                contentArea.style.backgroundColor = '';
                contentArea.classList.remove('word-index-highlight');
            }
        }, 3000);
    }

    clearWordIndex() {
        this.wordIndex.clear();
        this.updateWordCount();
        this.refreshWordIndex();
    }

    // Tab Management Functions
    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab appearance
        this.elements.indexTabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Show/hide tab content
        this.elements.indexTabContents.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // Refresh the active tab's content
        switch (tabName) {
            case 'words':
                this.refreshWordIndex();
                break;
            case 'annotations':
                this.refreshAnnotations();
                break;
            case 'keywords':
                this.refreshKeywords();
                break;
        }
    }

    // Annotation Management
    showAnnotationModal(selectedText = null, location = null) {
        this.selectedText = selectedText;
        this.selectedLocation = location;

        if (selectedText) {
            this.elements.modalContext.textContent = `Selected text: "${selectedText}"`;
        } else {
            this.elements.modalContext.textContent = 'General annotation for current transcript position';
        }

        this.elements.annotationText.value = '';
        this.elements.annotationModal.classList.add('show');
        this.elements.annotationText.focus();
    }

    hideAnnotationModal() {
        this.elements.annotationModal.classList.remove('show');
        this.selectedText = null;
        this.selectedLocation = null;
    }

    saveAnnotation(e) {
        e.preventDefault();
        const text = this.elements.annotationText.value.trim();
        if (!text) return;

        const annotation = {
            id: Date.now(),
            text: text,
            selectedText: this.selectedText,
            location: this.selectedLocation || this.getCurrentLocation(),
            timestamp: new Date(),
            page: this.getCurrentPage(),
            line: this.getCurrentLine()
        };

        this.annotations.push(annotation);
        this.updateAnnotationCount();
        this.refreshAnnotations();
        this.hideAnnotationModal();
        this.saveAnnotationsToStorage();
    }

    getCurrentLocation() {
        // Get current scroll position or last viewed item
        const items = this.elements.transcript.querySelectorAll('.transcript-item');
        if (items.length > 0) {
            const lastItem = items[items.length - 1];
            return {
                page: this.getCurrentPage(),
                line: this.getCurrentLine(),
                element: lastItem
            };
        }
        return null;
    }

    getCurrentPage() {
        return this.transcriptData.length > 0 ? this.transcriptData[this.transcriptData.length - 1].page : 0;
    }

    getCurrentLine() {
        return this.transcriptData.length > 0 ? this.transcriptData[this.transcriptData.length - 1].line : 0;
    }

    updateAnnotationCount() {
        this.elements.annotationCount.textContent = this.annotations.length;
    }

    refreshAnnotations() {
        this.filterAnnotations();
    }

    filterAnnotations() {
        const searchTerm = this.elements.annotationSearch.value.toLowerCase().trim();

        // Filter annotations
        const filteredAnnotations = this.annotations.filter(annotation => {
            return !searchTerm ||
                   annotation.text.toLowerCase().includes(searchTerm) ||
                   (annotation.selectedText && annotation.selectedText.toLowerCase().includes(searchTerm));
        });

        // Clear current annotation list
        this.elements.annotationList.innerHTML = '';

        if (filteredAnnotations.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'tab-list-placeholder';
            placeholder.textContent = searchTerm ?
                'No annotations match your search...' :
                'Click "+ Add Note" to create annotations or right-click on transcript text...';
            this.elements.annotationList.appendChild(placeholder);
            return;
        }

        // Create annotation items (sort by newest first)
        filteredAnnotations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach(annotation => {
                this.createAnnotationItem(annotation);
            });
    }

    createAnnotationItem(annotation) {
        const annotationItem = document.createElement('div');
        annotationItem.className = 'annotation-item';

        const header = document.createElement('div');
        header.className = 'annotation-header';

        const location = document.createElement('div');
        location.className = 'annotation-location';
        location.textContent = `P${annotation.page || 0}:L${annotation.line || 0}`;

        const timestamp = document.createElement('div');
        timestamp.className = 'annotation-timestamp';
        timestamp.textContent = new Date(annotation.timestamp).toLocaleString();

        header.appendChild(location);
        header.appendChild(timestamp);

        const content = document.createElement('div');
        content.className = 'annotation-content';
        content.textContent = annotation.text;

        const actions = document.createElement('div');
        actions.className = 'annotation-actions';

        const jumpBtn = document.createElement('button');
        jumpBtn.className = 'annotation-action';
        jumpBtn.textContent = 'Jump to Location';
        jumpBtn.addEventListener('click', () => {
            if (annotation.location) {
                this.jumpToLocation(annotation.location);
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'annotation-action delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            this.deleteAnnotation(annotation.id);
        });

        actions.appendChild(jumpBtn);
        actions.appendChild(deleteBtn);

        annotationItem.appendChild(header);
        annotationItem.appendChild(content);

        if (annotation.selectedText) {
            const context = document.createElement('div');
            context.className = 'annotation-context';
            context.textContent = `"${annotation.selectedText}"`;
            annotationItem.appendChild(context);
        }

        annotationItem.appendChild(actions);

        // Click to jump to location
        annotationItem.addEventListener('click', () => {
            if (annotation.location) {
                this.jumpToLocation(annotation.location);
            }
        });

        this.elements.annotationList.appendChild(annotationItem);
    }

    deleteAnnotation(id) {
        this.annotations = this.annotations.filter(annotation => annotation.id !== id);
        this.updateAnnotationCount();
        this.refreshAnnotations();
        this.saveAnnotationsToStorage();
    }

    handleTextSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && selection.toString().trim()) {
            const selectedText = selection.toString().trim();
            if (selectedText.length > 3) {
                // Show context menu or automatically show annotation modal
                // For now, we'll just store the selection
                this.lastSelection = {
                    text: selectedText,
                    location: this.getCurrentLocation()
                };
            }
        }
    }

    // Keyword Management
    showAddKeywordDialog() {
        const keyword = prompt('Enter a keyword to track:');
        if (keyword && keyword.trim()) {
            this.addKeyword(keyword.trim());
        }
    }

    addKeyword(keyword) {
        const normalizedKeyword = keyword.toLowerCase();
        if (!this.keywords.has(normalizedKeyword)) {
            this.keywords.set(normalizedKeyword, []);
        }

        // Search existing transcript for this keyword
        this.transcriptData.forEach((item, index) => {
            if (item.type === 'text' && item.content.toLowerCase().includes(normalizedKeyword)) {
                const keywordData = this.keywords.get(normalizedKeyword);
                keywordData.push({
                    page: item.page || 0,
                    line: item.line || 0,
                    itemIndex: index,
                    context: item.content.substring(0, 100),
                    timecode: item.timecode
                });
            }
        });

        this.updateKeywordCount();
        this.refreshKeywords();
        this.saveKeywordsToStorage();
    }

    updateKeywordCount() {
        this.elements.keywordCount.textContent = this.keywords.size;
    }

    refreshKeywords() {
        this.filterKeywords();
    }

    filterKeywords() {
        const searchTerm = this.elements.keywordSearch.value.toLowerCase().trim();

        // Get filtered keywords
        const filteredKeywords = Array.from(this.keywords.keys())
            .filter(keyword => {
                return !searchTerm || keyword.includes(searchTerm);
            })
            .sort();

        // Clear current keyword list
        this.elements.keywordList.innerHTML = '';

        if (filteredKeywords.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'tab-list-placeholder';
            placeholder.textContent = searchTerm ?
                'No keywords match your search...' :
                'Keywords will appear here once added or extracted from transcript...';
            this.elements.keywordList.appendChild(placeholder);
            return;
        }

        // Create keyword items
        filteredKeywords.forEach(keyword => {
            const keywordData = this.keywords.get(keyword);
            this.createKeywordItem(keyword, keywordData);
        });
    }

    createKeywordItem(keyword, keywordData) {
        const keywordItem = document.createElement('div');
        keywordItem.className = 'keyword-item';

        const keywordText = document.createElement('div');
        keywordText.className = 'keyword-text';
        keywordText.textContent = keyword;

        const keywordStats = document.createElement('div');
        keywordStats.className = 'keyword-stats';

        const countSpan = document.createElement('span');
        countSpan.className = 'keyword-count';
        countSpan.textContent = `${keywordData.length} occurrences`;

        keywordStats.appendChild(countSpan);

        keywordItem.appendChild(keywordText);
        keywordItem.appendChild(keywordStats);

        // Create occurrences list
        if (keywordData.length > 0) {
            const occurrences = document.createElement('div');
            occurrences.className = 'keyword-occurrences';

            keywordData.sort((a, b) => {
                if (a.page !== b.page) return a.page - b.page;
                return a.line - b.line;
            }).forEach(occurrence => {
                const occurrenceSpan = document.createElement('span');
                occurrenceSpan.className = 'keyword-occurrence';
                occurrenceSpan.textContent = `P${occurrence.page}:L${occurrence.line}`;
                occurrenceSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.jumpToLocation(occurrence);
                });
                occurrences.appendChild(occurrenceSpan);
            });

            keywordItem.appendChild(occurrences);
        }

        // Click on keyword to jump to first occurrence
        keywordItem.addEventListener('click', () => {
            if (keywordData.length > 0) {
                this.jumpToLocation(keywordData[0]);
            }
        });

        this.elements.keywordList.appendChild(keywordItem);
    }

    // Auto-detect keywords from transcript
    addToKeywordIndex(textData, itemIndex) {
        if (!textData.content || textData.type !== 'text') return;

        // Check existing keywords for matches
        this.keywords.forEach((locations, keyword) => {
            if (textData.content.toLowerCase().includes(keyword)) {
                const keywordData = this.keywords.get(keyword);
                keywordData.push({
                    page: textData.page || 0,
                    line: textData.line || 0,
                    itemIndex: itemIndex,
                    context: textData.content.substring(0, 100),
                    timecode: textData.timecode
                });
            }
        });

        if (this.activeTab === 'keywords') {
            this.refreshKeywords();
        }
    }

    // Storage functions
    saveAnnotationsToStorage() {
        try {
            localStorage.setItem('bridgeViewer_annotations', JSON.stringify(this.annotations));
        } catch (e) {
            console.warn('Could not save annotations to localStorage');
        }
    }

    loadAnnotationsFromStorage() {
        try {
            const stored = localStorage.getItem('bridgeViewer_annotations');
            if (stored) {
                this.annotations = JSON.parse(stored);
                this.updateAnnotationCount();
                this.refreshAnnotations();
            }
        } catch (e) {
            console.warn('Could not load annotations from localStorage');
        }
    }

    saveKeywordsToStorage() {
        try {
            const keywordsArray = Array.from(this.keywords.entries());
            localStorage.setItem('bridgeViewer_keywords', JSON.stringify(keywordsArray));
        } catch (e) {
            console.warn('Could not save keywords to localStorage');
        }
    }

    loadKeywordsFromStorage() {
        try {
            const stored = localStorage.getItem('bridgeViewer_keywords');
            if (stored) {
                const keywordsArray = JSON.parse(stored);
                this.keywords = new Map(keywordsArray);
                this.updateKeywordCount();
                this.refreshKeywords();
            }
        } catch (e) {
            console.warn('Could not load keywords from localStorage');
        }
    }

    // Original Word Index Management (restored)
    addToWordIndex(textData, itemIndex) {
        if (!textData.content || textData.type !== 'text') return;

        // Extract words from content (remove HTML tags and speaker labels first)
        const cleanContent = textData.content
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        if (!cleanContent) return;

        // Split into words, filter out short words and common words
        const words = cleanContent.toLowerCase()
            .split(/[^\w']+/)
            .filter(word => word.length >= 2 && !this.isCommonWord(word));

        words.forEach(word => {
            if (!this.wordIndex.has(word)) {
                this.wordIndex.set(word, []);
            }

            const locations = this.wordIndex.get(word);
            const location = {
                page: textData.page || 0,
                line: textData.line || 0,
                itemIndex: itemIndex,
                format: textData.format || 0
            };

            // Avoid duplicate locations
            const exists = locations.some(loc =>
                loc.page === location.page &&
                loc.line === location.line &&
                loc.itemIndex === location.itemIndex
            );

            if (!exists) {
                locations.push(location);
            }
        });

        // Update word count and refresh display
        this.updateWordCount();
        if (this.activeTab === 'words') {
            this.refreshWordIndex();
        }

        // Also add to keyword index
        this.addToKeywordIndex(textData, itemIndex);
    }

    isCommonWord(word) {
        const commonWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
            'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
            'can', 'do', 'does', 'did', 'get', 'got', 'go', 'went', 'come', 'came',
            'say', 'said', 'see', 'saw', 'know', 'knew', 'think', 'thought',
            'take', 'took', 'give', 'gave', 'make', 'made', 'find', 'found',
            'tell', 'told', 'ask', 'asked', 'try', 'tried', 'use', 'used',
            'work', 'worked', 'call', 'called', 'want', 'wanted', 'need', 'needed',
            'feel', 'felt', 'become', 'became', 'leave', 'left', 'put', 'turn',
            'turned', 'move', 'moved', 'like', 'look', 'looked', 'right', 'way',
            'new', 'first', 'last', 'long', 'good', 'great', 'little', 'own',
            'other', 'old', 'right', 'big', 'high', 'different', 'small', 'large',
            'next', 'early', 'young', 'important', 'few', 'public', 'bad', 'same',
            'able', 'um', 'uh', 'yeah', 'yes', 'no', 'okay', 'ok', 'well', 'so',
            'now', 'then', 'here', 'there', 'where', 'when', 'why', 'how', 'what',
            'who', 'which', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
            'her', 'its', 'our', 'their', 'me', 'you', 'him', 'her', 'us', 'them',
            'i', 'we', 'he', 'she', 'it', 'they'
        ]);
        return commonWords.has(word.toLowerCase());
    }

    updateWordCount() {
        this.elements.wordCount.textContent = this.wordIndex.size;
    }

    refreshWordIndex() {
        this.filterWordIndex();
    }

    filterWordIndex() {
        this.wordSearchTerm = this.elements.wordSearch.value.toLowerCase().trim();

        // Get filtered words
        const filteredWords = Array.from(this.wordIndex.keys())
            .filter(word => {
                return !this.wordSearchTerm || word.toLowerCase().includes(this.wordSearchTerm);
            });

        // Clear current word list
        this.elements.wordList.innerHTML = '';

        if (filteredWords.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'tab-list-placeholder';
            placeholder.textContent = this.wordSearchTerm ?
                'No words match your search...' :
                'Word index will appear here once transcript data is received...';
            this.elements.wordList.appendChild(placeholder);
            return;
        }

        // Group words by first letter
        const wordsByLetter = new Map();
        filteredWords.forEach(word => {
            const firstLetter = word.charAt(0).toUpperCase();
            if (!wordsByLetter.has(firstLetter)) {
                wordsByLetter.set(firstLetter, []);
            }
            wordsByLetter.get(firstLetter).push(word);
        });

        // Sort letters and create alphabetical sections
        const sortedLetters = Array.from(wordsByLetter.keys()).sort();

        sortedLetters.forEach(letter => {
            const words = wordsByLetter.get(letter).sort((a, b) => a.localeCompare(b));
            this.createAlphabetSection(letter, words);
        });

        // Update colors to match current speaker label color
        this.updateWordIndexColors();
    }

    createWordItem(word, locations) {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';

        const wordText = document.createElement('div');
        wordText.className = 'word-text';
        wordText.textContent = word;

        const wordLocations = document.createElement('div');
        wordLocations.className = 'word-locations';

        // Sort locations by page and line
        const sortedLocations = locations.sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            return a.line - b.line;
        });

        sortedLocations.forEach(location => {
            const locationSpan = document.createElement('span');
            locationSpan.className = 'word-location';
            locationSpan.textContent = `P${location.page}:L${location.line}`;
            locationSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                this.jumpToLocation(location);
            });
            wordLocations.appendChild(locationSpan);
        });

        wordItem.appendChild(wordText);
        wordItem.appendChild(wordLocations);

        // Click on word item to jump to first occurrence
        wordItem.addEventListener('click', () => {
            if (sortedLocations.length > 0) {
                this.jumpToLocation(sortedLocations[0]);
            }
        });

        return wordItem;
    }

    createAlphabetSection(letter, words) {
        const alphabetSection = document.createElement('div');
        alphabetSection.className = 'alphabet-section';

        const letterHeader = document.createElement('div');
        letterHeader.className = 'alphabet-header';

        const letterToggle = document.createElement('span');
        letterToggle.className = 'alphabet-toggle';
        letterToggle.textContent = '▶'; // Right arrow (collapsed by default)

        const letterText = document.createElement('span');
        letterText.className = 'alphabet-letter';
        letterText.textContent = letter;

        const wordCount = document.createElement('span');
        wordCount.className = 'alphabet-count';
        wordCount.textContent = `(${words.length})`;

        letterHeader.appendChild(letterToggle);
        letterHeader.appendChild(letterText);
        letterHeader.appendChild(wordCount);

        const wordsList = document.createElement('div');
        wordsList.className = 'alphabet-words collapsed'; // Start collapsed by default

        // Add words to the section
        words.forEach(word => {
            const locations = this.wordIndex.get(word);
            const wordItem = this.createWordItem(word, locations);
            wordsList.appendChild(wordItem);
        });

        // Toggle functionality
        letterHeader.addEventListener('click', () => {
            const isCollapsed = wordsList.classList.contains('collapsed');

            if (isCollapsed) {
                wordsList.classList.remove('collapsed');
                letterToggle.textContent = '▼'; // Down arrow (expanded)
            } else {
                wordsList.classList.add('collapsed');
                letterToggle.textContent = '▶'; // Right arrow (collapsed)
            }
        });

        alphabetSection.appendChild(letterHeader);
        alphabetSection.appendChild(wordsList);

        this.elements.wordList.appendChild(alphabetSection);
    }

    clearWordIndex() {
        this.wordIndex.clear();
        this.updateWordCount();
        this.refreshWordIndex();
    }

    updateWordIndexColors() {
        // Update word index colors to match current speaker label color
        const speakerColor = this.speakerLabelColor;

        // Calculate lighter and darker versions of the speaker color
        const lightColor = this.lightenColor(speakerColor, 0.9); // Very light for borders/backgrounds
        const darkColor = this.darkenColor(speakerColor, 0.15);  // Darker for hover states

        // Update CSS custom properties for word index
        document.documentElement.style.setProperty('--word-index-primary', speakerColor);
        document.documentElement.style.setProperty('--word-index-light', lightColor);
        document.documentElement.style.setProperty('--word-index-dark', darkColor);
        document.documentElement.style.setProperty('--word-index-hover-bg', this.lightenColor(speakerColor, 0.95));
    }

    // Helper function to lighten a hex color
    lightenColor(hex, percent) {
        // Remove the # if present
        hex = hex.replace(/^#/, '');

        // Parse the color
        const num = parseInt(hex, 16);
        const r = (num >> 16) + Math.round((255 - (num >> 16)) * percent);
        const g = ((num >> 8) & 0x00FF) + Math.round((255 - ((num >> 8) & 0x00FF)) * percent);
        const b = (num & 0x0000FF) + Math.round((255 - (num & 0x0000FF)) * percent);

        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    // Helper function to darken a hex color
    darkenColor(hex, percent) {
        // Remove the # if present
        hex = hex.replace(/^#/, '');

        // Parse the color
        const num = parseInt(hex, 16);
        const r = Math.round((num >> 16) * (1 - percent));
        const g = Math.round(((num >> 8) & 0x00FF) * (1 - percent));
        const b = Math.round((num & 0x0000FF) * (1 - percent));

        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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